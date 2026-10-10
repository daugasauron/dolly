// SPDX-License-Identifier: MIT
// icall: lets C code that calls functions through pointers of another type run as WebAssembly.
//
// GLib, GTK+ and GIMP call a function of one argument through a pointer to a function of two
// (every class and instance initializer, most signal handlers, g_list_foreach with g_free) and
// read or drop results the same way. A processor's calling convention lets that pass; WebAssembly
// checks the exact type at each call_indirect and traps. Dolly's cc has no pass that emulates it.
//
//   icall OBJECT...           rewrites each object file in place: every call_indirect of a type T
//                             becomes a call of the function __icall_T, which gets the function
//                             pointer as one more, last, argument;
//   icall --thunks OBJECT...  prints the C source of the __icall_T functions those objects call.
//
// A thunk calls the pointer directly when the function has the type T, and otherwise with the
// function's own type, as a register calling convention would (port/icall.c). A type is spelled
// as its parameters, "_", and its result: i, j, f, d for i32, i64, f32, f64, v for no result.
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define PREFIX "__icall_"
enum { SECTION_CUSTOM, SECTION_TYPE, SECTION_IMPORT, SECTION_ELEM = 9, SECTION_CODE = 10 };
enum { R_FUNCTION_INDEX_LEB = 0, R_TYPE_INDEX_LEB = 6, R_TABLE_NUMBER_LEB = 20 };
enum { SUBSECTION_COMDAT = 7, SUBSECTION_SYMBOLS = 8, SYMBOL_FUNCTION = 0, SYMBOL_DATA = 1, SYMBOL_SECTION = 3,
       SYMBOL_UNDEFINED = 0x10, SYMBOL_EXPLICIT_NAME = 0x40 };

static const char *path;

static void fail(const char *what) {
    fprintf(stderr, "icall: %s: %s\n", path, what);
    exit(1);
}

struct bytes { unsigned char *data; size_t size, capacity; };

static void put(struct bytes *out, const void *data, size_t size) {
    if (out->size + size > out->capacity) {
        out->capacity = (out->size + size) * 2;
        if (!(out->data = realloc(out->data, out->capacity))) fail("out of memory");
    }
    memcpy(out->data + out->size, data, size);
    out->size += size;
}

static void put_leb(struct bytes *out, uint64_t value) {
    do {
        unsigned char byte = (value & 0x7f) | (value > 0x7f ? 0x80 : 0);
        put(out, &byte, 1);
    } while (value >>= 7);
}

static void put_section(struct bytes *out, int id, const struct bytes *payload) {
    unsigned char byte = id;
    put(out, &byte, 1);
    put_leb(out, payload->size);
    put(out, payload->data, payload->size);
}

static uint64_t leb(const unsigned char **at) {
    uint64_t value = 0;
    for (int shift = 0;; shift += 7) {
        unsigned char byte = *(*at)++;
        value |= (uint64_t)(byte & 0x7f) << shift;
        if (!(byte & 0x80)) return value;
    }
}

// A relocation site holds a LEB padded to five bytes.
static void set_padded_leb(unsigned char *at, uint32_t value) {
    for (int i = 0; i < 5; i++) at[i] = ((value >> (7 * i)) & 0x7f) | (i < 4 ? 0x80 : 0);
}

struct section { int id; const unsigned char *payload; size_t size; const char *name; size_t name_size; };
struct object {
    struct bytes file;
    struct section sections[64], *type, *import, *elem, *code, *linking, *code_relocations;
    int section_count;
    char **types;           // each as "params_result"
    uint32_t type_count, function_imports;
};

static int named(const struct section *section, const char *name) {
    return section->id == SECTION_CUSTOM && section->name_size == strlen(name) && !memcmp(section->name, name, section->name_size);
}

static char value_type(unsigned char byte) {
    switch (byte) {
    case 0x7f: return 'i';
    case 0x7e: return 'j';
    case 0x7d: return 'f';
    case 0x7c: return 'd';
    }
    fail("a function type with a value that is no number");
    return 0;
}

static void skip_limits(const unsigned char **at) {
    uint64_t flags = leb(at);
    leb(at);
    if (flags & 1) leb(at);
}

