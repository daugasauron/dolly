/* SPDX-License-Identifier: LGPL-2.1-or-later
 * winebuild for wasm64 Dolly: a module's description as C instead of
 * assembly (dolly-image.h). Modules are linked into one program, so there
 * are no import thunks: an import only names a module to load first.
 *
 * A wasm function pointer carries its exact type, and a spec file has no
 * return types, so the prototypes of exported functions are read from the
 * objects that define them (the wasm object symbol table).
 *
 *   winebuild --dll|--exe -E module.spec -F module.dll -o module.spec.c
 *       OBJECT.o|ARCHIVE.a... RESOURCE.res... [NAMES.imports]
 */
#include "config.h"

#include <ctype.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "build.h"

struct symbol
{
    char *name;
    int   is_func;
    int   next;                      /* next symbol of the hash chain, plus one */
    char  type[256];                 /* parameters, ':', result; "ij:v" is void f(int, long long) */
};

#define HASH_SIZE 16381
static struct symbol *symbols;
static unsigned int nb_symbols, symbols_size;
static int symbol_hash[HASH_SIZE];

static const unsigned char *in, *in_end;

static unsigned long long leb(void)
{
    unsigned long long value = 0;
    unsigned int shift = 0;
    while (in < in_end)
    {
        unsigned char byte = *in++;
        value |= (unsigned long long)(byte & 0x7f) << shift;
        shift += 7;
        if (!(byte & 0x80)) break;
    }
    return value;
}

static char *leb_name(void)
{
    size_t len = leb();
    char *name = xmalloc( len + 1 );
    if (len > in_end - in) fatal_error( "truncated wasm object\n" );
    memcpy( name, in, len );
    name[len] = 0;
    in += len;
    return name;
}

static void skip_limits(void)
{
    unsigned int flags = leb();
    leb();
    if (flags & 1) leb();
}

static char value_type( unsigned char byte )
{
    switch (byte)
    {
    case 0x7f: return 'i';
    case 0x7e: return 'j';
    case 0x7d: return 'f';
    case 0x7c: return 'd';
    default: return '?';  /* a type no C prototype of ours names */
    }
}

static unsigned int hash_name( const char *name )
{
    unsigned int hash = 5381;
    while (*name) hash = hash * 33 + (unsigned char)*name++;
    return hash % HASH_SIZE;
}

static struct symbol *find_symbol( const char *name )
{
    int i;
    for (i = symbol_hash[hash_name( name )]; i; i = symbols[i - 1].next)
        if (!strcmp( symbols[i - 1].name, name )) return &symbols[i - 1];
    return NULL;
}

static void add_symbol( char *name, int is_func, const char *type )
{
    struct symbol *symbol;
    unsigned int hash = hash_name( name );

    if (find_symbol( name )) return;
    if (nb_symbols == symbols_size)
    {
        symbols_size = symbols_size ? symbols_size * 2 : 1024;
        symbols = xrealloc( symbols, symbols_size * sizeof(*symbols) );
    }
    symbol = &symbols[nb_symbols++];
    symbol->name = name;
    symbol->is_func = is_func;
    symbol->next = symbol_hash[hash];
    symbol_hash[hash] = nb_symbols;
    strcpy( symbol->type, type ? type : "" );
}

