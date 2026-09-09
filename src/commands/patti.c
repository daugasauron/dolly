#define _GNU_SOURCE
#include <ctype.h>
#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <spawn.h>
#include <stddef.h>
#include <stdarg.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>
#include <zlib.h>
#include "sha256.h"
#include "tomlc17.h"
#ifdef __EMSCRIPTEN__
#include <dolly/runtime.h>
#endif

/* Manifests and the graph live for one invocation. Resolution/build temporaries
 * use separate arenas so large workspaces do not retain each fixed-point pass. */
typedef struct Allocation { struct Allocation *next; max_align_t align; } Allocation;
typedef struct { Allocation *head; } Arena;
static Arena permanent, *memory = &permanent;

static _Noreturn void fail(const char *format, ...) {
  va_list args;
  fprintf(stderr, "patti: ");
  va_start(args, format); vfprintf(stderr, format, args); va_end(args);
  fputc('\n', stderr);
  exit(1);
}

static void *allocate(size_t size) {
  if (size > SIZE_MAX - sizeof(Allocation)) fail("allocation overflow");
  Allocation *block = calloc(1, sizeof(*block) + size);
  if (!block) fail("out of memory");
  block->next = memory->head; memory->head = block;
  return block + 1;
}

static void release(Arena *arena) {
  while (arena->head) {
    Allocation *next = arena->head->next;
    free(arena->head); arena->head = next;
  }
}

static char *slice(const char *s, size_t n) {
  char *copy = allocate(n + 1); memcpy(copy, s, n); return copy;
}
static char *copy(const char *s) { return slice(s, strlen(s)); }
static char *format(const char *fmt, ...) {
  va_list args, other;
  va_start(args, fmt); va_copy(other, args);
  int n = vsnprintf(NULL, 0, fmt, args); va_end(args);
  if (n < 0) fail("formatting failed");
  char *result = allocate((size_t)n + 1);
  vsnprintf(result, (size_t)n + 1, fmt, other); va_end(other);
  return result;
}
static bool equal(const char *a, const char *b) { return !strcmp(a, b); }
static bool starts(const char *s, const char *prefix) { return !strncmp(s, prefix, strlen(prefix)); }

typedef enum { NIL, STRING, NUMBER, BOOLEAN, ARRAY, TABLE } Type;
typedef struct Value Value;
struct Value { Type type; char *s; int64_t number; size_t size, capacity; char **keys; Value **items; };
static Value nil;
static Value *value(Type type) { Value *v = allocate(sizeof(*v)); v->type = type; return v; }
static Value *string(const char *s) { Value *v = value(STRING); v->s = copy(s); return v; }
static Value *number(int64_t n) { Value *v = value(NUMBER); v->number = n; return v; }
static Value *boolean(bool b) { Value *v = value(BOOLEAN); v->number = b; return v; }
static const char *str(Value *v) { if (v->type != STRING) fail("expected a string"); return v->s; }
static Value *get(Value *v, const char *key) {
  if (v->type != TABLE) return &nil;
  for (size_t i = 0; i < v->size; ++i) if (equal(v->keys[i], key)) return v->items[i];
  return &nil;
}
static const char *getstr(Value *v, const char *key, const char *fallback) {
  Value *item = get(v, key); return item->type == NIL ? fallback : str(item);
}
static bool getbool(Value *v, const char *key, bool fallback) {
  Value *item = get(v, key);
  if (item->type == NIL) return fallback;
  if (item->type != BOOLEAN) fail("expected boolean: %s", key);
  return item->number != 0;
}
static void append(Value *v, Value *item) {
  if (v->type != ARRAY && v->type != TABLE) fail("expected array or table");
  if (v->size == v->capacity) {
    size_t cap = v->capacity ? v->capacity * 2 : 8;
    Value **items = allocate(cap * sizeof(*items));
    if (v->size) memcpy(items, v->items, v->size * sizeof(*items));
    v->items = items;
    if (v->type == TABLE) {
      char **keys = allocate(cap * sizeof(*keys));
      if (v->size) memcpy(keys, v->keys, v->size * sizeof(*keys));
      v->keys = keys;
    }
    v->capacity = cap;
  }
  v->items[v->size++] = item;
}
static void put(Value *v, const char *key, Value *item) {
  if (v->type != TABLE) fail("expected table: %s", key);
  for (size_t i = 0; i < v->size; ++i) if (equal(v->keys[i], key)) { v->items[i] = item; return; }
  append(v, item); v->keys[v->size - 1] = copy(key);
}
static void setstr(Value *v, const char *key, const char *s) { put(v, key, string(s)); }
static Value *value_copy(Value *v) {
  Value *out = value(v->type); out->number = v->number;
  if (v->s) out->s = copy(v->s);
  for (size_t i = 0; i < v->size; ++i) {
    if (v->type == TABLE) put(out, v->keys[i], value_copy(v->items[i]));
    else append(out, value_copy(v->items[i]));
  }
  return out;
}
static bool contains(Value *v, const char *s) {
  for (size_t i = 0; i < v->size; ++i) if (equal(str(v->items[i]), s)) return true;
  return false;
}
static bool add(Value *v, const char *s) {
  if (contains(v, s)) return false;
  append(v, string(s)); return true;
}
static int compare_strings(const void *a, const void *b) {
  return strcmp(str(*(Value *const *)a), str(*(Value *const *)b));
}
static void sort(Value *v) { if (v->size > 1) qsort(v->items, v->size, sizeof(*v->items), compare_strings); }
static char *join(Value *v, const char *separator) {
  size_t n = 1, count = 0;
  for (size_t i = 0; i < v->size; ++i) if (v->items[i]->type == STRING) n += strlen(str(v->items[i])) + strlen(separator);
  char *out = allocate(n), *p = out;
  for (size_t i = 0; i < v->size; ++i) if (v->items[i]->type == STRING) {
    if (count++) { strcpy(p, separator); p += strlen(separator); }
    strcpy(p, str(v->items[i])); p += strlen(p);
  }
  return out;
}
static void json(FILE *out, Value *v) {
  switch (v->type) {
  case NIL: fputs("null", out); break;
  case BOOLEAN: fputs(v->number ? "true" : "false", out); break;
  case NUMBER: fprintf(out, "%lld", (long long)v->number); break;
  case STRING:
    fputc('"', out);
    for (const unsigned char *p = (unsigned char *)v->s; *p; ++p) {
      if (*p == '"' || *p == '\\') { fputc('\\', out); fputc(*p, out); }
      else if (*p < 32) fprintf(out, "\\u%04x", *p);
      else fputc(*p, out);
    }
    fputc('"', out); break;
  case ARRAY: case TABLE:
    fputc(v->type == TABLE ? '{' : '[', out);
    for (size_t i = 0; i < v->size; ++i) {
      if (i) fputc(',', out);
      if (v->type == TABLE) { Value key = {.type = STRING, .s = v->keys[i]}; json(out, &key); fputc(':', out); }
      json(out, v->items[i]);
    }
    fputc(v->type == TABLE ? '}' : ']', out); break;
  }
}

static Value *from_toml(toml_datum_t datum) {
  Value *v;
  switch (datum.type) {
  case TOML_STRING:
    if (strlen(datum.u.s) != (size_t)datum.u.str.len) fail("NUL in TOML string");
    return string(datum.u.s);
  case TOML_INT64: return number(datum.u.int64);
  case TOML_BOOLEAN: return boolean(datum.u.boolean);
  case TOML_ARRAY:
    v = value(ARRAY);
    for (int i = 0; i < datum.u.arr.size; ++i) append(v, from_toml(datum.u.arr.elem[i]));
    return v;
  case TOML_TABLE:
    v = value(TABLE);
    for (int i = 0; i < datum.u.tab.size; ++i) put(v, datum.u.tab.key[i], from_toml(datum.u.tab.value[i]));
    return v;
  default: return &nil; /* Cargo metadata can contain values Patti never uses. */
  }
}
static Value *toml(const char *path) {
  toml_result_t result = toml_parse_file_ex(path);
  if (!result.ok) fail("%s: %s", path, result.errmsg);
  Value *v = from_toml(result.toptab); toml_free(result); return v;
}

