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
  if (strcmp(operation, "-e") == 0) return lstat(value, &metadata) == 0;
  if (strcmp(operation, "-f") == 0) return lstat(value, &metadata) == 0 && S_ISREG(metadata.st_mode);
  if (strcmp(operation, "-d") == 0) return lstat(value, &metadata) == 0 && S_ISDIR(metadata.st_mode);
  if (strcmp(operation, "-s") == 0) return lstat(value, &metadata) == 0 && metadata.st_size > 0;
  if (strcmp(operation, "-L") == 0 || strcmp(operation, "-h") == 0)
    return lstat(value, &metadata) == 0 && S_ISLNK(metadata.st_mode);
  *known = 0;
  return 0;
}

static int integer(const char *left, const char *operation, const char *right, int *known) {
  char *left_end, *right_end;
  errno = 0;
  const long long a = strtoll(left, &left_end, 10), b = strtoll(right, &right_end, 10);
  if (errno != 0 || *left_end != '\0' || *right_end != '\0') return -1;
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

static int evaluate(int argc, char **argv, int *error) {
  *error = 0;
  if (argc == 0) return 0;
  if (argc >= 2 && strcmp(argv[0], "!") == 0) {
    return !evaluate(argc - 1, argv + 1, error);
  }
  if (argc == 1) return argv[0][0] != '\0';
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
  const int result = evaluate(argc, argv, &error);
  if (error) { fputs(DOLLY_BRACKET ? "[: unsupported expression\n" : "test: unsupported expression\n", stderr); return 2; }
  return result ? 0 : 1;
}
