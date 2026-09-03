#define _POSIX_C_SOURCE 200809L
#define _XOPEN_SOURCE 700

#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#include <dolly/runtime.h>

static void usage(FILE *stream) {
  fputs("usage: patch [-pN] [-R] [-s] [--dry-run] [-d DIR] [-i FILE]\n"
        "Dolly applies finite unified patches with source-built git apply.\n", stream);
}

static int append(char **arguments, size_t capacity, int *count,
                  const char *value) {
  if ((size_t)*count + 1 >= capacity) return 0;
  arguments[(*count)++] = (char *)value;
  return 1;
}

int main(int argc, char **argv) {
  if ((size_t)argc > SIZE_MAX / sizeof(char *) - 5) {
    fputs("patch: too many arguments\n", stderr);
    return 2;
  }
  const size_t capacity = (size_t)argc + 5;
  char **arguments = calloc(capacity, sizeof(*arguments));
  if (arguments == NULL) {
    fprintf(stderr, "patch: %s\n", strerror(errno));
    return 2;
  }
  int count = 0;
  append(arguments, capacity, &count, "git");
  append(arguments, capacity, &count, "--no-pager");
  append(arguments, capacity, &count, "apply");

  const char *directory = NULL;
  const char *input = NULL;
  for (int index = 1; index < argc; index++) {
    const char *option = argv[index];
    if (strcmp(option, "--help") == 0) {
      usage(stdout);
      free(arguments);
      return 0;
    }
    if (strcmp(option, "--") == 0) {
      if (++index < argc) {
        if (index + 1 != argc || input != NULL) goto operand_error;
        input = argv[index];
      }
      break;
    }
    if (strcmp(option, "-d") == 0 || strcmp(option, "--directory") == 0) {
      if (++index == argc || directory != NULL) goto usage_error;
      directory = argv[index];
    } else if (strncmp(option, "--directory=", 12) == 0) {
      if (directory != NULL || option[12] == '\0') goto usage_error;
      directory = option + 12;
    } else if (strcmp(option, "-i") == 0 || strcmp(option, "--input") == 0) {
      if (++index == argc || input != NULL) goto usage_error;
      input = argv[index];
    } else if (strncmp(option, "--input=", 8) == 0) {
      if (input != NULL || option[8] == '\0') goto usage_error;
      input = option + 8;
    } else if (strcmp(option, "--dry-run") == 0) {
      if (!append(arguments, capacity, &count, "--check")) goto memory_error;
    } else if (strcmp(option, "-s") == 0 || strcmp(option, "--silent") == 0 ||
               strcmp(option, "--quiet") == 0) {
      if (!append(arguments, capacity, &count, "--quiet")) goto memory_error;
    } else if (strcmp(option, "-R") == 0 || strcmp(option, "--reverse") == 0 ||
               (option[0] == '-' && option[1] == 'p' && option[2] != '\0')) {
      if (!append(arguments, capacity, &count, option)) goto memory_error;
    } else if (option[0] == '-') {
      fprintf(stderr, "patch: unsupported option: %s\n", option);
      free(arguments);
      return 2;
    } else {
      if (input != NULL) goto operand_error;
      input = option;
    }
  }

  char resolved_input[4096];
  if (input != NULL && directory != NULL) {
    if (realpath(input, resolved_input) == NULL) {
      fprintf(stderr, "patch: %s: %s\n", input, strerror(errno));
      free(arguments);
      return 1;
    }
    input = resolved_input;
  }
  if (input != NULL && !append(arguments, capacity, &count, input)) goto memory_error;
  if (directory != NULL && chdir(directory) != 0) {
    fprintf(stderr, "patch: %s: %s\n", directory, strerror(errno));
    free(arguments);
    return 1;
  }

  const int pid = dolly_spawn("/usr/bin/git", count, arguments, 0, 1, 2);
  free(arguments);
  if (pid < 0) {
    fprintf(stderr, "patch: git apply is unavailable: %s\n", strerror(-pid));
    return 2;
  }
  int status;
  const int waited = dolly_wait(pid, &status);
  if (waited < 0) {
    fprintf(stderr, "patch: wait failed: %s\n", strerror(-waited));
    return 2;
  }
  return status;

operand_error:
  fputs("patch: expected at most one patch file; use -i FILE\n", stderr);
  free(arguments);
  return 2;
usage_error:
  usage(stderr);
  free(arguments);
  return 2;
memory_error:
  fputs("patch: out of memory\n", stderr);
  free(arguments);
  return 2;
}