static char *parent(const char *path) {
  const char *end = strrchr(path, '/');
  return end ? slice(path, end == path ? 1 : (size_t)(end - path)) : copy(".");
}
static char *path_join(const char *base, const char *path) {
  return path[0] == '/' ? copy(path) : format("%s/%s", base, path);
}
static char *absolute(const char *path) {
  char cwd[PATH_MAX], resolved[PATH_MAX];
  if (!getcwd(cwd, sizeof(cwd))) fail("getcwd: %s", strerror(errno));
  char *full = path_join(cwd, path);
  if (strlen(full) >= PATH_MAX) fail("path too long: %s", path);
  if (realpath(full, resolved)) return copy(resolved);
  if (errno != ENOENT) fail("resolve %s: %s", full, strerror(errno));
  char *up = parent(full);
  if (equal(up, full)) return copy("/");
  char *base = absolute(up); const char *name = strrchr(full, '/') + 1;
  if (equal(name, "..")) return parent(base);
  return !*name || equal(name, ".") ? base : path_join(base, name);
}
static bool exists(const char *path) { struct stat s; return !stat(path, &s); }
static void mkdirs(const char *path) {
  if (exists(path)) return;
  char *up = parent(path);
  if (!equal(up, path)) mkdirs(up);
  if (mkdir(path, 0755) && errno != EEXIST) fail("mkdir %s: %s", path, strerror(errno));
}
static void remove_tree(const char *path) {
  struct stat s;
  if (lstat(path, &s)) { if (errno == ENOENT) return; fail("stat %s: %s", path, strerror(errno)); }
  if (S_ISDIR(s.st_mode)) {
    DIR *dir = opendir(path);
    if (!dir) fail("opendir %s: %s", path, strerror(errno));
    struct dirent *entry;
    while ((entry = readdir(dir))) if (!equal(entry->d_name, ".") && !equal(entry->d_name, ".."))
      remove_tree(path_join(path, entry->d_name));
    closedir(dir);
    if (rmdir(path)) fail("rmdir %s: %s", path, strerror(errno));
  } else if (unlink(path)) fail("unlink %s: %s", path, strerror(errno));
}
static FILE *open_file(const char *path, const char *mode) {
  FILE *f = fopen(path, mode); if (!f) fail("%s: %s", path, strerror(errno)); return f;
}
static void close_file(FILE *file) { if (fclose(file)) fail("file write/close failed: %s", strerror(errno)); }
static char *read_text(const char *path) {
  FILE *f = open_file(path, "rb");
  if (fseek(f, 0, SEEK_END)) fail("seek %s", path);
  long n = ftell(f);
  if (n < 0 || fseek(f, 0, SEEK_SET)) fail("seek %s", path);
  char *s = allocate((size_t)n + 1);
  if (fread(s, 1, (size_t)n, f) != (size_t)n) fail("read %s", path);
  close_file(f); return s;
}
static char *hash_finish(Sha256 *hash) {
  unsigned char bytes[32]; char *hex = allocate(65);
  sha256_finish(hash, bytes);
  for (int i = 0; i < 32; ++i) snprintf(hex + 2*i, 3, "%02x", bytes[i]);
  return hex;
}
static char *digest(const char *path) {
  FILE *f = open_file(path, "rb"); Sha256 hash; sha256_init(&hash);
  unsigned char buffer[65536]; size_t n;
  while ((n = fread(buffer, 1, sizeof(buffer), f))) sha256_update(&hash, buffer, n);
  if (ferror(f)) fail("read %s", path);
  close_file(f); return hash_finish(&hash);
}

extern char **environ;
static const char *find_compiler(const char *name);
static int run(Value *args, const char *cwd, Value *env, const char *output) {
  char **argv = allocate((args->size + 1) * sizeof(*argv));
  for (size_t i = 0; i < args->size; ++i) argv[i] = (char *)str(args->items[i]);
  char **envp = environ;
  if (env) {
    envp = allocate((env->size + 1) * sizeof(*envp));
    for (size_t i = 0; i < env->size; ++i) envp[i] = format("%s=%s", env->keys[i], str(env->items[i]));
  }
#ifdef __EMSCRIPTEN__
  int fd = STDOUT_FILENO;
  if (output) {
    fd = open(output, O_WRONLY | O_CREAT | O_TRUNC, 0644);
    if (fd < 0) fail("%s: %s", output, strerror(errno));
  }
  int pid = dolly_spawn_env_cwd(find_compiler(argv[0]), (int)args->size, argv, envp,
                            cwd, STDIN_FILENO, fd, STDERR_FILENO, -1);
  if (output) close(fd);
  if (pid < 0) fail("spawn %s: %s", argv[0], strerror(-pid));
  int status, waited = dolly_wait(pid, &status);
  if (waited < 0) fail("wait %s: %s", argv[0], strerror(-waited));
  return status;
#else
  posix_spawn_file_actions_t actions;
  int error = posix_spawn_file_actions_init(&actions), fd = -1;
  if (!error && cwd) error = posix_spawn_file_actions_addchdir_np(&actions, cwd);
  if (!error && output) {
    fd = open(output, O_WRONLY | O_CREAT | O_TRUNC | O_CLOEXEC, 0644);
    if (fd < 0) fail("%s: %s", output, strerror(errno));
    error = posix_spawn_file_actions_adddup2(&actions, fd, STDOUT_FILENO);
  }
  pid_t pid;
  if (!error) error = posix_spawnp(&pid, argv[0], &actions, NULL, argv, envp);
  posix_spawn_file_actions_destroy(&actions);
  if (fd >= 0) close(fd);
  if (error) fail("spawn %s: %s", argv[0], strerror(error));
  int status;
  while (waitpid(pid, &status, 0) < 0) if (errno != EINTR) fail("wait %s: %s", argv[0], strerror(errno));
  return WIFEXITED(status) ? WEXITSTATUS(status) : 128 + WTERMSIG(status);
#endif
}
static Value *arguments(const char *first, ...) {
  Value *args = value(ARRAY); va_list more; va_start(more, first);
  for (const char *p = first; p; p = va_arg(more, const char *)) append(args, string(p));
  va_end(more); return args;
}

typedef struct { uint64_t part[3]; int count; char *pre; bool wildcard; } Version;
static void spaces(const char **p) { while (isspace((unsigned char)**p)) ++*p; }
static Version version(const char **input) {
  const char *p = *input; Version v = {.pre = ""};
  while (v.count < 3 && isdigit((unsigned char)*p)) {
    char *end; errno = 0; unsigned long long n = strtoull(p, &end, 10);
    if (errno) fail("version number overflow");
    v.part[v.count++] = n; p = end;
    if (*p != '.') break;
    if (p[1] == '*') { v.wildcard = true; p += 2; break; }
    if (v.count == 3) break;
    ++p;
  }
  if (!v.count) fail("unsupported version: %s", *input);
  if (*p == '-') {
    const char *start = ++p;
    while (isalnum((unsigned char)*p) || *p == '_' || *p == '.' || *p == '-') ++p;
    if (p == start) fail("empty prerelease");
    v.pre = slice(start, (size_t)(p - start));
  }
  if (*p == '+') { ++p; while (*p && *p != ',' && !isspace((unsigned char)*p)) ++p; }
  *input = p; return v;
}
static int numeric_compare(Version a, Version b, int count) {
  for (int i = 0; i < count; ++i) if (a.part[i] != b.part[i]) return a.part[i] < b.part[i] ? -1 : 1;
  return 0;
}
static int pre_compare(const char *a, const char *b) {
  if (!*a || !*b) return !*a ? (!!*b) : -1;
  while (*a && *b) {
    size_t an = strcspn(a, "."), bn = strcspn(b, ".");
    bool ai = an > 0, bi = bn > 0;
    for (size_t i = 0; i < an; ++i) ai &= isdigit((unsigned char)a[i]) != 0;
    for (size_t i = 0; i < bn; ++i) bi &= isdigit((unsigned char)b[i]) != 0;
    if (ai != bi) return ai ? -1 : 1;
    if (ai) {
      while (an > 1 && *a == '0') { ++a; --an; }
      while (bn > 1 && *b == '0') { ++b; --bn; }
      if (an != bn) return an < bn ? -1 : 1;
    }
    int cmp = strncmp(a, b, an < bn ? an : bn);
    if (cmp) return cmp;
    if (an != bn) return an < bn ? -1 : 1;
    a += an; b += bn;
    if (!*a || !*b) return !!*a - !!*b;
    ++a; ++b;
  }
  return !!*a - !!*b;
}
static int version_compare(Version a, Version b) {
  int n = numeric_compare(a, b, 3); return n ? n : pre_compare(a.pre, b.pre);
}
static bool version_matches(const char *actual_string, const char *requirement) {
  const char *p = actual_string; Version actual = version(&p);
  if (*p || actual.count != 3 || actual.wildcard) fail("unsupported version: %s", actual_string);
  bool eligible = !*actual.pre, matches = true;
  p = requirement;
  do {
    spaces(&p);
    if (*p == '*') { ++p; }
    else {
      char op[3] = {0};
      if (strchr("^~=><", *p) && *p) {
        op[0] = *p++;
        if ((op[0] == '>' || op[0] == '<') && *p == '=') op[1] = *p++;
      }
      spaces(&p); Version lower = version(&p);
      eligible |= *lower.pre && !numeric_compare(actual, lower, 3);
      if (lower.wildcard || (op[0] == '=' && lower.count < 3))
        matches &= !numeric_compare(actual, lower, lower.count);
      else if (op[0] == '=' || op[0] == '<' || op[0] == '>') {
        int cmp = lower.count == 3 ? version_compare(actual, lower) : numeric_compare(actual, lower, lower.count);
        matches &= op[0] == '=' ? cmp == 0 : op[0] == '<' ? (op[1] ? cmp <= 0 : cmp < 0) : (op[1] ? cmp >= 0 : cmp > 0);
      } else {
        int index = 0;
        if (op[0] == '~') index = lower.count > 1 ? 1 : 0;
        else while (index < lower.count - 1 && !lower.part[index]) ++index;
        Version upper = lower; upper.pre = "";
        if (upper.part[index] == UINT64_MAX) fail("version upper bound overflow");
        ++upper.part[index]; for (int i = index + 1; i < 3; ++i) upper.part[i] = 0;
        matches &= version_compare(actual, lower) >= 0 && version_compare(actual, upper) < 0;
      }
    }
    spaces(&p);
    if (*p != ',' && *p) fail("unsupported version requirement: %s", requirement);
    if (!*p) break;
    ++p;
  } while (true);
  return matches && eligible;
}

