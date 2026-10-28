/* lean-symbols ARCHIVE... writes C for the table lean_dolly_symbol looks up:
 * every function and data symbol of the WebAssembly objects in the archives
 * that is defined, global and of default visibility, which is what -rdynamic
 * would export. Lean's interpreter finds compiled code by these names
 * (lean-dolly.patch). A function is declared with the signature its object
 * gives it, so that taking its address takes the function itself. */
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

enum { FLAG_LOCAL = 0x2, FLAG_HIDDEN = 0x4, FLAG_UNDEFINED = 0x10, FLAG_EXPLICIT_NAME = 0x40,
       FLAG_TLS = 0x100 };
enum { KIND_FUNCTION = 0, KIND_DATA = 1, KIND_GLOBAL = 2, KIND_SECTION = 3, KIND_TAG = 4, KIND_TABLE = 5 };

typedef struct { char *name; char *declaration; } symbol;
static symbol *symbols;
static size_t symbol_count, symbol_capacity;

static void fail(const char *what, const char *file) {
  fprintf(stderr, "lean-symbols: %s: %s\n", file, what);
  exit(1);
}

typedef struct { const unsigned char *at, *end; const char *file; } reader;

static uint64_t uleb(reader *r) {
  uint64_t value = 0;
  for (int shift = 0; shift < 64; shift += 7) {
    if (r->at >= r->end) fail("truncated object", r->file);
    unsigned char byte = *r->at++;
    value |= (uint64_t)(byte & 0x7f) << shift;
    if (!(byte & 0x80)) return value;
  }
  fail("malformed LEB128", r->file);
  return 0;
}

static unsigned char byte(reader *r) {
  if (r->at >= r->end) fail("truncated object", r->file);
  return *r->at++;
}

static void name(reader *r, const unsigned char **text, size_t *size) {
  *size = uleb(r);
  if ((size_t)(r->end - r->at) < *size) fail("truncated name", r->file);
  *text = r->at;
  r->at += *size;
}

static void limits(reader *r) {
  uint64_t flags = uleb(r);
  uleb(r);
  if (flags & 1) uleb(r);
}

static const char *c_type(unsigned char type) {
  switch (type) {
    case 0x7f: return "int";
    case 0x7e: return "long long";
    case 0x7d: return "float";
    case 0x7c: return "double";
    default: return NULL;
  }
}

