#define _XOPEN_SOURCE 700

#include <errno.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

#ifndef DOLLY_BRACKET
#define DOLLY_BRACKET 0
#endif

static int unary(const char *operation, const char *value, int *known) {
  struct stat metadata;
  *known = 1;
  if (strcmp(operation, "-n") == 0) return value[0] != '\0';
  if (strcmp(operation, "-z") == 0) return value[0] == '\0';
  if (strcmp(operation, "-L") == 0 || strcmp(operation, "-h") == 0)
    return lstat(value, &metadata) == 0 && S_ISLNK(metadata.st_mode);
  if (strcmp(operation, "-t") == 0) {
    char *end;
    errno = 0;
    const long descriptor = strtol(value, &end, 10);
    return errno == 0 && end != value && *end == '\0' && descriptor >= 0 &&
           descriptor <= INT_MAX && isatty((int)descriptor);
  }
  static const char *const file_tests = "-e-r-w-f-x-d-s-b-c-p-S-g-u-k";
  const char *found = operation[0] == '-' && operation[1] != '\0' && operation[2] == '\0'
      ? strstr(file_tests, operation) : NULL;
  if (found == NULL || (found - file_tests) % 2 != 0) {
    *known = 0;
    return 0;
  }
  if (stat(value, &metadata) != 0) return 0;
  switch (operation[1]) {
    // Dolly has no permission bits: a file that exists can be read and written.
    case 'e': case 'r': case 'w': return 1;
    case 'f': return S_ISREG(metadata.st_mode);
    // PATH resolution likewise accepts a regular file and leaves Wasm-format
    // and ABI validation to the loader; every directory can be searched.
    case 'x': return S_ISREG(metadata.st_mode) || S_ISDIR(metadata.st_mode);
    case 'd': return S_ISDIR(metadata.st_mode);
    case 's': return metadata.st_size > 0;
    case 'b': return S_ISBLK(metadata.st_mode);
    case 'c': return S_ISCHR(metadata.st_mode);
    case 'p': return S_ISFIFO(metadata.st_mode);
    case 'S': return S_ISSOCK(metadata.st_mode);
    case 'g': return (metadata.st_mode & S_ISGID) != 0;
    case 'u': return (metadata.st_mode & S_ISUID) != 0;
    default: return (metadata.st_mode & S_ISVTX) != 0;
  }
}

static int newer(const struct stat *a, const struct stat *b) {
  return a->st_mtim.tv_sec != b->st_mtim.tv_sec ? a->st_mtim.tv_sec > b->st_mtim.tv_sec
                                                : a->st_mtim.tv_nsec > b->st_mtim.tv_nsec;
}

static int integer(const char *text, long long *value) {
  char *end;
  errno = 0;
  *value = strtoll(text, &end, 10);
  return errno == 0 && end != text && *end == '\0';
}

// The binary primaries. POSIX.1-2024: a path that resolves to no file is
// older than one that does.
static int binary(const char *left, const char *operation, const char *right,
                  int *known, int *error) {
  *known = 1;
  if (strcmp(operation, "=") == 0 || strcmp(operation, "==") == 0) return strcmp(left, right) == 0;
  if (strcmp(operation, "!=") == 0) return strcmp(left, right) != 0;
  if (strcmp(operation, "<") == 0) return strcoll(left, right) < 0;
  if (strcmp(operation, ">") == 0) return strcoll(left, right) > 0;
  if (strcmp(operation, "-ef") == 0 || strcmp(operation, "-nt") == 0 || strcmp(operation, "-ot") == 0) {
    struct stat a, b;
    const int has_a = stat(left, &a) == 0, has_b = stat(right, &b) == 0;
    if (operation[1] == 'e') return has_a && has_b && a.st_dev == b.st_dev && a.st_ino == b.st_ino;
    if (operation[1] == 'n') return has_a && (!has_b || newer(&a, &b));
    return has_b && (!has_a || newer(&b, &a));
  }
  static const char *const comparisons[] = {"-eq", "-ne", "-gt", "-ge", "-lt", "-le"};
  for (size_t index = 0; index < sizeof(comparisons) / sizeof(comparisons[0]); index++) {
    if (strcmp(operation, comparisons[index]) != 0) continue;
    long long a, b;
    if (!integer(left, &a) || !integer(right, &b)) {
      *error = 1;
      return 0;
    }
    const long long results[] = {a == b, a != b, a > b, a >= b, a < b, a <= b};
    return (int)results[index];
  }
  *known = 0;
  return 0;
}