static char *quoted(const char **input) {
  const char *p = *input;
  if (*p != '"') fail("expected quoted value: %s", p);
  const char *start = p++;
  while (*p && *p != '"') { if (*p == '\\' && p[1]) ++p; ++p; }
  if (*p++ != '"') fail("unterminated quoted value");
  char *document = format("v=%.*s", (int)(p - start), start);
  toml_result_t result = toml_parse(document, (int)strlen(document));
  if (!result.ok) fail("invalid quoted value: %s", result.errmsg);
  char *s = copy(str(from_toml(toml_get(result.toptab, "v"))));
  toml_free(result); *input = p; return s;
}
static bool cfg_parse(const char **input, Value *cfg, int depth) {
  if (depth > 128) fail("target condition too deep");
  spaces(input); const char *start = *input;
  while (isalnum((unsigned char)**input) || **input == '_') ++*input;
  if (start == *input) fail("unsupported target condition: %s", start);
  char *name = slice(start, (size_t)(*input - start)); spaces(input);
  if (**input == '(') {
    ++*input; spaces(input); bool all = true, any = false; size_t count = 0;
    while (**input != ')') {
      bool yes = cfg_parse(input, cfg, depth + 1); all &= yes; any |= yes; ++count;
      spaces(input);
      if (**input == ',') { ++*input; spaces(input); }
      else if (**input != ')') fail("unsupported target condition: %s", *input);
    }
    ++*input;
    if (equal(name, "all")) return all;
    if (equal(name, "any")) return any;
    if (count == 1 && equal(name, "cfg")) return all;
    if (count == 1 && equal(name, "not")) return !all;
    fail("unsupported target condition function: %s", name);
  }
  const char *expected = NULL;
  if (**input == '=') { ++*input; spaces(input); expected = quoted(input); }
  Value *values = get(cfg, name);
  for (size_t i = 0; i < values->size; ++i) {
    Value *v = values->items[i];
    if (expected ? v->type == STRING && equal(str(v), expected) : v->type == NIL) return true;
  }
  return false;
}
static bool cfg_matches(const char *expression, Value *cfg, const char *triple) {
  if (!starts(expression, "cfg(")) return equal(expression, triple);
  const char *p = expression; bool result = cfg_parse(&p, cfg, 0); spaces(&p);
  if (*p) fail("unsupported target condition: %s", expression);
  return result;
}

static void gz_exact(gzFile file, void *buffer, size_t count) {
  unsigned char *p = buffer;
  while (count) {
    unsigned chunk = count > 65536 ? 65536 : (unsigned)count;
    int n = gzread(file, p, chunk);
    if (n <= 0) fail("truncated or corrupt crate archive");
    p += n; count -= (size_t)n;
  }
}
static uint64_t tar_number(const unsigned char *p, size_t n) {
  uint64_t out = 0; size_t i = 0;
  while (i < n && p[i] == ' ') ++i;
  for (; i < n && p[i] >= '0' && p[i] <= '7'; ++i) {
    if (out > (UINT64_MAX - 7) / 8) fail("archive size overflow");
    out = out * 8 + p[i] - '0';
  }
  for (; i < n; ++i) if (p[i] && p[i] != ' ') fail("unsupported archive number");
  return out;
}
static uint64_t decimal(const char *s, char **end) {
  if (!isdigit((unsigned char)*s)) fail("invalid archive size");
  errno = 0; uint64_t n = strtoull(s, end, 10);
  if (errno) fail("archive size overflow");
  return n;
}
static struct timespec pax_time(const char *text) {
  bool negative = *text == '-';
  const char *p = text + negative;
  char *end;
  uint64_t seconds = decimal(p, &end);
  if (seconds > INT64_MAX) fail("archive timestamp overflow");
  long nanos = 0, place = 100000000;
  if (*end == '.') {
    ++end;
    if (!isdigit((unsigned char)*end)) fail("invalid archive timestamp");
    while (isdigit((unsigned char)*end)) { nanos += (*end++ - '0') * place; place /= 10; }
  }
  if (*end) fail("invalid archive timestamp");
  struct timespec result = {.tv_sec = (time_t)seconds, .tv_nsec = nanos};
  if (negative) {
    result.tv_sec = -(int64_t)seconds - (nanos != 0);
    result.tv_nsec = nanos ? 1000000000 - nanos : 0;
  }
  return result;
}
static void set_mtime(const char *path, struct timespec mtime) {
  struct timespec times[2] = {{.tv_nsec = UTIME_OMIT}, mtime};
  if (utimensat(AT_FDCWD, path, times, 0)) fail("set timestamp %s: %s", path, strerror(errno));
}
static void check_member(const char *name, const char *prefix) {
  size_t n = strlen(prefix);
  if (!starts(name, prefix) || (name[n] && name[n] != '/')) fail("unsupported archive member: %s", name);
  for (const char *p = name; *p;) {
    size_t len = strcspn(p, "/");
    if (len == 2 && p[0] == '.' && p[1] == '.') fail("unsupported archive member: %s", name);
    p += len; if (*p) ++p;
  }
}
static void unpack(const char *archive, const char *destination, const char *prefix) {
  /* Validate the entire archive before creating members. Only files/directories
   * are accepted; PAX and GNU long-name records describe the following member. */
  for (int extract = 0; extract < 2; ++extract) {
    gzFile file = gzopen(archive, "rb");
    if (!file) fail("open archive %s", archive);
    char *long_name = NULL; uint64_t pax_size = 0; bool has_size = false;
    struct timespec local_time = {0}, global_time = {0};
    bool has_time = false, has_global_time = false;
    typedef struct DirectoryTime { struct DirectoryTime *next; char *path; struct timespec time; } DirectoryTime;
    DirectoryTime *directories = NULL;
    unsigned char header[512], buffer[65536];
    while (true) {
      gz_exact(file, header, sizeof(header));
      bool zero = true;
      for (size_t i = 0; i < sizeof(header); ++i) zero &= header[i] == 0;
      if (zero) break;
      uint64_t checksum = 0;
      for (size_t i = 0; i < sizeof(header); ++i) checksum += i >= 148 && i < 156 ? ' ' : header[i];
      if (checksum != tar_number(header + 148, 8)) fail("archive header checksum mismatch");
      uint64_t size = tar_number(header + 124, 12);
      char type = (char)header[156];
      if (type == 'x' || type == 'g' || type == 'L') {
        if (size > 1024 * 1024) fail("archive metadata exceeds 1 MiB");
        char *data = allocate((size_t)size + 1);
        gz_exact(file, data, (size_t)size);
        gz_exact(file, buffer, (size_t)((512 - size % 512) % 512));
        if (type == 'L') { long_name = data; continue; }
        for (uint64_t offset = 0; offset < size;) {
          char *end, *record = data + offset;
          uint64_t length = decimal(record, &end);
          if (!length || length > size - offset || *end != ' ' || record[length - 1] != '\n') fail("invalid PAX record");
          char *key = end + 1, *eq = memchr(key, '=', (size_t)(record + length - 1 - key));
          if (!eq) fail("invalid PAX key");
          *eq = 0; record[length - 1] = 0;
          if (equal(key, "path")) {
            if (type == 'g') fail("global archive path is unsupported");
            long_name = copy(eq + 1);
          } else if (equal(key, "size")) {
            if (type == 'g') fail("global archive size is unsupported");
            pax_size = decimal(eq + 1, &end);
            if (*end) fail("invalid PAX size");
            has_size = true;
          } else if (equal(key, "mtime")) {
            if (type == 'g') { global_time = pax_time(eq + 1); has_global_time = true; }
            else { local_time = pax_time(eq + 1); has_time = true; }
          } else if (equal(key, "linkpath") || starts(key, "GNU.sparse")) fail("unsupported PAX member: %s", key);
          offset += length;
        }
        continue;
      }
      char *name = long_name ? long_name : slice((char *)header, strnlen((char *)header, 100));
      if (!long_name && !memcmp(header + 257, "ustar", 5) && header[345])
        name = format("%.*s/%s", (int)strnlen((char *)header + 345, 155), header + 345, name);
      if (has_size) size = pax_size;
      uint64_t seconds = tar_number(header + 136, 12);
      if (seconds > INT64_MAX) fail("archive timestamp overflow");
      struct timespec mtime = has_time ? local_time : has_global_time ? global_time : (struct timespec){.tv_sec = (time_t)seconds};
      long_name = NULL; has_size = has_time = false;
      check_member(name, prefix);
      if (type != '0' && type != 0 && type != '5') fail("unsupported archive member: %s (type %c)", name, type);
      if (type == '5' && size) fail("nonempty archive directory: %s", name);
      FILE *output = NULL; char *path = NULL;
      if (extract) {
        path = path_join(destination, name);
        if (type == '5') {
          mkdirs(path);
          DirectoryTime *entry = allocate(sizeof(*entry));
          entry->next = directories; entry->path = path; entry->time = mtime; directories = entry;
        }
        else { mkdirs(parent(path)); output = open_file(path, "wb"); }
      }
      uint64_t remaining = size;
      while (remaining) {
        size_t n = remaining > sizeof(buffer) ? sizeof(buffer) : (size_t)remaining;
        gz_exact(file, buffer, n);
        if (output && fwrite(buffer, 1, n, output) != n) fail("write %s: %s", path, strerror(errno));
        remaining -= n;
      }
      if (output) {
        close_file(output);
        if (chmod(path, (mode_t)tar_number(header + 100, 8) & 0777)) fail("chmod %s: %s", path, strerror(errno));
        set_mtime(path, mtime);
      }
      gz_exact(file, buffer, (size_t)((512 - size % 512) % 512));
    }
    if (long_name || has_size || has_time) fail("archive ends with unmatched metadata");
    int n;
    while ((n = gzread(file, buffer, sizeof(buffer))) > 0)
      for (int i = 0; i < n; ++i) if (buffer[i]) fail("nonzero data after archive end");
    if (n < 0 || gzclose(file) != Z_OK) fail("corrupt compressed archive");
    for (DirectoryTime *entry = directories; entry; entry = entry->next) set_mtime(entry->path, entry->time);
  }
}

