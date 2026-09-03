#define _POSIX_C_SOURCE 200809L

#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>

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
  if (strcmp(operation, "-e") == 0 || strcmp(operation, "-r") == 0 ||
      strcmp(operation, "-w") == 0) return stat(value, &metadata) == 0;
  if (strcmp(operation, "-f") == 0) return stat(value, &metadata) == 0 && S_ISREG(metadata.st_mode);
  // Dolly has no execute permission bits. PATH resolution likewise accepts a
  // regular file and leaves Wasm-format/ABI validation to the loader.
  if (strcmp(operation, "-x") == 0) return stat(value, &metadata) == 0 && S_ISREG(metadata.st_mode);
  if (strcmp(operation, "-d") == 0) return stat(value, &metadata) == 0 && S_ISDIR(metadata.st_mode);
  if (strcmp(operation, "-s") == 0) return stat(value, &metadata) == 0 && metadata.st_size > 0;
  *known = 0;
  return 0;
}

static int integer(const char *left, const char *operation, const char *right, int *known) {
  char *left_end, *right_end;
  errno = 0;
  const long long a = strtoll(left, &left_end, 10), b = strtoll(right, &right_end, 10);
  if (errno != 0 || left_end == left || right_end == right ||
      *left_end != '\0' || *right_end != '\0') return -1;
  *known = 1;
  if (strcmp(operation, "-eq") == 0) return a == b;
  if (strcmp(operation, "-ne") == 0) return a != b;
  if (strcmp(operation, "-gt") == 0) return a > b;
  if (strcmp(operation, "-ge") == 0) return a >= b;
  if (strcmp(operation, "-lt") == 0) return a < b;
  if (strcmp(operation, "-le") == 0) return a <= b;
  *known = 0;
  return 0;
}

enum { EXPRESSION_DEPTH_LIMIT = 64 };

static int top_level_operator(int argc, char **argv, const char *operation,
                              int *error) {
  int parentheses = 0;
  for (int index = 0; index < argc; ++index) {
    if (strcmp(argv[index], "(") == 0) {
      parentheses++;
    } else if (strcmp(argv[index], ")") == 0) {
      if (parentheses == 0) {
        *error = 1;
        return -1;
      }
      parentheses--;
    } else if (parentheses == 0 && strcmp(argv[index], operation) == 0) {
      return index;
    }
  }
  if (parentheses != 0) *error = 1;
  return -1;
}

static int outer_parentheses(int argc, char **argv, int *error) {
  if (argc < 2 || strcmp(argv[0], "(") != 0) return 0;
  int depth = 0;
  for (int index = 0; index < argc; ++index) {
    if (strcmp(argv[index], "(") == 0) depth++;
    else if (strcmp(argv[index], ")") == 0) {
      if (--depth < 0) {
        *error = 1;
        return 0;
      }
      if (depth == 0) return index == argc - 1;
    }
  }
  *error = 1;
  return 0;
}

static int evaluate(int argc, char **argv, int *error, unsigned depth) {
  *error = 0;
  if (argc == 0) return 0;
  if (argc == 1) return argv[0][0] != '\0';
  if (depth == EXPRESSION_DEPTH_LIMIT) {
    *error = 1;
    return 0;
  }
  if (outer_parentheses(argc, argv, error)) {
    if (argc == 2) {
      *error = 1;
      return 0;
    }
    return evaluate(argc - 2, argv + 1, error, depth + 1);
  }
  if (*error) return 0;

  int operation = top_level_operator(argc, argv, "-o", error);
  if (*error) return 0;
  if (operation >= 0) {
    if (operation == 0 || operation + 1 == argc) {
      *error = 1;
      return 0;
    }
    int left_error = 0;
    int right_error = 0;
    const int left = evaluate(operation, argv, &left_error, depth + 1);
    const int right = evaluate(argc - operation - 1, argv + operation + 1,
                               &right_error, depth + 1);
    *error = left_error || right_error;
    return left || right;
  }

  operation = top_level_operator(argc, argv, "-a", error);
  if (*error) return 0;
  if (operation >= 0) {
    if (operation == 0 || operation + 1 == argc) {
      *error = 1;
      return 0;
    }
    int left_error = 0;
    int right_error = 0;
    const int left = evaluate(operation, argv, &left_error, depth + 1);
    const int right = evaluate(argc - operation - 1, argv + operation + 1,
                               &right_error, depth + 1);
    *error = left_error || right_error;
    return left && right;
  }

  if (strcmp(argv[0], "!") == 0) {
    return !evaluate(argc - 1, argv + 1, error, depth + 1);
  }
  if (argc == 2) {
    int known;
    const int result = unary(argv[0], argv[1], &known);
    if (known) return result;
  }
  if (argc == 3) {
    if (strcmp(argv[1], "=") == 0 || strcmp(argv[1], "==") == 0) return strcmp(argv[0], argv[2]) == 0;
    if (strcmp(argv[1], "!=") == 0) return strcmp(argv[0], argv[2]) != 0;
    int known = 0;
    const int result = integer(argv[0], argv[1], argv[2], &known);
    if (result < 0) { *error = 1; return 0; }
    if (known) return result;
  }
  *error = 1;
  return 0;
}

int main(int argc, char **argv) {
  argc--; argv++;
  if (DOLLY_BRACKET) {
    if (argc == 0 || strcmp(argv[argc - 1], "]") != 0) { fputs("[: missing ]\n", stderr); return 2; }
    argc--;
  }
  int error = 0;
  const int result = evaluate(argc, argv, &error, 0);
  if (error) { fputs(DOLLY_BRACKET ? "[: unsupported expression\n" : "test: unsupported expression\n", stderr); return 2; }
  return result ? 0 : 1;
}