static void read_object(struct object *object) {
    FILE *file = fopen(path, "rb");
    unsigned char chunk[65536];
    size_t count;
    if (!file) fail("cannot open");
    while ((count = fread(chunk, 1, sizeof(chunk), file))) put(&object->file, chunk, count);
    fclose(file);
    if (object->file.size < 8 || memcmp(object->file.data, "\0asm\1\0\0\0", 8)) fail("not a WebAssembly object");

    const unsigned char *at = object->file.data + 8, *end = object->file.data + object->file.size;
    while (at < end) {
        if (object->section_count == 64) fail("too many sections");
        struct section *section = &object->sections[object->section_count++];
        section->id = *at++;
        section->size = leb(&at);
        section->payload = at;
        at += section->size;
        if (section->id == SECTION_CUSTOM) {
            const unsigned char *name = section->payload;
            section->name_size = leb(&name);
            section->name = (const char *)name;
        }
        if (section->id == SECTION_TYPE) object->type = section;
        if (section->id == SECTION_IMPORT) object->import = section;
        if (section->id == SECTION_ELEM) object->elem = section;
        if (section->id == SECTION_CODE) object->code = section;
        if (named(section, "linking")) object->linking = section;
        if (named(section, "reloc.CODE")) object->code_relocations = section;
    }

    if (object->type) {
        at = object->type->payload;
        object->type_count = leb(&at);
        object->types = calloc(object->type_count, sizeof(char *));
        for (uint32_t i = 0; i < object->type_count; i++) {
            if (*at++ != 0x60) fail("a type that is no function type");
            uint32_t parameters = leb(&at);
            char *name = object->types[i] = malloc(parameters + 3);
            for (uint32_t j = 0; j < parameters; j++) name[j] = value_type(*at++);
            uint32_t results = leb(&at);
            if (results > 1) fail("a function type with more than one result");
            name[parameters] = '_';
            name[parameters + 1] = results ? value_type(*at++) : 'v';
            name[parameters + 2] = 0;
        }
    }
    if (object->import) {
        at = object->import->payload;
        for (uint32_t i = leb(&at); i; i--) {
            for (int name = 0; name < 2; name++) { uint32_t size = leb(&at); at += size; }
            switch (*at++) {
            case 0: leb(&at); object->function_imports++; break;
            case 1: at++; skip_limits(&at); break;
            case 2: skip_limits(&at); break;
            case 3: at += 2; break;
            case 4: at++; leb(&at); break;
            default: fail("an import of an unknown kind");
            }
        }
    }
}

// The name of each function import that is a thunk, through visit.
static void thunk_imports(const struct object *object, void (*visit)(const char *name, size_t size)) {
    if (!object->import) return;
    const unsigned char *at = object->import->payload;
    for (uint32_t i = leb(&at); i; i--) {
        uint32_t size = leb(&at);
        at += size;
        size = leb(&at);
        const char *name = (const char *)at;
        at += size;
        switch (*at++) {
        case 0: leb(&at); if (size > strlen(PREFIX) && !memcmp(name, PREFIX, strlen(PREFIX))) visit(name + strlen(PREFIX), size - strlen(PREFIX)); break;
        case 1: at++; skip_limits(&at); break;
        case 2: skip_limits(&at); break;
        case 3: at += 2; break;
        case 4: at++; leb(&at); break;
        }
    }
}

struct relocation { const unsigned char *entry; size_t entry_size; int type; uint32_t offset, index; };

static int has_addend(int type) {
    return (type >= 3 && type <= 5) || type == 8 || type == 9 || type == 11 || (type >= 14 && type <= 17) ||
           type == 21 || type == 22 || type == 23 || type == 25;
}