static int binary_primary(const char *word) {
  int known, error = 0;
  (void)binary("", word, "", &known, &error);
  return known;
}

enum { EXPRESSION_DEPTH_LIMIT = 64 };

// Expressions of more than four arguments, as XSI's test reads them:
// `-o` binds looser than `-a`, `!` negates, parentheses group.
typedef struct {
  int argc;
  char **argv;
  int next;
  int error;
} Parser;

static int parse_or(Parser *parser, unsigned depth);

static const char *peek(const Parser *parser, int offset) {
  return parser->next + offset < parser->argc ? parser->argv[parser->next + offset] : NULL;
}

static int parse_primary(Parser *parser, unsigned depth) {
  const char *word = peek(parser, 0);
  if (word == NULL || depth == EXPRESSION_DEPTH_LIMIT) {
    parser->error = 1;
    return 0;
  }
  if (strcmp(word, "!") == 0) {
    parser->next++;
    return !parse_primary(parser, depth + 1);
  }
  const char *second = peek(parser, 1);
  if (second != NULL && peek(parser, 2) != NULL && binary_primary(second)) {
    int known;
    parser->next += 3;
    return binary(word, second, parser->argv[parser->next - 1], &known, &parser->error);
  }
  if (strcmp(word, "(") == 0) {
    parser->next++;
    const int result = parse_or(parser, depth + 1);
    const char *closing = peek(parser, 0);
    if (closing == NULL || strcmp(closing, ")") != 0) parser->error = 1;
    parser->next++;
    return result;
  }
  if (second != NULL) {
    int known;
    const int result = unary(word, second, &known);
    if (known) {
      parser->next += 2;
      return result;
    }
  }
  parser->next++;
  return word[0] != '\0';
}

static int parse_and(Parser *parser, unsigned depth) {
  int result = parse_primary(parser, depth);
  while (!parser->error && peek(parser, 0) != NULL && strcmp(peek(parser, 0), "-a") == 0) {
    parser->next++;
    result = parse_primary(parser, depth) && result;
  }
  return result;
}

static int parse_or(Parser *parser, unsigned depth) {
  int result = parse_and(parser, depth);
  while (!parser->error && peek(parser, 0) != NULL && strcmp(peek(parser, 0), "-o") == 0) {
    parser->next++;
    result = parse_and(parser, depth) || result;
  }
  return result;
}

// POSIX decides by the number of arguments up to four, so an operand that
// looks like an operator (test "$x" = -a) is still an operand.
static int evaluate(int argc, char **argv, int *error) {
  *error = 0;
  int known;
  switch (argc) {
    case 0:
      return 0;
    case 1:
      return argv[0][0] != '\0';
    case 2:
      if (strcmp(argv[0], "!") == 0) return argv[1][0] == '\0';
      {
        const int result = unary(argv[0], argv[1], &known);
        if (known) return result;
      }
      *error = 1;
      return 0;
    case 3: {
      if (strcmp(argv[1], "-a") == 0 || strcmp(argv[1], "-o") == 0) break;
      const int result = binary(argv[0], argv[1], argv[2], &known, error);
      if (known) return result;
      if (strcmp(argv[0], "!") == 0) return !evaluate(2, argv + 1, error);
      if (strcmp(argv[0], "(") == 0 && strcmp(argv[2], ")") == 0) return evaluate(1, argv + 1, error);
      break;
    }
    case 4:
      if (strcmp(argv[0], "!") == 0) return !evaluate(3, argv + 1, error);
      if (strcmp(argv[0], "(") == 0 && strcmp(argv[3], ")") == 0) return evaluate(2, argv + 1, error);
      break;
  }
  Parser parser = {.argc = argc, .argv = argv};
  const int result = parse_or(&parser, 0);
  *error = parser.error || parser.next != argc;
  return result;
}

int main(int argc, char **argv) {
  argc--; argv++;
  if (DOLLY_BRACKET) {
    if (argc == 0 || strcmp(argv[argc - 1], "]") != 0) { fputs("[: missing ]\n", stderr); return 2; }
    argc--;
  }
  int error = 0;
  const int result = evaluate(argc, argv, &error);
  if (error) { fputs(DOLLY_BRACKET ? "[: unsupported expression\n" : "test: unsupported expression\n", stderr); return 2; }
  return result ? 0 : 1;
}