typedef struct {
  const char *command, *manifest, *binary, *features, *cache, *registry, *rustc, *target;
  const char *config, *package, *only, *only_output;
  bool offline, no_default, resume;
  int opt;
  Value *patches;
} Options;
static Options options;
static const char *registry_source = "registry+https://github.com/rust-lang/crates.io-index";

static bool safe_component(const char *s, const char *extra) {
  if (!*s) return false;
  for (; *s; ++s) if (!((*s >= 'A' && *s <= 'Z') || (*s >= 'a' && *s <= 'z') ||
      (*s >= '0' && *s <= '9') || strchr(extra, *s))) return false;
  return true;
}
static char *source_get(Value *record) {
  const char *name = str(get(record, "name")), *version = str(get(record, "version"));
  const char *checksum = getstr(record, "checksum", "");
  bool valid_hash = strlen(checksum) == 64;
  for (const char *p = checksum; *p; ++p) valid_hash &= (*p >= '0' && *p <= '9') || (*p >= 'a' && *p <= 'f');
  if (!equal(getstr(record, "source", ""), registry_source) || !safe_component(name, "_-") ||
      !safe_component(version, ".+-") || !valid_hash)
    fail("%s %s: requires a checksummed crates.io lock entry or --patch", name, version);
  char *prefix = format("%s-%s", name, version);
  char *archive = format("%s/archives/%s.crate", options.cache, prefix);
  mkdirs(parent(archive));
  if (!exists(archive)) {
    if (options.offline) fail("offline cache miss: %s", prefix);
    char *url = format("%s/%s/%s.crate", options.registry, name, prefix);
    char *temporary = format("%s/archives/%s.partial", options.cache, prefix);
    printf("patti: fetch %s\n", url); fflush(stdout);
    int status = run(arguments("curl", "--fail", "--silent", "--show-error", url, "-o", temporary, NULL), NULL, NULL, NULL);
    if (status) { unlink(temporary); fail("curl exited %d: %s", status, url); }
    char *actual = digest(temporary);
    if (!equal(actual, checksum)) { unlink(temporary); fail("SHA-256 mismatch: %s: expected %s, got %s", prefix, checksum, actual); }
    if (rename(temporary, archive)) { unlink(temporary); fail("rename %s: %s", temporary, strerror(errno)); }
  }
  char *actual = digest(archive);
  if (!equal(actual, checksum)) fail("SHA-256 mismatch: %s: expected %s, got %s", prefix, checksum, actual);
  char *destination = path_join(options.cache, "sources"), *root = path_join(destination, prefix);
  mkdirs(destination); remove_tree(root); unpack(archive, destination, prefix); return root;
}

static Value *documents;
static Value *document(const char *path) {
  Value *v = get(documents, path);
  if (v->type == NIL) { v = toml(path); put(documents, path, v); }
  return v;
}
static Value *dependency_spec(Value *spec) {
  if (spec->type == STRING) { Value *out = value(TABLE); put(out, "version", spec); return out; }
  if (spec->type != TABLE) fail("expected dependency table or version string");
  return spec;
}
static Value *workspace_manifest(const char *path, char **workspace_path) {
  Value *manifest = value_copy(document(path)), *info = get(manifest, "package"), *workspace = &nil;
  char *root = parent(path), *candidate = root;
  const char *explicit = getstr(info, "workspace", NULL);
  if (explicit) candidate = absolute(path_join(root, explicit));
  while (true) {
    char *filename = path_join(candidate, "Cargo.toml");
    if (exists(filename)) workspace = get(document(filename), "workspace");
    if (workspace->type != NIL) break;
    if (explicit || equal(candidate, "/")) { candidate = root; break; }
    candidate = parent(candidate);
  }
  *workspace_path = candidate;
  for (size_t i = 0; i < info->size; ++i) {
    if (!getbool(info->items[i], "workspace", false)) continue;
    const char *key = info->keys[i]; Value *inherited = get(get(workspace, "package"), key);
    if (inherited->type == NIL) fail("missing workspace.package.%s: %s", key, path);
    if ((equal(key, "readme") || equal(key, "license-file")) && inherited->type == STRING)
      inherited = string(path_join(candidate, str(inherited)));
    put(info, key, inherited);
  }
  Value *tables = value(ARRAY); append(tables, manifest);
  Value *targets = get(manifest, "target");
  for (size_t i = 0; i < targets->size; ++i) append(tables, targets->items[i]);
  const char *kinds[] = {"dependencies", "build-dependencies"};
  for (size_t t = 0; t < tables->size; ++t) for (size_t k = 0; k < 2; ++k) {
    Value *deps = get(tables->items[t], kinds[k]);
    for (size_t i = 0; i < deps->size; ++i) {
      Value *spec = deps->items[i]; const char *alias = deps->keys[i];
      if (!getbool(spec, "workspace", false)) continue;
      Value *inherited = get(get(workspace, "dependencies"), alias);
      if (inherited->type == NIL) fail("missing workspace dependency %s: %s", alias, path);
      Value *base = value_copy(dependency_spec(inherited));
      if (get(base, "path")->type != NIL) setstr(base, "path", absolute(path_join(candidate, str(get(base, "path")))));
      Value *features = value(ARRAY), *old = get(base, "features"), *extra = get(spec, "features");
      for (size_t j = 0; j < old->size; ++j) append(features, old->items[j]);
      for (size_t j = 0; j < extra->size; ++j) append(features, extra->items[j]);
      put(base, "features", features);
      if (get(spec, "optional")->type != NIL) put(base, "optional", get(spec, "optional"));
      for (size_t j = 0; j < spec->size; ++j) {
        const char *key = spec->keys[j];
        if (!equal(key, "workspace") && !equal(key, "features") && !equal(key, "optional") && !equal(key, "default-features"))
          fail("unsupported inherited dependency options: %s", alias);
      }
      if (get(spec, "default-features")->type != NIL && getbool(spec, "default-features", true) != getbool(base, "default-features", true))
        fail("conflicting inherited default-features: %s", alias);
      put(deps, alias, base);
    }
  }
  return manifest;
}

typedef struct Package Package;
typedef struct Node Node;
typedef struct { char *alias; Node *node; } Edge;
typedef struct { size_t size, capacity; Edge *items; } Edges;
struct Package {
  Package *next;
  Value *record, *manifest, *info, *lib;
  char *root, *workspace, *id;
  const char *name, *version, *build;
};
struct Node {
  Node *next;
  Package *package;
  const char *context;
  Value *features, *metadata;
  Edges normal, build;
  char *artifact;
  int state;
};
static Package *packages;
static Node *nodes, *last_node;
static Value *records, *cfg, *report, *build_config;
static const char *compiler, *triple, *deps;
static char *toolchain_hash;
static bool only_compiled;
static bool repairing(void) { return options.only || options.only_output; }
static size_t changes;