static void rewrite(void) {
    struct object object = { 0 };
    read_object(&object);
    if (!object.code || !object.code_relocations || !object.linking || !object.import) return;

    const unsigned char *at = object.code_relocations->payload + 1 + object.code_relocations->name_size;
    uint32_t target = leb(&at), relocation_count = leb(&at);
    struct relocation *relocations = calloc(relocation_count + 1, sizeof(*relocations));
    for (uint32_t i = 0; i < relocation_count; i++) {
        struct relocation *relocation = &relocations[i];
        relocation->entry = at;
        relocation->type = *at++;
        relocation->offset = leb(&at);
        relocation->index = leb(&at);
        if (has_addend(relocation->type)) leb(&at);
        relocation->entry_size = at - relocation->entry;
    }
    if (&object.sections[target] != object.code) fail("reloc.CODE is not for the code section");

    // One thunk for each type a call_indirect names.
    unsigned char *code = malloc(object.code->size);
    memcpy(code, object.code->payload, object.code->size);
    uint32_t *thunk_of_type = calloc(object.type_count, sizeof(uint32_t)), *thunk_types = NULL, thunks = 0;
    for (uint32_t i = 0; i < relocation_count; i++) {
        struct relocation *relocation = &relocations[i];
        if (relocation->type != R_TYPE_INDEX_LEB || code[relocation->offset - 1] != 0x11) continue;
        if (!thunk_of_type[relocation->index]) {
            thunk_types = realloc(thunk_types, (thunks + 1) * sizeof(uint32_t));
            thunk_types[thunks] = relocation->index;
            thunk_of_type[relocation->index] = ++thunks;
        }
    }
    if (!thunks) return;

    // The thunk of T has T's parameters and one i64 more; its type is appended unless the object has it.
    struct bytes type = { 0 }, import = { 0 };
    uint32_t type_count = object.type_count, *thunk_type_index = calloc(thunks, sizeof(uint32_t));
    for (uint32_t i = 0; i < thunks; i++) {
        const char *name = object.types[thunk_types[i]];
        size_t parameters = strlen(name) - 2;
        char *wanted = malloc(parameters + 4);
        sprintf(wanted, "%.*sj_%c", (int)parameters, name, name[parameters + 1]);
        uint32_t index = 0;
        while (index < object.type_count && strcmp(object.types[index], wanted)) index++;
        if (index == object.type_count) {
            static const char codes[] = "ijfd";
            unsigned char byte = 0x60;
            index = type_count++;
            put(&type, &byte, 1);
            put_leb(&type, parameters + 1);
            for (const char *c = wanted; *c != '_'; c++) { byte = 0x7f - (strchr(codes, *c) - codes); put(&type, &byte, 1); }
            byte = name[parameters + 1] != 'v';
            put(&type, &byte, 1);
            if (byte) { byte = 0x7f - (strchr(codes, name[parameters + 1]) - codes); put(&type, &byte, 1); }
        }
        thunk_type_index[i] = index;
        put_leb(&import, 3);
        put(&import, "env", 3);
        put_leb(&import, strlen(PREFIX) + strlen(name));
        put(&import, PREFIX, strlen(PREFIX));
        put(&import, name, strlen(name));
        put(&import, "", 1);
        put_leb(&import, index);
    }
    struct bytes new_type = { 0 }, new_import = { 0 };
    at = object.type->payload;
    leb(&at);
    put_leb(&new_type, type_count);
    put(&new_type, at, object.type->payload + object.type->size - at);
    put(&new_type, type.data, type.size);
    at = object.import->payload;
    uint32_t import_count = leb(&at);
    put_leb(&new_import, import_count + thunks);
    put(&new_import, at, object.import->payload + object.import->size - at);
    put(&new_import, import.data, import.size);

    // The new imports take the function indices after the old ones, so every defined function moves up:
    // in the symbol table, which also gets the thunks as undefined functions, and in the element segment.
    struct bytes new_linking = { 0 }, new_elem = { 0 };
    uint32_t *symbol_function = NULL, symbol_count = 0;
    at = object.linking->payload + 1 + object.linking->name_size;
    put(&new_linking, object.linking->payload, at - object.linking->payload);
    put_leb(&new_linking, leb(&at));
    while (at < object.linking->payload + object.linking->size) {
        int kind = *at++;
        uint32_t size = leb(&at);
        const unsigned char *end = at + size;
        struct bytes subsection = { 0 };
        if (kind == SUBSECTION_COMDAT) fail("COMDAT groups are not handled");
        if (kind != SUBSECTION_SYMBOLS) put(&subsection, at, size);
        else {
            symbol_count = leb(&at);
            symbol_function = calloc(symbol_count, sizeof(uint32_t));
            put_leb(&subsection, symbol_count + thunks);
            for (uint32_t i = 0; i < symbol_count; i++) {
                unsigned char symbol_kind = *at++;
                uint32_t flags = leb(&at);
                put(&subsection, &symbol_kind, 1);
                put_leb(&subsection, flags);
                const unsigned char *rest = at;
                if (symbol_kind == SYMBOL_DATA) {
                    uint32_t name = leb(&at);
                    at += name;
                    if (!(flags & SYMBOL_UNDEFINED)) { leb(&at); leb(&at); leb(&at); }
                } else if (symbol_kind == SYMBOL_SECTION) leb(&at);
                else {
                    uint32_t index = leb(&at);
                    if (symbol_kind == SYMBOL_FUNCTION) {
                        if (!(flags & SYMBOL_UNDEFINED)) index += thunks;
                        symbol_function[i] = index;
                        put_leb(&subsection, index);
                        rest = at;
                    }
                    if (!(flags & SYMBOL_UNDEFINED) || (flags & SYMBOL_EXPLICIT_NAME)) { uint32_t name = leb(&at); at += name; }
                }
                put(&subsection, rest, at - rest);
            }
            for (uint32_t i = 0; i < thunks; i++) {
                put(&subsection, "\0\x10", 2);
                put_leb(&subsection, object.function_imports + i);
            }
        }
        unsigned char byte = kind;
        put(&new_linking, &byte, 1);
        put_leb(&new_linking, subsection.size);
        put(&new_linking, subsection.data, subsection.size);
        at = end;
    }
    if (!symbol_function) fail("no symbol table");
    if (object.elem) {
        at = object.elem->payload;
        uint32_t segments = leb(&at);
        put_leb(&new_elem, segments);
        while (segments--) {
            const unsigned char *start = at;
            uint32_t flags = leb(&at);
            if (flags != 0 && flags != 2) fail("an element segment of an unknown form");
            if (flags == 2) leb(&at);
            while (*at != 0x0b) { at++; leb(&at); }
            at += 1 + (flags == 2);
            put(&new_elem, start, at - start);
            uint32_t functions = leb(&at);
            put_leb(&new_elem, functions);
            while (functions--) {
                uint32_t index = leb(&at);
                put_leb(&new_elem, index < object.function_imports ? index : index + thunks);
            }
        }
    }

    // The calls themselves, and what the object's relocations say of them.
    struct bytes new_relocations = { 0 }, entries = { 0 };
    uint32_t kept = 0;
    for (uint32_t i = 0; i < relocation_count; i++) {
        struct relocation *relocation = &relocations[i];
        unsigned char *site = code + relocation->offset;
        if (relocation->type == R_FUNCTION_INDEX_LEB) set_padded_leb(site, symbol_function[relocation->index]);
        if (relocation->type != R_TYPE_INDEX_LEB || site[-1] != 0x11) {
            put(&entries, relocation->entry, relocation->entry_size);
            kept++;
            continue;
        }
        uint32_t thunk = thunk_of_type[relocation->index] - 1;
        site[-1] = 0x10;
        set_padded_leb(site, object.function_imports + thunk);
        if (relocations[i + 1].type == R_TABLE_NUMBER_LEB && relocations[i + 1].offset == relocation->offset + 5) {
            memset(site + 5, 0x01, 5);
            i++;
        } else if (site[5] == 0) site[5] = 0x01;
        else fail("a call_indirect without a table");
        unsigned char byte = R_FUNCTION_INDEX_LEB;
        put(&entries, &byte, 1);
        put_leb(&entries, relocation->offset);
        put_leb(&entries, symbol_count + thunk);
        kept++;
    }
    put(&new_relocations, object.code_relocations->payload, 1 + object.code_relocations->name_size);
    put_leb(&new_relocations, target);
    put_leb(&new_relocations, kept);
    put(&new_relocations, entries.data, entries.size);

    struct bytes out = { 0 }, new_code = { code, object.code->size, 0 };
    put(&out, object.file.data, 8);
    for (int i = 0; i < object.section_count; i++) {
        struct section *section = &object.sections[i];
        struct bytes same = { (unsigned char *)section->payload, section->size, 0 };
        put_section(&out, section->id, section == object.type ? &new_type : section == object.import ? &new_import :
                    section == object.elem ? &new_elem : section == object.code ? &new_code :
                    section == object.linking ? &new_linking : section == object.code_relocations ? &new_relocations : &same);
    }
    FILE *file = fopen(path, "wb");
    if (!file || fwrite(out.data, 1, out.size, file) != out.size || fclose(file)) fail("cannot write");
}