/* the global symbols a wasm object defines, with the type of each function */
static void read_wasm_object( const unsigned char *data, size_t size, const char *filename )
{
    char **types = NULL;
    unsigned int nb_types = 0, nb_imports = 0, nb_funcs = 0, i, j, count;
    unsigned int *import_types = NULL, *func_types = NULL;
    const unsigned char *end = data + size, *symtab = NULL, *symtab_end = NULL;

    if (size < 8 || memcmp( data, "\0asm", 4 )) return;
    in = data + 8;
    in_end = end;
    while (in < end)
    {
        unsigned int id;
        size_t len;
        const unsigned char *next;

        in_end = end;
        id = *in++;
        len = leb();
        next = in + len;
        in_end = next;
        switch (id)
        {
        case 1:  /* types */
            nb_types = leb();
            types = xmalloc( nb_types * sizeof(*types) );
            for (i = 0; i < nb_types; i++)
            {
                char *p = types[i] = xmalloc( 256 );
                if (*in++ != 0x60) fatal_error( "%s: unsupported wasm type section\n", filename );
                if ((count = leb()) > 200) fatal_error( "%s: too many parameters\n", filename );
                for (j = 0; j < count; j++) *p++ = value_type( *in++ );
                *p++ = ':';
                count = leb();
                if (!count) *p++ = 'v';
                else if (count == 1) *p++ = value_type( *in++ );
                else { *p++ = '?'; in += count; }
                *p = 0;
            }
            break;
        case 2:  /* imports */
            count = leb();
            import_types = xmalloc( (count + 1) * sizeof(*import_types) );
            for (i = 0; i < count; i++)
            {
                free( leb_name() );
                free( leb_name() );
                switch (*in++)
                {
                case 0: import_types[nb_imports++] = leb(); break;
                case 1: in++; skip_limits(); break;
                case 2: skip_limits(); break;
                case 3: in += 2; break;
                case 4: in++; leb(); break;
                default: fatal_error( "%s: unsupported wasm import\n", filename );
                }
            }
            break;
        case 3:  /* functions */
            nb_funcs = leb();
            func_types = xmalloc( (nb_funcs + 1) * sizeof(*func_types) );
            for (i = 0; i < nb_funcs; i++) func_types[i] = leb();
            break;
        case 0:  /* custom */
        {
            char *name = leb_name();
            if (!strcmp( name, "linking" ))
            {
                leb();  /* version */
                while (in < next)
                {
                    unsigned int type = *in++;
                    size_t sub_len = leb();
                    if (type == 8) { symtab = in; symtab_end = in + sub_len; }
                    in += sub_len;
                }
            }
            free( name );
            break;
        }
        }
        in = next;
    }
    if (!symtab) return;

    in = symtab;
    in_end = symtab_end;
    for (count = leb(), i = 0; i < count; i++)
    {
        unsigned int kind = *in++, flags = leb(), index;
        int undefined = flags & 0x10, local = flags & 2;
        char *name = NULL;

        switch (kind)
        {
        case 0:  /* function */
            index = leb();
            if (!undefined || (flags & 0x40)) name = leb_name();
            if (undefined || local) break;
            if (index < nb_imports || index - nb_imports >= nb_funcs || func_types[index - nb_imports] >= nb_types)
                fatal_error( "%s: bad function symbol %s\n", filename, name );
            add_symbol( name, 1, types[func_types[index - nb_imports]] );
            name = NULL;
            break;
        case 1:  /* data */
            name = leb_name();
            if (undefined) break;
            leb(); leb(); leb();
            if (!local) { add_symbol( name, 0, NULL ); name = NULL; }
            break;
        case 3:  /* section */
            leb();
            break;
        default:  /* global, tag, table */
            leb();
            if (!undefined || (flags & 0x40)) name = leb_name();
            break;
        }
        free( name );
    }
    for (i = 0; i < nb_types; i++) free( types[i] );
    free( types );
    free( import_types );
    free( func_types );
}

static void read_symbols( const char *filename )
{
    const unsigned char *data;
    size_t size, pos;

    init_input_buffer( filename );
    data = input_buffer;
    size = input_buffer_size;
    if (size < 8 || memcmp( data, "!<arch>\n", 8 ))
    {
        read_wasm_object( data, size, filename );
        return;
    }
    for (pos = 8; pos + 60 <= size; )
    {
        size_t member = strtoul( (const char *)data + pos + 48, NULL, 10 );
        pos += 60;
        if (member > size - pos) fatal_error( "%s: truncated archive\n", filename );
        read_wasm_object( data + pos, member, filename );
        pos += (member + 1) & ~(size_t)1;
    }
}

static const char *c_type( char type )
{
    switch (type)
    {
    case 'i': return "int";
    case 'j': return "long long";
    case 'f': return "float";
    case 'd': return "double";
    case 'v': return "void";
    default: return NULL;
    }
}

/* declare a symbol with the type its definition has */
static int output_declaration( const char *name )
{
    const struct symbol *symbol = find_symbol( name );
    const char *p, *result;

    if (!symbol) return 0;
    if (!symbol->is_func)
    {
        output( "extern char %s[];\n", name );
        return 1;
    }
    result = strchr( symbol->type, ':' ) + 1;
    if (strchr( symbol->type, '?' )) return 0;
    output( "extern %s %s(", c_type( *result ), name );
    if (symbol->type[0] == ':') output( "void" );
    for (p = symbol->type; *p != ':'; p++) output( "%s%s", p == symbol->type ? "" : ", ", c_type( *p ) );
    output( ");\n" );
    return 1;
}