static Package *package_get(Value *record, const char *path) {
  for (Package *p = packages; p; p = p->next) if (p->record == record) return p;
  Arena *previous = memory; memory = &permanent;
  Package *p = allocate(sizeof(*p)); p->record = record;
  p->name = str(get(record, "name")); p->version = str(get(record, "version"));
  const char *override = getstr(options.patches, format("%s@%s", p->name, p->version), getstr(options.patches, p->name, path));
  if (override) p->root = absolute(override);
  else {
    Arena fetching = {0}; memory = &fetching;
    char *fetched = source_get(record);
    memory = &permanent; p->root = absolute(fetched); release(&fetching);
  }
  p->manifest = workspace_manifest(path_join(p->root, "Cargo.toml"), &p->workspace);
  p->info = get(p->manifest, "package"); p->lib = get(p->manifest, "lib");
  if (!equal(p->name, str(get(p->info, "name"))) || !equal(p->version, str(get(p->info, "version"))))
    fail("manifest/lock mismatch: %s", p->root);
  p->id = format("%s-%s", p->name, p->version);
  Value *build = get(p->info, "build");
  if (build->type == STRING) p->build = str(build);
  else if (build->type == NIL || (build->type == BOOLEAN && build->number))
    p->build = exists(path_join(p->root, "build.rs")) ? "build.rs" : NULL;
  else if (build->type != BOOLEAN) fail("invalid package.build: %s", p->id);
  p->next = packages; packages = p; memory = previous; return p;
}
static Node *node_get(Package *p, const char *context) {
  for (Node *n = nodes; n; n = n->next) if (n->package == p && equal(n->context, context)) return n;
  Arena *previous = memory; memory = &permanent;
  Node *n = allocate(sizeof(*n)); n->package = p; n->context = context;
  n->features = value(ARRAY); n->metadata = value(TABLE);
  if (last_node) last_node->next = n; else nodes = n;
  last_node = n; ++changes; memory = previous; return n;
}
static void feature_add(Node *node, const char *feature) {
  if (contains(node->features, feature)) return;
  Arena *previous = memory; memory = &permanent;
  add(node->features, feature); ++changes; memory = previous;
}
static void edge_put(Edges *edges, const char *alias, Node *node) {
  for (size_t i = 0; i < edges->size; ++i) if (equal(edges->items[i].alias, alias)) {
    edges->items[i].node = node;
    return;
  }
  Arena *previous = memory; memory = &permanent;
  if (edges->size == edges->capacity) {
    edges->capacity = edges->capacity ? edges->capacity * 2 : 8;
    Edge *items = allocate(edges->capacity * sizeof(*items));
    if (edges->size) memcpy(items, edges->items, edges->size * sizeof(*items));
    edges->items = items;
  }
  edges->items[edges->size++] = (Edge){copy(alias), node}; memory = previous;
}
static char *identifier(const char *name, bool upper) {
  char *s = copy(name);
  for (char *p = s; *p; ++p) { if (*p == '-') *p = '_'; else if (upper) *p = (char)toupper((unsigned char)*p); }
  return s;
}
static Package *dependency(Package *p, const char *alias, Value *spec) {
  const char *name = getstr(spec, "package", alias);
  if (get(spec, "workspace")->type != NIL || get(spec, "registry")->type != NIL || get(spec, "artifact")->type != NIL ||
      (get(spec, "git")->type != NIL && get(options.patches, name)->type == NIL))
    fail("%s: dependency %s requires an explicit pinned source override", p->id, alias);
  Value *edges = get(p->record, "dependencies"), *selected = NULL;
  for (size_t i = 0; i < records->size; ++i) {
    Value *r = records->items[i];
    if (!equal(getstr(r, "name", ""), name)) continue;
    bool locked = false;
    for (size_t j = 0; j < edges->size; ++j) {
      const char *entry = str(edges->items[j]); size_t len = strcspn(entry, " \t");
      if (strlen(name) != len || strncmp(entry, name, len)) continue;
      entry += len; spaces(&entry);
      if (!*entry) locked = true;
      else {
        len = strcspn(entry, " \t"); const char *v = str(get(r, "version"));
        if (strlen(v) == len && !strncmp(entry, v, len)) locked = true;
      }
    }
    if (!locked || !version_matches(str(get(r, "version")), getstr(spec, "version", "*"))) continue;
    if (selected) fail("%s: ambiguous or missing locked dependency: %s", p->id, alias);
    selected = r;
  }
  if (!selected) fail("%s: ambiguous or missing locked dependency: %s", p->id, alias);
  const char *path = getstr(spec, "path", NULL);
  return package_get(selected, path ? path_join(p->root, path) : NULL);
}
static Value *declarations(Package *p, const char *kind, bool all_targets) {
  Value *out = value(ARRAY), *tables = value(ARRAY); append(tables, p->manifest);
  Value *targets = get(p->manifest, "target");
  for (size_t i = 0; i < targets->size; ++i)
    if (all_targets || cfg_matches(targets->keys[i], cfg, triple)) append(tables, targets->items[i]);
  for (size_t t = 0; t < tables->size; ++t) {
    Value *entries = get(tables->items[t], kind);
    for (size_t i = 0; i < entries->size; ++i) {
      Value *entry = value(TABLE); setstr(entry, "alias", entries->keys[i]);
      put(entry, "spec", dependency_spec(entries->items[i])); append(out, entry);
    }
  }
  return out;
}
static void resolve_node(Node *node) {
  Package *p = node->package;
  Value *features = get(p->manifest, "features");
  features = features->type == NIL ? value(TABLE) : value_copy(features);
  Value *hidden = value(ARRAY), *optional_names = value(ARRAY);
  for (size_t i = 0; i < features->size; ++i) {
    Value *items = features->items[i];
    for (size_t j = 0; j < items->size; ++j) if (starts(str(items->items[j]), "dep:")) add(hidden, str(items->items[j]) + 4);
  }
  const char *kinds[] = {"dependencies", "build-dependencies"};
  for (size_t k = 0; k < 2; ++k) {
    Value *entries = declarations(p, kinds[k], true);
    for (size_t i = 0; i < entries->size; ++i) {
      const char *alias = str(get(entries->items[i], "alias"));
      if (getbool(get(entries->items[i], "spec"), "optional", false)) {
        add(optional_names, alias);
        if (!contains(hidden, alias) && get(features, alias)->type == NIL) put(features, alias, arguments(format("dep:%s", alias), NULL));
      }
    }
  }
  Value *enabled = value(ARRAY), *forwarded = value(ARRAY), *queue = value_copy(node->features), *visited = value(ARRAY);
  while (queue->size) {
    const char *feature = str(queue->items[--queue->size]);
    if (!add(visited, feature)) continue;
    if (starts(feature, "dep:")) add(enabled, feature + 4);
    else if (strchr(feature, '/')) {
      const char *slash = strchr(feature, '/'); char *alias = slice(feature, (size_t)(slash - feature));
      size_t len = strlen(alias); if (!len || !slash[1]) fail("invalid forwarded feature: %s", feature);
      if (alias[len - 1] == '?') alias[len - 1] = 0;
      else {
        add(enabled, alias);
        if (contains(optional_names, alias) && get(features, alias)->type != NIL) append(queue, string(alias));
      }
      Value *entry = value(TABLE); setstr(entry, "alias", alias); setstr(entry, "feature", slash + 1); append(forwarded, entry);
    } else if (get(features, feature)->type != NIL) {
      feature_add(node, feature); Value *items = get(features, feature);
      for (size_t i = 0; i < items->size; ++i) append(queue, items->items[i]);
    } else if (!equal(feature, "default")) fail("%s: unknown feature %s", p->id, feature);
  }
  for (size_t k = 0; k < 2; ++k) {
    if (k == 1 && !p->build) continue;
    Value *entries = declarations(p, kinds[k], false);
    for (size_t i = 0; i < entries->size; ++i) {
      const char *alias = str(get(entries->items[i], "alias")); Value *spec = get(entries->items[i], "spec");
      if (getbool(spec, "optional", false) && !contains(enabled, alias)) continue;
      Package *dep = dependency(p, alias, spec);
      Node *child = node_get(dep, k == 1 || getbool(dep->lib, "proc-macro", false) ? "build" : node->context);
      Value *items = get(spec, "features");
      for (size_t j = 0; j < items->size; ++j) feature_add(child, str(items->items[j]));
      if (getbool(spec, "default-features", true)) feature_add(child, "default");
      for (size_t j = 0; j < forwarded->size; ++j)
        if (equal(str(get(forwarded->items[j], "alias")), alias)) feature_add(child, str(get(forwarded->items[j], "feature")));
      const char *name = equal(alias, dep->name) ? getstr(dep->lib, "name", alias) : alias;
      edge_put(k ? &node->build : &node->normal, identifier(name, false), child);
    }
  }
}
static Node *resolve(void) {
  char *workspace;
  Value *info = get(workspace_manifest(options.manifest, &workspace), "package"), *record = NULL;
  for (size_t i = 0; i < records->size; ++i) {
    Value *r = records->items[i];
    if (equal(str(get(r, "name")), str(get(info, "name"))) && equal(str(get(r, "version")), str(get(info, "version"))) && get(r, "source")->type == NIL) {
      if (record) fail("root package is missing or ambiguous in Cargo.lock");
      record = r;
    }
  }
  if (!record) fail("root package is missing or ambiguous in Cargo.lock");
  Node *root = node_get(package_get(record, parent(options.manifest)), "target");
  char *requested = copy(options.features), *save;
  for (char *p = strtok_r(requested, ",", &save); p; p = strtok_r(NULL, ",", &save)) feature_add(root, p);
  if (!options.no_default) feature_add(root, "default");
  size_t before;
  do {
    before = changes; Node *end = last_node;
    for (Node *n = nodes; n; n = n->next) {
      Arena temporary = {0}; memory = &temporary; resolve_node(n); memory = &permanent; release(&temporary);
      if (n == end) break;
    }
  } while (changes != before);
  for (Node *n = nodes; n; n = n->next) {
    if (get(get(n->package->manifest, "features"), "default")->type == NIL)
      for (size_t i = 0; i < n->features->size; ++i) if (equal(str(n->features->items[i]), "default")) {
        memmove(n->features->items + i, n->features->items + i + 1, (n->features->size - i - 1) * sizeof(*n->features->items));
        --n->features->size; break;
      }
    sort(n->features); Value *entry = value(TABLE);
    setstr(entry, "name", n->package->name); setstr(entry, "version", n->package->version);
    setstr(entry, "context", n->context); put(entry, "features", n->features);
    setstr(entry, "source", n->package->root); put(entry, "checksum", get(n->package->record, "checksum"));
    append(get(report, "packages"), entry);
  }
  return root;
}