static char **names;
static size_t name_count;

static void add_name(const char *name, size_t size) {
    for (size_t i = 0; i < name_count; i++) if (strlen(names[i]) == size && !memcmp(names[i], name, size)) return;
    names = realloc(names, (name_count + 1) * sizeof(char *));
    names[name_count] = calloc(size + 1, 1);
    memcpy(names[name_count++], name, size);
}

static int by_name(const void *a, const void *b) {
    return strcmp(*(char *const *)a, *(char *const *)b);
}

static const char *c_type(char type) {
    return type == 'i' ? "int" : type == 'j' ? "long" : type == 'f' ? "float" : type == 'd' ? "double" : "void";
}

// "(int (*)(long, long))" for "jj_i".
static void print_cast(const char *name) {
    const char *result = strchr(name, '_') + 1;
    printf("(%s (*)(", c_type(*result));
    for (const char *c = name; *c != '_'; c++) printf("%s%s", c == name ? "" : ", ", c_type(*c));
    printf("%s))", *name == '_' ? "void" : "");
}

static void print_thunks(void) {
    qsort(names, name_count, sizeof(char *), by_name);
    printf("/* Generated by icall --thunks: do not edit. */\n#include \"icall.h\"\n");
    for (size_t n = 0; n < name_count; n++) {
        const char *name = names[n], *result = strchr(name, '_') + 1;
        int parameters = result - 1 - name;
        // A function of the type, for its type index in the linked program; the call of a pointer with the
        // type from argument slots; and the thunk.
        printf("\nstatic %s probe_%s(", c_type(*result), name);
        for (int i = 0; i < parameters; i++) printf("%s%s a%d", i ? ", " : "", c_type(name[i]), i);
        printf("%s) { %s }\n", parameters ? "" : "void", *result == 'v' ? "" : "return 0;");
        printf("static unsigned long call_%s(unsigned long function, const unsigned long *a) { ", name);
        if (*result != 'v') printf("return icall_from_%c(", *result);
        printf("(");
        print_cast(name);
        printf("function)(");
        for (int i = 0; i < parameters; i++) printf("%sicall_to_%c(a[%d])", i ? ", " : "", name[i], i);
        printf(")%s; %s}\n", *result == 'v' ? "" : ")", *result == 'v' ? "return 0; " : "");
        printf("static unsigned short type_%s;\n", name);
        printf("%s " PREFIX "%s(", c_type(*result), name);
        for (int i = 0; i < parameters; i++) printf("%s a%d, ", c_type(name[i]), i);
        printf("unsigned long function) {\n    if (function < icall_slots && icall_types[function] == type_%s) ", name);
        printf("%s(", *result == 'v' ? "" : "return ");
        print_cast(name);
        printf("function)(");
        for (int i = 0; i < parameters; i++) printf("%sa%d", i ? ", " : "", i);
        printf(");\n    else {\n        unsigned long a[] = { ");
        for (int i = 0; i < parameters; i++) printf("icall_from_%c(a%d), ", name[i], i);
        printf("0 };\n        ");
        if (*result != 'v') printf("return icall_to_%c(", *result);
        printf("icall_adapt(function, \"%s\", a)%s;\n    }\n}\n", name, *result == 'v' ? "" : ")");
    }
    printf("\nconst struct icall_signature icall_signatures[] = {\n");
    for (size_t n = 0; n < name_count; n++)
        printf("    { \"%s\", call_%s, (unsigned long)probe_%s, &type_%s },\n", names[n], names[n], names[n], names[n]);
    printf("    { 0 }\n};\n");
}

int main(int argc, char **argv) {
    int thunks = argc > 1 && !strcmp(argv[1], "--thunks");
    if (argc < 2 + thunks) {
        fprintf(stderr, "usage: icall OBJECT...\n       icall --thunks OBJECT...\n");
        return 64;
    }
    for (int i = 1 + thunks; i < argc; i++) {
        path = argv[i];
        if (!thunks) rewrite();
        else if (strncmp(path, "--type=", 7)) {
            struct object object = { 0 };
            read_object(&object);
            thunk_imports(&object, add_name);
            free(object.file.data);
        } else add_name(path + 7, strlen(path + 7));
    }
    if (thunks) print_thunks();
    return 0;
}