static int ends_with( const char *str, const char *suffix )
{
    size_t len = strlen( str ), suffix_len = strlen( suffix );
    return len >= suffix_len && !strcmp( str + len - suffix_len, suffix );
}

static void output_string_bytes( const unsigned char *data, size_t size )
{
    size_t i;
    for (i = 0; i < size; i++)
    {
        if (!(i % 32)) output( "%s        \"", i ? "\"\n" : "" );
        output( "\\%03o", data[i] );
    }
    if (size) output( "\"" );
}

void output_dolly_module( DLLSPEC *spec, char **argv )
{
    int i, nb_funcs = spec->base <= spec->limit ? spec->limit - spec->base + 1 : 0;
    unsigned int nb_imports = 0, strings_size, *name_offsets, *forward_offsets, *import_offsets;
    char **imports = NULL, *strings, *entry = NULL, *declared, *p;
    const char *kind = (spec->characteristics & IMAGE_FILE_DLL) ? "DllMain" : "main";
    unsigned char *resources = NULL;
    size_t resources_size = 0;
    char *prefix = xstrdup( spec->file_name );

    /* the module's name as the C prefix its sources were compiled with */
    if (ends_with( prefix, ".dll" )) prefix[strlen( prefix ) - 4] = 0;
    prefix = make_c_identifier( prefix );

    for (; *argv; argv++)
    {
        char *text, *name;

        if (!ends_with( *argv, ".imports" ))
        {
            read_symbols( *argv );
            continue;
        }
        /* the word imports: and the modules to load before this one */
        init_input_buffer( *argv );
        text = xmalloc( input_buffer_size + 1 );
        memcpy( text, input_buffer, input_buffer_size );
        text[input_buffer_size] = 0;
        for (name = strtok( text, " \t\r\n" ); name; name = strtok( NULL, " \t\r\n" ))
        {
            if (!strcmp( name, "imports:" )) continue;
            imports = xrealloc( imports, (nb_imports + 1) * sizeof(*imports) );
            imports[nb_imports++] = name;
        }
    }

    if (spec->nb_resources)
    {
        output_bin_resources( spec, 0x1000 );
        resources = output_buffer;
        resources_size = output_buffer_pos;
    }

    /* strings: the module name, export names, forwards, import names */
    strings_size = strlen( spec->file_name ) + 1;
    name_offsets = xmalloc( (spec->nb_names + 1) * sizeof(*name_offsets) );
    forward_offsets = xmalloc( (nb_funcs + 1) * sizeof(*forward_offsets) );
    import_offsets = xmalloc( (nb_imports + 1) * sizeof(*import_offsets) );
    for (i = 0; i < spec->nb_names; i++) strings_size += strlen( spec->names[i]->name ) + 1;
    for (i = 0; i < nb_funcs; i++)
    {
        const ORDDEF *odp = spec->ordinals[spec->base + i];
        if (odp && (odp->flags & FLAG_FORWARD)) strings_size += strlen( odp->link_name ) + 1;
    }
    for (i = 0; i < nb_imports; i++) strings_size += strlen( imports[i] ) + 1;
    p = strings = xmalloc( strings_size );
    strcpy( p, spec->file_name );
    p += strlen( p ) + 1;
    for (i = 0; i < spec->nb_names; i++)
    {
        name_offsets[i] = p - strings;
        strcpy( p, spec->names[i]->name );
        p += strlen( p ) + 1;
    }
    for (i = 0; i < nb_funcs; i++)
    {
        const ORDDEF *odp = spec->ordinals[spec->base + i];
        if (!odp || !(odp->flags & FLAG_FORWARD)) continue;
        forward_offsets[i] = p - strings;
        strcpy( p, odp->link_name );
        p += strlen( p ) + 1;
    }
    for (i = 0; i < nb_imports; i++)
    {
        import_offsets[i] = p - strings;
        strcpy( p, imports[i] );
        p += strlen( p ) + 1;
    }

    output( "/* File generated automatically from %s; do not edit! */\n\n", spec->src_name ? spec->src_name : spec->file_name );
    output( "#include \"dolly-image.h\"\n\n" );

    /* which exports this module can hand out: what its objects define with a nameable type */
    declared = xmalloc( nb_funcs + 1 );
    for (i = 0; i < nb_funcs; i++)
    {
        const ORDDEF *odp = spec->ordinals[spec->base + i];
        int j;

        declared[i] = 0;
        if (!odp || (odp->flags & (FLAG_FORWARD | FLAG_REGISTER))) continue;
        switch (odp->type)
        {
        case TYPE_VARIABLE:
            output( "static unsigned int %s[%d] = {", odp->link_name, odp->u.var.n_values ? odp->u.var.n_values : 1 );
            for (j = 0; j < odp->u.var.n_values; j++) output( "%s0x%08x", j ? ", " : " ", odp->u.var.values[j] );
            output( " };\n" );
            declared[i] = 1;
            break;
        case TYPE_EXTERN:
        case TYPE_STDCALL:
        case TYPE_CDECL:
        case TYPE_VARARGS:
        case TYPE_THISCALL:
            for (j = 0; j < i; j++)
            {
                const ORDDEF *other = spec->ordinals[spec->base + j];
                if (declared[j] && other->type != TYPE_VARIABLE && !strcmp( other->link_name, odp->link_name )) break;
            }
            declared[i] = j < i ? 1 : output_declaration( odp->link_name );
            if (!declared[i]) warning( "%s: no definition of %s to export\n", spec->file_name, odp->link_name );
            break;
        default:
            break;
        }
    }

    entry = strmake( "%s_%s", prefix, kind );
    if (!(spec->characteristics & IMAGE_FILE_DLL))
    {
        /* what winecrt0's exe_entry.c does, with the type kernel32 calls it by */
        char *wide = strmake( "%s_wmain", prefix );
        const struct symbol *symbol = find_symbol( wide );
        const char *args = "__wine_main_argc, __wine_main_wargv";

        if (!symbol) { symbol = find_symbol( entry ); args = "__wine_main_argc, __wine_main_argv"; }
        if (!symbol || !symbol->is_func) fatal_error( "%s: neither %s nor %s is defined\n", spec->file_name, entry, wide );
        if (!strcmp( symbol->type, ":i" )) args = "";
        else if (strcmp( symbol->type, "ij:i" )) fatal_error( "%s: unsupported type of %s\n", spec->file_name, symbol->name );
        output( "extern int __wine_main_argc;\nextern char **__wine_main_argv;\nextern unsigned short **__wine_main_wargv;\n" );
        output( "extern int %s( %s );\nextern void ExitProcess( unsigned int );\n", symbol->name, *args ? "int, void *" : "void" );
        output( "static unsigned int module_entry( void *peb )\n{\n" );
        output( "    ExitProcess( %s( %s ) );\n    return 0;\n}\n", symbol->name, args );
        entry = xstrdup( "module_entry" );
    }
    else if (find_symbol( entry )) output( "extern int %s( void *, unsigned int, void * );\n", entry );
    else entry = NULL;

    output( "\nstatic struct image\n{\n" );
    output( "    struct dolly_image_header header;\n" );
    output( "    char resources[%u];\n", (unsigned int)((resources_size + 7) & ~7) + 8 );
    output( "    struct dolly_export_directory exports;\n" );
    output( "    uint32_t functions[%d];\n", nb_funcs + 1 );
    output( "    uint32_t names[%d];\n", spec->nb_names + 1 );
    output( "    uint16_t ordinals[%d];\n", spec->nb_names + 1 );
    output( "    char strings[%u];\n", strings_size );
    output( "    void *slots[%d];\n", nb_funcs + 1 );
    output( "    void *entry;\n" );
    output( "    struct dolly_import_descriptor imports[%u];\n", nb_imports + 1 );
    output( "    uint64_t no_thunk;\n" );
    output( "} __attribute__((aligned(0x10000))) image =\n{\n" );

    output( "    .header =\n    {\n" );
    output( "        .dos = { .e_magic = 0x5a4d, .e_lfanew = 64 },\n" );
    output( "        .nt =\n        {\n" );
    output( "            .Signature = 0x4550,\n" );
    output( "            .FileHeader = { .NumberOfSections = 1, .SizeOfOptionalHeader = 240, .Characteristics = 0x%04x },\n",
            spec->characteristics );
    output( "            .OptionalHeader =\n            {\n" );
    output( "                .Magic = 0x20b,\n" );
    if (entry) output( "                .AddressOfEntryPoint = offsetof(struct image, entry),\n" );
    output( "                .ImageBase = (uint64_t)&image,\n" );
    output( "                .SectionAlignment = 0x10000,\n" );
    output( "                .FileAlignment = 0x10000,\n" );
    output( "                .MajorOperatingSystemVersion = 1,\n" );
    output( "                .MajorSubsystemVersion = %u,\n", spec->subsystem_major );
    output( "                .MinorSubsystemVersion = %u,\n", spec->subsystem_minor );
    output( "                .SizeOfImage = sizeof(struct image),\n" );
    output( "                .SizeOfHeaders = 0x1000,\n" );
    output( "                .Subsystem = %u,\n", spec->subsystem );
    output( "                .DllCharacteristics = 0x%04x,\n", spec->dll_characteristics );
    output( "                .SizeOfStackReserve = %u,\n", (spec->stack_size ? spec->stack_size : 1024) * 1024 );
    output( "                .SizeOfStackCommit = 0x10000,\n" );
    output( "                .SizeOfHeapReserve = %u,\n", (spec->heap_size ? spec->heap_size : 1024) * 1024 );
    output( "                .SizeOfHeapCommit = 0x10000,\n" );
    output( "                .NumberOfRvaAndSizes = 16,\n" );
    output( "                .DataDirectory =\n                {\n" );
    if (nb_funcs)
        output( "                    [0] = { offsetof(struct image, exports), offsetof(struct image, slots) - offsetof(struct image, exports) },\n" );
    if (nb_imports)
        output( "                    [1] = { offsetof(struct image, imports), sizeof(((struct image *)0)->imports) },\n" );
    if (resources_size)
        output( "                    [2] = { offsetof(struct image, resources), %u },\n", (unsigned int)resources_size );
    output( "                },\n            },\n        },\n" );
    output( "        .section = { .Name = \".data\", .VirtualSize = sizeof(struct image) - 0x1000, .VirtualAddress = 0x1000,\n" );
    output( "                     .SizeOfRawData = sizeof(struct image) - 0x1000, .PointerToRawData = 0x1000, .Characteristics = 0xc0000040 },\n" );
    output( "    },\n" );

    if (resources_size)
    {
        output( "    .resources =\n" );
        output_string_bytes( resources, resources_size );
        output( ",\n" );
    }

    if (nb_funcs)
    {
        output( "    .exports =\n    {\n" );
        output( "        .Name = offsetof(struct image, strings),\n" );
        output( "        .Base = %d,\n        .NumberOfFunctions = %d,\n        .NumberOfNames = %d,\n", spec->base, nb_funcs, spec->nb_names );
        output( "        .AddressOfFunctions = offsetof(struct image, functions),\n" );
        output( "        .AddressOfNames = offsetof(struct image, names),\n" );
        output( "        .AddressOfNameOrdinals = offsetof(struct image, ordinals),\n    },\n" );
        output( "    .functions =\n    {\n" );
        for (i = 0; i < nb_funcs; i++)
        {
            const ORDDEF *odp = spec->ordinals[spec->base + i];
            if (odp && (odp->flags & FLAG_FORWARD))
                output( "        [%d] = offsetof(struct image, strings) + %u,\n", i, forward_offsets[i] );
            else if (declared[i])
                output( "        [%d] = offsetof(struct image, slots) + %d * sizeof(void *),\n", i, i );
        }
        output( "    },\n    .names =\n    {\n" );
        for (i = 0; i < spec->nb_names; i++) output( "        offsetof(struct image, strings) + %u,\n", name_offsets[i] );
        output( "    },\n    .ordinals =\n    {\n" );
        for (i = 0; i < spec->nb_names; i++) output( "        %d,\n", spec->names[i]->ordinal - spec->base );
        output( "    },\n    .slots =\n    {\n" );
        for (i = 0; i < nb_funcs; i++)
            if (declared[i]) output( "        [%d] = (void *)%s,\n", i, spec->ordinals[spec->base + i]->link_name );
        output( "    },\n" );
    }
    output( "    .strings =\n" );
    output_string_bytes( (const unsigned char *)strings, strings_size );
    output( ",\n" );
    if (entry) output( "    .entry = (void *)%s,\n", entry );
    if (nb_imports)
    {
        output( "    .imports =\n    {\n" );
        for (i = 0; i < nb_imports; i++)
            output( "        { .OriginalFirstThunk = offsetof(struct image, no_thunk), .Name = offsetof(struct image, strings) + %u, "
                    ".FirstThunk = offsetof(struct image, no_thunk) },\n", import_offsets[i] );
        output( "    },\n" );
    }
    output( "};\n\n" );
    output( "__attribute__((constructor)) static void register_module(void)\n{\n" );
    output( "    __wine_dll_register( &image, \"%s\" );\n}\n", spec->file_name );
}