static void write_report(void) {
  mkdirs(options.target);
  FILE *file = open_file(path_join(options.target, "patti-build.json"), "w");
  json(file, report); fputc('\n', file); close_file(file);
}
static void environment_override(Value *env, Value *overrides) {
  for (size_t i = 0; i < overrides->size; ++i) setstr(env, overrides->keys[i], str(overrides->items[i]));
}
static Value *environment(Node *node, const char *out) {
  Package *p = node->package; Value *env = value(TABLE);
  for (char **entry = environ; *entry; ++entry) {
    const char *eq = strchr(*entry, '='); if (!eq) continue;
    char *key = slice(*entry, (size_t)(eq - *entry));
    if (starts(key, "CARGO_") || starts(key, "DEP_") || equal(key, "RUSTFLAGS") || equal(key, "RUSTC_WRAPPER")) continue;
    setstr(env, key, eq + 1);
  }
  setstr(env, "RUSTC", compiler); setstr(env, "HOST", triple); setstr(env, "TARGET", triple);
  setstr(env, "OUT_DIR", out); setstr(env, "CARGO_MANIFEST_DIR", p->root);
  setstr(env, "CARGO_MANIFEST_PATH", path_join(p->root, "Cargo.toml"));
  setstr(env, "CARGO_PKG_NAME", p->name); setstr(env, "CARGO_PKG_VERSION", p->version);
  setstr(env, "NUM_JOBS", "1"); setstr(env, "OPT_LEVEL", format("%d", options.opt));
  setstr(env, "DEBUG", "false"); setstr(env, "PROFILE", "release");
  setstr(env, "CARGO_INCREMENTAL", "0"); setstr(env, "CARGO_ENCODED_RUSTFLAGS", "-C\x1fpanic=abort");
  const char *links = getstr(p->info, "links", NULL);
  if (links) setstr(env, "CARGO_MANIFEST_LINKS", links);
  const char *v = p->version; Version ver = version(&v);
  const char *numbers[] = {"MAJOR", "MINOR", "PATCH"};
  for (size_t i = 0; i < 3; ++i) setstr(env, format("CARGO_PKG_VERSION_%s", numbers[i]), format("%llu", (unsigned long long)ver.part[i]));
  setstr(env, "CARGO_PKG_VERSION_PRE", ver.pre);
  const char *metadata[] = {"description", "homepage", "repository", "license", "license-file", "rust-version"};
  for (size_t i = 0; i < sizeof(metadata)/sizeof(*metadata); ++i)
    setstr(env, format("CARGO_PKG_%s", identifier(metadata[i], true)), getstr(p->info, metadata[i], ""));
  setstr(env, "CARGO_PKG_AUTHORS", join(get(p->info, "authors"), ":"));
  for (size_t i = 0; i < cfg->size; ++i) setstr(env, format("CARGO_CFG_%s", identifier(cfg->keys[i], true)), join(cfg->items[i], ","));
  for (size_t i = 0; i < node->features->size; ++i)
    setstr(env, format("CARGO_FEATURE_%s", identifier(str(node->features->items[i]), true)), "1");
  for (size_t i = 0; i < node->normal.size; ++i) {
    Node *child = node->normal.items[i].node;
    links = getstr(child->package->info, "links", NULL);
    if (links) for (size_t j = 0; j < child->metadata->size; ++j)
      setstr(env, identifier(format("DEP_%s_%s", links, child->metadata->keys[j]), true), str(child->metadata->items[j]));
  }
  if (p->build) environment_override(env, get(get(build_config, "build-script"), "env"));
  environment_override(env, get(get(get(build_config, "package"), p->name), "env"));
  return env;
}
static void hash_text(Sha256 *hash, const char *text) {
  uint64_t length = strlen(text);
  unsigned char size[8];
  for (size_t i = 0; i < 8; ++i) size[i] = (unsigned char)(length >> (8 * i));
  sha256_update(hash, size, sizeof(size)); sha256_update(hash, text, (size_t)length);
}
static bool within(const char *path, const char *root) {
  size_t n = strlen(root); return starts(path, root) && (!path[n] || path[n] == '/');
}
static void hash_tree(Sha256 *hash, const char *path, bool source) {
  if (source && (within(path, options.target) || equal(path, options.cache))) return;
  hash_text(hash, path);
  struct stat s;
  if (lstat(path, &s)) {
    if (errno == ENOENT) { hash_text(hash, "missing"); return; }
    fail("stat %s: %s", path, strerror(errno));
  }
  if (S_ISLNK(s.st_mode)) {
    char link[PATH_MAX]; ssize_t n = readlink(path, link, sizeof(link) - 1);
    if (n < 0 || (size_t)n == sizeof(link) - 1) fail("readlink %s", path);
    link[n] = 0; hash_text(hash, link);
    if (stat(path, &s)) fail("stat %s: %s", path, strerror(errno));
    if (!S_ISREG(s.st_mode)) fail("resume does not support directory symlinks: %s", path);
  }
  if (S_ISREG(s.st_mode)) { hash_text(hash, "file"); hash_text(hash, digest(path)); }
  else if (S_ISDIR(s.st_mode)) {
    hash_text(hash, "directory"); Value *names = value(ARRAY);
    DIR *dir = opendir(path); if (!dir) fail("opendir %s: %s", path, strerror(errno));
    struct dirent *entry;
    while ((entry = readdir(dir))) if (!equal(entry->d_name, ".") && !equal(entry->d_name, "..")) add(names, entry->d_name);
    closedir(dir); sort(names);
    for (size_t i = 0; i < names->size; ++i) hash_tree(hash, path_join(path, str(names->items[i])), source);
  } else fail("resume does not support special files: %s", path);
}
static char *fingerprint(Value *args, Package *p, Value *env) {
  Sha256 hash; sha256_init(&hash); hash_text(&hash, "patti-c-cache-2"); hash_text(&hash, toolchain_hash);
  for (size_t i = 0; i < args->size; ++i) hash_text(&hash, str(args->items[i]));
  Value *keys = value(ARRAY);
  for (size_t i = 0; i < env->size; ++i) add(keys, env->keys[i]);
  sort(keys);
  for (size_t i = 0; i < keys->size; ++i) {
    const char *key = str(keys->items[i]); hash_text(&hash, key); hash_text(&hash, str(get(env, key)));
  }
  hash_tree(&hash, p->root, true); hash_tree(&hash, str(get(env, "OUT_DIR")), false);
  for (size_t i = 0; i + 1 < args->size; ++i) {
    const char *arg = str(args->items[i]), *next = str(args->items[i + 1]), *eq = strchr(next, '=');
    if (equal(arg, "--extern") && eq) hash_tree(&hash, eq + 1, false);
    else if (equal(arg, "-L") && !starts(next, "dependency=")) hash_tree(&hash, absolute(path_join(p->root, eq ? eq + 1 : next)), false);
    else if (equal(arg, "-C") && starts(next, "link-arg=") && next[9] != '-')
      hash_tree(&hash, absolute(path_join(p->root, next + 9)), false);
  }
  return hash_finish(&hash);
}
static void prepare_cache(void) {
  Arena temporary = {0}; memory = &temporary;
  Sha256 hash; sha256_init(&hash);
  hash_tree(&hash, parent(parent(compiler)), false);
  if (exists("/usr/lib/dolly/process")) hash_tree(&hash, "/usr/lib/dolly/process", false);
  Value *inputs = get(get(build_config, "cache"), "inputs");
  for (size_t i = 0; i < inputs->size; ++i) hash_tree(&hash, absolute(str(inputs->items[i])), false);
  char *hex = hash_finish(&hash); memory = &permanent; toolchain_hash = copy(hex); release(&temporary);
}
static void execute(Value *args, Package *p, Value *env, const char *output) {
  Arena *previous = memory; memory = &permanent;
  Value *record = value(TABLE); put(record, "argv", value_copy(args)); setstr(record, "cwd", p->root);
  append(get(report, "commands"), record); memory = previous;
  char *artifact = NULL, *stamp = NULL, *key = NULL;
  if (equal(str(args->items[0]), compiler) && options.resume && !repairing()) {
    for (size_t i = 0; i + 1 < args->size; ++i) if (equal(str(args->items[i]), "-o")) artifact = (char *)str(args->items[i + 1]);
    if (artifact) {
      stamp = format("%s.fingerprint", artifact); key = fingerprint(args, p, env);
      if (exists(artifact) && exists(stamp) && equal(read_text(stamp), format("%s %s\n", key, digest(artifact)))) {
        printf("patti: reuse %s\n", artifact); fflush(stdout);
        memory = &permanent; put(record, "status", number(0)); put(record, "cached", boolean(true)); memory = previous;
        write_report(); return;
      }
      if (unlink(artifact) && errno != ENOENT) fail("unlink %s: %s", artifact, strerror(errno));
      if (unlink(stamp) && errno != ENOENT) fail("unlink %s: %s", stamp, strerror(errno));
    }
  }
  int status = run(args, p->root, env, output);
  memory = &permanent; put(record, "status", number(status)); memory = previous;
  write_report();
  if (status) {
    if (output) fputs(read_text(output), stderr);
    fail("%s: command exited %d: %s", p->id, status, str(args->items[0]));
  }
  if (stamp) {
    FILE *file = open_file(stamp, "w"); fprintf(file, "%s %s\n", key, digest(artifact)); close_file(file);
  }
}
static void compile(Node *node, const char *name, const char *source, const char *kind,
                    const char *output, Edges dependencies, Value *env, Value *extra) {
  Package *p = node->package;
  Sha256 hash; sha256_init(&hash);
  char *identity = format("%s:%s", p->id, node->context); sha256_update(&hash, identity, strlen(identity));
  char *key = hash_finish(&hash); key[16] = 0;
  Value *args = arguments(compiler, "--crate-name", name, source, "--edition", getstr(p->info, "edition", "2015"),
      "--crate-type", kind, "-C", format("opt-level=%d", options.opt), "-C", "panic=abort", "-C", "codegen-units=1",
      "-C", format("metadata=%s", key), "--cap-lints", "allow", "-L", format("dependency=%s", deps), "-o", output, NULL);
  for (size_t i = 0; i < node->features->size; ++i) {
    /* Feature names come from Cargo manifests and must remain one rustc token. */
    const char *feature = str(node->features->items[i]);
    char *quoted_feature = allocate(strlen(feature) * 6 + 3), *end = quoted_feature;
    *end++ = '"';
    for (const unsigned char *c = (const unsigned char *)feature; *c; ++c) {
      if (*c == '"' || *c == '\\') { *end++ = '\\'; *end++ = (char)*c; }
      else if (*c < 32) { snprintf(end, 7, "\\u%04x", *c); end += 6; }
      else *end++ = (char)*c;
    }
    *end++ = '"'; *end = 0;
    append(args, string("--cfg")); append(args, string(format("feature=%s", quoted_feature)));
  }
  for (size_t i = 0; i < dependencies.size; ++i) {
    Edge edge = dependencies.items[i];
    if (!edge.node->artifact) fail("%s: missing dependency artifact: %s", p->id, edge.alias);
    append(args, string("--extern")); append(args, string(format("%s=%s", edge.alias, edge.node->artifact)));
  }
  if (equal(kind, "proc-macro")) { append(args, string("--extern")); append(args, string("proc_macro")); }
  if (extra) for (size_t i = 0; i < extra->size; ++i) append(args, extra->items[i]);
  Value *rules = get(build_config, "rustc");
  for (size_t i = 0; i < rules->size; ++i) {
    Value *rule = rules->items[i];
    if (!equal(getstr(rule, "package", p->name), p->name) || !equal(getstr(rule, "crate-name", name), name) ||
        !equal(getstr(rule, "crate-type", kind), kind) || !equal(getstr(rule, "context", node->context), node->context)) continue;
    Value *extra_args = get(rule, "args");
    for (size_t j = 0; j < extra_args->size; ++j) append(args, extra_args->items[j]);
  }
  env = value_copy(env); setstr(env, "CARGO_CRATE_NAME", name);
  if (equal(kind, "bin")) setstr(env, "CARGO_BIN_NAME", name);
  bool selected = options.only_output ? equal(options.only_output, output) :
    options.only && equal(options.only, name) && equal(kind, "rlib") && equal(node->context, "target");
  if (repairing() && !selected) {
    if (!exists(output)) fail("--only requires an existing artifact: %s", output);
    return;
  }
  execute(args, p, env, NULL);
  if (repairing()) only_compiled = true;
}
static void build_instructions(Node *node, const char *log, Value *env, Value *extra) {
  char *contents = read_text(log), *save;
  bool links = get(node->package->info, "links")->type != NIL;
  for (char *line = strtok_r(contents, "\n", &save); line; line = strtok_r(NULL, "\n", &save)) {
    size_t len = strlen(line); if (len && line[len - 1] == '\r') line[len - 1] = 0;
    if (!starts(line, "cargo:")) continue;
    char *key = line + 6; if (*key == ':') ++key;
    char *eq = strchr(key, '='); if (!eq) fail("malformed build instruction: %s", line);
    *eq = 0; char *v = eq + 1;
    if (equal(key, "rustc-cfg") || equal(key, "rustc-check-cfg")) {
      append(extra, string(equal(key, "rustc-cfg") ? "--cfg" : "--check-cfg")); append(extra, string(v));
    } else if (equal(key, "rustc-env")) {
      eq = strchr(v, '='); if (!eq || eq == v) fail("invalid rustc-env instruction");
      *eq = 0; setstr(env, v, eq + 1);
    } else if (equal(key, "rustc-link-search") || equal(key, "rustc-link-lib")) {
      append(extra, string(equal(key, "rustc-link-search") ? "-L" : "-l")); append(extra, string(v));
    } else if (equal(key, "warning")) {
      printf("patti: %s: %s\n", node->package->id, v); fflush(stdout);
    } else if (links && !starts(key, "rustc-") && !starts(key, "rerun-")) {
      if (equal(key, "metadata")) {
        eq = strchr(v, '='); if (!eq) fail("invalid metadata instruction");
        *eq = 0; key = v; v = eq + 1;
      }
      Arena *previous = memory; memory = &permanent; setstr(node->metadata, key, v); memory = previous;
    } else if (!equal(key, "rerun-if-changed") && !equal(key, "rerun-if-env-changed")) fail("unsupported build instruction: %s=%s", key, v);
  }
}
static void build(Node *node, bool root) {
  if (node->state == 2) return;
  if (node->state == 1) fail("dependency cycle at %s", node->package->id);
  node->state = 1;
  for (size_t i = 0; i < node->normal.size; ++i) build(node->normal.items[i].node, false);
  for (size_t i = 0; i < node->build.size; ++i) build(node->build.items[i].node, false);
  Arena temporary = {0}; memory = &temporary;
  Package *p = node->package; Value *types = get(p->lib, "crate-type");
  if (types->type != NIL && (types->type != ARRAY || types->size != 1 ||
      (!equal(str(types->items[0]), "rlib") && !equal(str(types->items[0]), "lib"))))
    fail("%s: dynamic Rust libraries are not supported", p->id);
  printf("patti: compile %s (%s)\n", p->id, node->context); fflush(stdout);
  char *directory = format("%s/build/%s-%s", options.target, p->id, node->context);
  char *out = path_join(directory, "out"); mkdirs(out);
  Value *env = environment(node, out), *extra = value(ARRAY);
  if (p->build) {
    char *script = path_join(directory, "build-script"), *log = path_join(directory, "output");
    compile(node, "build_script_build", path_join(p->root, p->build), "bin", script, node->build, env, NULL);
    if (only_compiled) goto done;
    if (!repairing()) execute(arguments(script, NULL), p, env, log);
    build_instructions(node, log, env, extra);
  }
  const char *lib_source = path_join(p->root, getstr(p->lib, "path", "src/lib.rs"));
  if (exists(lib_source)) {
    const char *name = getstr(p->lib, "name", identifier(p->name, false));
    bool macro = getbool(p->lib, "proc-macro", false);
    char *artifact = format("%s/%s%s-%s-%s.%s", deps, macro ? "" : "lib", name, p->version, node->context, macro ? "wasm" : "rlib");
    compile(node, name, lib_source, macro ? "proc-macro" : "rlib", artifact, node->normal, env, extra);
    memory = &permanent; node->artifact = copy(artifact); memory = &temporary;
    if (only_compiled) goto done;
  } else if (!root) fail("%s: dependency has no library", p->id);
  if (root && !options.only) {
    Value *bins = get(p->manifest, "bin");
    if (!bins->size && getbool(p->info, "autobins", true) && exists(path_join(p->root, "src/main.rs"))) {
      bins = value(ARRAY); Value *entry = value(TABLE); setstr(entry, "name", p->name); setstr(entry, "path", "src/main.rs"); append(bins, entry);
    }
    Value *selected = NULL;
    for (size_t i = 0; i < bins->size; ++i) if (!options.binary || equal(options.binary, str(get(bins->items[i], "name")))) {
      if (selected) fail("select exactly one binary with --bin");
      selected = bins->items[i];
    }
    if (!selected) fail("select exactly one binary with --bin");
    Value *required = get(selected, "required-features");
    for (size_t i = 0; i < required->size; ++i) if (!contains(node->features, str(required->items[i]))) fail("%s: missing required features", str(get(selected, "name")));
    Edges dependencies = {0};
    for (size_t i = 0; i < node->normal.size; ++i) edge_put(&dependencies, node->normal.items[i].alias, node->normal.items[i].node);
    if (node->artifact) edge_put(&dependencies, getstr(p->lib, "name", identifier(p->name, false)), node);
    const char *name = str(get(selected, "name"));
    char *destination = path_join(options.target, name);
    compile(node, identifier(name, false), path_join(p->root, getstr(selected, "path", "src/main.rs")), "bin", destination, dependencies, env, extra);
    memory = &permanent; setstr(report, "binary", destination); memory = &temporary;
    printf("patti: built %s\n", destination); fflush(stdout);
  }
done:
  node->state = 2; memory = &permanent; release(&temporary);
}