static int c_identifier(const unsigned char *text, size_t size) {
  if (size == 0 || (text[0] >= '0' && text[0] <= '9')) return 0;
  if (size >= 2 && text[0] == '_' && text[1] == 'Z') return 0; /* C++ names: never looked up */
  if (size == 4 && memcmp(text, "main", 4) == 0) return 0;
  for (size_t i = 0; i < size; i++) {
    unsigned char c = text[i];
    if (!(c == '_' || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9'))) return 0;
  }
  return 1;
}

static void add(const unsigned char *text, size_t size, char *declaration) {
  if (symbol_count == symbol_capacity) {
    symbol_capacity = symbol_capacity ? symbol_capacity * 2 : 65536;
    symbols = realloc(symbols, symbol_capacity * sizeof(symbol));
    if (!symbols) fail("out of memory", "symbols");
  }
  char *copy = malloc(size + 1);
  memcpy(copy, text, size);
  copy[size] = 0;
  symbols[symbol_count++] = (symbol){copy, declaration};
}

/* The signature of each function, by function index (imports first). */
static void object(const unsigned char *data, size_t size, const char *file) {
  if (size < 8 || memcmp(data, "\0asm\1\0\0\0", 8) != 0) return;
  reader r = {data + 8, data + size, file};
  char **types = NULL;
  uint64_t type_count = 0, *function_types = NULL, function_count = 0, imported_functions = 0;
  const unsigned char *linking = NULL, *linking_end = NULL;
  while (r.at < r.end) {
    unsigned char id = byte(&r);
    uint64_t length = uleb(&r);
    if ((uint64_t)(r.end - r.at) < length) fail("truncated section", file);
    reader s = {r.at, r.at + length, file};
    r.at += length;
    if (id == 1) {
      type_count = uleb(&s);
      types = calloc(type_count, sizeof(char *));
      for (uint64_t t = 0; t < type_count; t++) {
        if (byte(&s) != 0x60) fail("unknown type form", file);
        char parameters[4096] = "", *result = "void";
        int valid = 1;
        uint64_t count = uleb(&s);
        for (uint64_t p = 0; p < count; p++) {
          const char *type = c_type(byte(&s));
          if (!type || strlen(parameters) + 16 > sizeof(parameters)) valid = 0;
          else {
            if (p) strcat(parameters, ", ");
            strcat(parameters, type);
          }
        }
        uint64_t results = uleb(&s);
        for (uint64_t p = 0; p < results; p++) {
          const char *type = c_type(byte(&s));
          if (!type || results > 1) valid = 0;
          else result = (char *)type;
        }
        if (valid) {
          size_t length = strlen(result) + strlen(parameters) + 16;
          types[t] = malloc(length);
          snprintf(types[t], length, "%s %%s(%s);", result, count ? parameters : "void");
        }
      }
    } else if (id == 2) {
      uint64_t count = uleb(&s);
      for (uint64_t i = 0; i < count; i++) {
        const unsigned char *text;
        size_t length;
        name(&s, &text, &length);
        name(&s, &text, &length);
        unsigned char kind = byte(&s);
        if (kind == 0) {
          uint64_t type = uleb(&s);
          function_types = realloc(function_types, (function_count + 1) * sizeof(uint64_t));
          function_types[function_count++] = type;
          imported_functions++;
        } else if (kind == 1) {
          byte(&s);
          limits(&s);
        } else if (kind == 2) {
          limits(&s);
        } else if (kind == 3) {
          byte(&s);
          byte(&s);
        } else if (kind == 4) {
          byte(&s);
          uleb(&s);
        } else fail("unknown import kind", file);
      }
    } else if (id == 3) {
      uint64_t count = uleb(&s);
      function_types = realloc(function_types, (function_count + count) * sizeof(uint64_t));
      for (uint64_t i = 0; i < count; i++) function_types[function_count++] = uleb(&s);
    } else if (id == 0) {
      const unsigned char *text;
      size_t length;
      name(&s, &text, &length);
      if (length == 7 && memcmp(text, "linking", 7) == 0) {
        linking = s.at;
        linking_end = s.end;
      }
    }
  }
  (void)imported_functions;
  if (!linking) fail("no linking section", file);
  reader l = {linking, linking_end, file};
  if (uleb(&l) != 2) fail("unknown linking version", file);
  while (l.at < l.end) {
    unsigned char kind = byte(&l);
    uint64_t length = uleb(&l);
    reader s = {l.at, l.at + length, file};
    l.at += length;
    if (kind != 8) continue;
    uint64_t count = uleb(&s);
    for (uint64_t i = 0; i < count; i++) {
      unsigned char symbol_kind = byte(&s);
      uint64_t flags = uleb(&s);
      const unsigned char *text = NULL;
      size_t length = 0;
      uint64_t index = 0;
      int defined = !(flags & FLAG_UNDEFINED);
      if (symbol_kind == KIND_DATA) {
        name(&s, &text, &length);
        if (defined) {
          uleb(&s);
          uleb(&s);
          uleb(&s);
        }
      } else if (symbol_kind == KIND_SECTION) {
        uleb(&s);
        continue;
      } else {
        index = uleb(&s);
        if (defined || (flags & FLAG_EXPLICIT_NAME)) name(&s, &text, &length);
      }
      if (!defined || (flags & (FLAG_LOCAL | FLAG_HIDDEN | FLAG_TLS)) || !c_identifier(text, length)) continue;
      if (symbol_kind == KIND_FUNCTION) {
        if (index >= function_count || function_types[index] >= type_count || !types[function_types[index]]) continue;
        add(text, length, types[function_types[index]]);
      } else if (symbol_kind == KIND_DATA) {
        add(text, length, NULL);
      }
    }
  }
  free(function_types);
}

static void archive(const char *file) {
  FILE *input = fopen(file, "rb");
  if (!input) fail("cannot open", file);
  fseek(input, 0, SEEK_END);
  long size = ftell(input);
  rewind(input);
  unsigned char *data = malloc(size);
  if (!data || fread(data, 1, size, input) != (size_t)size) fail("cannot read", file);
  fclose(input);
  if (size < 8 || memcmp(data, "!<arch>\n", 8) != 0) fail("not an archive", file);
  for (long at = 8; at + 60 <= size;) {
    char length[11] = {0};
    memcpy(length, data + at + 48, 10);
    long member = strtol(length, NULL, 10);
    if (member < 0 || at + 60 + member > size) fail("truncated member", file);
    if (data[at] != '/') object(data + at + 60, member, file);
    at += 60 + member + (member & 1);
  }
  free(data);
}

static int by_name(const void *a, const void *b) {
  return strcmp(((const symbol *)a)->name, ((const symbol *)b)->name);
}

int main(int argc, char **argv) {
  for (int i = 1; i < argc; i++) archive(argv[i]);
  qsort(symbols, symbol_count, sizeof(symbol), by_name);
  size_t unique = 0;
  for (size_t i = 0; i < symbol_count; i++)
    if (unique == 0 || strcmp(symbols[unique - 1].name, symbols[i].name) != 0) symbols[unique++] = symbols[i];
  /* No header: a declaration here may name what a header declares otherwise. */
  puts("static int lean_dolly_compare(const char *a, const char *b) {\n"
       "  while (*a && *a == *b) a++, b++;\n"
       "  return (unsigned char)*a - (unsigned char)*b;\n"
       "}");
  for (size_t i = 0; i < unique; i++) {
    if (symbols[i].declaration) {
      fputs("extern ", stdout);
      printf(symbols[i].declaration, symbols[i].name);
      putchar('\n');
    } else printf("extern char %s[];\n", symbols[i].name);
  }
  puts("static const struct { const char *name; void *address; } lean_dolly_symbols[] = {");
  for (size_t i = 0; i < unique; i++) printf("{\"%s\", (void *)%s},\n", symbols[i].name, symbols[i].name);
  puts("};");
  printf("void *lean_dolly_symbol(const char *name) {\n"
         "  unsigned long low = 0, high = %zu;\n"
         "  while (low < high) {\n"
         "    unsigned long middle = low + (high - low) / 2;\n"
         "    int order = lean_dolly_compare(name, lean_dolly_symbols[middle].name);\n"
         "    if (order == 0) return lean_dolly_symbols[middle].address;\n"
         "    if (order < 0) high = middle; else low = middle + 1;\n"
         "  }\n"
         "  return 0;\n"
         "}\n", unique);
  return 0;
}