static Node *output_node(const char *output) {
  Node *found = NULL;
  for (Node *node = nodes; node; node = node->next) {
    Package *p = node->package;
    bool matches = p->build && equal(output, format("%s/build/%s-%s/build-script", options.target, p->id, node->context));
    const char *name = getstr(p->lib, "name", identifier(p->name, false));
    bool macro = getbool(p->lib, "proc-macro", false);
    if (exists(path_join(p->root, getstr(p->lib, "path", "src/lib.rs"))))
      matches |= equal(output, format("%s/%s%s-%s-%s.%s", deps, macro ? "" : "lib", name, p->version, node->context, macro ? "wasm" : "rlib"));
    Value *bins = get(p->manifest, "bin");
    if (equal(node->context, "target")) {
      for (size_t i = 0; i < bins->size; ++i) {
        const char *binary = str(get(bins->items[i], "name"));
        if (equal(output, path_join(options.target, binary))) { matches = true; options.binary = binary; }
      }
      if (!bins->size && getbool(p->info, "autobins", true) && exists(path_join(p->root, "src/main.rs")) && equal(output, path_join(options.target, p->name))) {
        matches = true; options.binary = p->name;
      }
    }
    if (matches) {
      if (found) fail("ambiguous compiler output: %s", output);
      found = node;
    }
  }
  if (!found) fail("compiler output is absent from the resolved graph: %s", output);
  return found;
}

static const char *find_compiler(const char *name) {
  if (strchr(name, '/')) { if (!exists(name)) fail("compiler not found: %s", name); return absolute(name); }
  char *paths = copy(getenv("PATH") ? getenv("PATH") : "/usr/bin:/bin"), *save;
  for (char *p = strtok_r(paths, ":", &save); p; p = strtok_r(NULL, ":", &save)) {
    char *path = path_join(p, name);
    if (!access(path, X_OK)) return absolute(path);
  }
  fail("compiler not found: %s", name);
}
static char *capture(Value *args) {
  char *path = format("%s/.patti-capture-XXXXXX", options.target);
  int fd = mkstemp(path); if (fd < 0) fail("temporary output: %s", strerror(errno)); close(fd);
  int status = run(args, NULL, NULL, path);
  char *text = read_text(path); unlink(path);
  if (status) fail("command exited %d: %s", status, str(args->items[0]));
  return text;
}
static void initialize(void) {
  documents = value(TABLE); cfg = value(TABLE); report = value(TABLE);
  build_config = options.config ? toml(options.config) : value(TABLE);
  char *workspace;
  workspace_manifest(options.manifest, &workspace);
  records = get(document(path_join(workspace, "Cargo.lock")), "package");
  if (records->type != ARRAY) fail("Cargo.lock requires a package array");
  Value *config = document(path_join(workspace, "Cargo.toml"));
  if (get(config, "replace")->type != NIL) fail("manifest replace tables are not supported");
  Value *patches = get(config, "patch");
  for (size_t i = 0; i < patches->size; ++i) {
    Value *entries = patches->items[i];
    for (size_t j = 0; j < entries->size; ++j) {
      Value *spec = entries->items[j]; const char *name = getstr(spec, "package", entries->keys[j]);
      if (get(options.patches, name)->type != NIL) continue;
      const char *path = getstr(spec, "path", NULL);
      if (!path) fail("provide pinned source for workspace patch with --patch %s=PATH", name);
      setstr(options.patches, name, absolute(path_join(workspace, path)));
    }
  }
  compiler = find_compiler(options.rustc); deps = path_join(options.target, "deps"); mkdirs(options.target);
  char *output = capture(arguments(compiler, "--print", "cfg", "-C", "panic=abort", "-C", format("opt-level=%d", options.opt), NULL)), *save;
  for (char *line = strtok_r(output, "\n", &save); line; line = strtok_r(NULL, "\n", &save)) {
    char *eq = strchr(line, '='); Value *item = &nil;
    if (eq) { *eq = 0; const char *p = eq + 1; item = string(quoted(&p)); spaces(&p); if (*p) fail("invalid compiler cfg"); }
    Value *items = get(cfg, line);
    if (items->type == NIL) { items = value(ARRAY); put(cfg, line, items); }
    append(items, item);
  }
  char *version_text = capture(arguments(compiler, "--version", "--verbose", NULL));
  char *lines = copy(version_text);
  for (char *line = strtok_r(lines, "\n", &save); line; line = strtok_r(NULL, "\n", &save)) if (starts(line, "host: ")) triple = copy(line + 6);
  if (!triple) fail("compiler did not report a host triple");
  put(report, "patti", number(1)); setstr(report, "compiler", version_text); setstr(report, "target", triple);
  put(report, "commands", value(ARRAY)); put(report, "packages", value(ARRAY));
}
static void usage(void) {
  puts("Usage: patti fetch|build [options]\n"
       "Build locked Rust packages with Dolly's rustc and broker-backed curl.\n\n"
       "  --manifest-path PATH       Cargo.toml (default: ./Cargo.toml)\n"
       "  --bin NAME                 Select one binary\n"
       "  --features A,B             Enable features\n"
       "  --no-default-features      Disable root default features\n"
       "  --offline                  Use only verified cached archives\n"
       "  --cache PATH               Archive/source cache (default: ~/.cache/patti)\n"
       "  --registry URL             Direct archive mirror (default: static.crates.io/crates)\n"
       "  --patch NAME[@VERSION]=PATH Override pinned dependency source\n"
       "  --rustc PATH               Compiler (default: rustc)\n"
       "  --target-dir PATH          Output directory (default: target/patti)\n"
       "  --opt-level 0|1|2|3        Optimization level (default: 1)\n"
       "  --config PATH             Explicit TOML environment/compiler settings\n"
       "  --resume                  Reuse content-verified artifacts; rerun build scripts\n"
       "  --package NAME            Build a package within the root's resolved graph\n"
       "  --only CRATE              Recompile one target rlib using existing build outputs\n"
       "  --only-output PATH        Recompile one binary, build script, rlib or macro");
}
int main(int argc, char **argv) {
  options = (Options){.manifest = "Cargo.toml", .features = "", .cache = path_join(getenv("HOME") ? getenv("HOME") : "/", ".cache/patti"),
    .registry = "https://static.crates.io/crates", .rustc = "rustc", .target = "target/patti", .opt = 1, .patches = value(TABLE)};
  for (int i = 1; i < argc; ++i) {
    const char *arg = argv[i];
    if (equal(arg, "--help") || equal(arg, "-h")) { usage(); release(&permanent); return 0; }
    if (equal(arg, "--offline")) { options.offline = true; continue; }
    if (equal(arg, "--no-default-features")) { options.no_default = true; continue; }
    if (equal(arg, "--resume")) { options.resume = true; continue; }
    if (arg[0] != '-') {
      if (options.command || (!equal(arg, "build") && !equal(arg, "fetch"))) fail("expected fetch or build: %s", arg);
      options.command = arg; continue;
    }
    const char *v = strchr(arg, '=');
    if (v) { arg = slice(arg, (size_t)(v - arg)); ++v; }
    else { if (++i >= argc) fail("missing value: %s", arg); v = argv[i]; }
    if (equal(arg, "--manifest-path")) options.manifest = v;
    else if (equal(arg, "--bin")) options.binary = v;
    else if (equal(arg, "--features")) options.features = v;
    else if (equal(arg, "--cache")) options.cache = v;
    else if (equal(arg, "--registry")) options.registry = v;
    else if (equal(arg, "--rustc")) options.rustc = v;
    else if (equal(arg, "--target-dir")) options.target = v;
    else if (equal(arg, "--config")) options.config = absolute(v);
    else if (equal(arg, "--package")) options.package = v;
    else if (equal(arg, "--only")) options.only = v;
    else if (equal(arg, "--only-output")) options.only_output = absolute(v);
    else if (equal(arg, "--opt-level")) {
      if (strlen(v) != 1 || *v < '0' || *v > '3') fail("--opt-level requires 0, 1, 2 or 3");
      options.opt = *v - '0';
    } else if (equal(arg, "--patch")) {
      const char *eq = strchr(v, '='); if (!eq || eq == v || !eq[1]) fail("--patch requires NAME[@VERSION]=PATH");
      setstr(options.patches, slice(v, (size_t)(eq - v)), absolute(eq + 1));
    } else fail("unknown option: %s", arg);
  }
  if (!options.command) fail("expected fetch or build; see patti --help");
  options.manifest = absolute(options.manifest); options.cache = absolute(options.cache); options.target = absolute(options.target);
  char *registry = copy(options.registry); size_t len = strlen(registry);
  while (len && registry[len - 1] == '/') registry[--len] = 0;
  options.registry = registry;
  if ((options.only && options.only_output) || (repairing() && options.package)) fail("select only one of --package, --only or --only-output");
  initialize(); Node *root = resolve(); write_report();
  if (options.package) {
    root = NULL;
    for (Node *n = nodes; n; n = n->next) if (equal(n->package->name, options.package) && equal(n->context, "target")) {
      if (root) fail("ambiguous package: %s", options.package);
      root = n;
    }
    if (!root) fail("package is absent from resolved graph: %s", options.package);
  }
  if (options.only) {
    size_t matches = 0;
    for (Node *n = nodes; n; n = n->next) {
      if (equal(n->context, "target") && equal(getstr(n->package->lib, "name", identifier(n->package->name, false)), options.only)) {
        ++matches; root = n;
      }
    }
    if (matches != 1) fail("--only requires one target crate: %s", options.only);
  }
  if (options.only_output) root = output_node(options.only_output);
  printf("patti: resolved %zu packages from Cargo.lock\n", get(report, "packages")->size); fflush(stdout);
  if (equal(options.command, "build")) {
    Arena temporary = {0}; memory = &temporary;
    if (!options.resume && !repairing()) { remove_tree(deps); remove_tree(path_join(options.target, "build")); }
    mkdirs(deps);
    memory = &permanent; release(&temporary);
    if (options.resume && !repairing()) prepare_cache();
    build(root, true);
    if (repairing() && !only_compiled) fail("selected compiler output was not built");
    write_report();
  }
  release(&permanent); return 0;
}
