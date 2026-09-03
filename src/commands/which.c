#define _POSIX_C_SOURCE 200809L

#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>

static int regular_file(const char *path) {
  struct stat metadata;
  return stat(path, &metadata) == 0 && S_ISREG(metadata.st_mode);
}

static int print_match(const char *directory, size_t directory_length,
                       const char *name) {
  const char *prefix = directory_length == 0 ? "." : directory;
  if (directory_length == 0) directory_length = 1;
  const size_t name_length = strlen(name);
  if (directory_length > SIZE_MAX - name_length - 2) return -1;
  char *path = malloc(directory_length + name_length + 2);
  if (path == NULL) return -1;
  memcpy(path, prefix, directory_length);
  size_t length = directory_length;
  if (length == 0 || path[length - 1] != '/') path[length++] = '/';
  memcpy(path + length, name, name_length + 1);
  int found = regular_file(path);
  if (found) puts(path);
  free(path);
  return found;
}

int main(int argc, char **argv) {
  int all = 0;
  int first = 1;
  for (; first < argc; first++) {
    if (strcmp(argv[first], "--help") == 0) {
      fputs("usage: which [-a] [--] COMMAND ...\n", stdout);
      return 0;
    }
    if (strcmp(argv[first], "--") == 0) {
      first++;
      break;
    }
    if (strcmp(argv[first], "-a") == 0) {
      all = 1;
      continue;
    }
    if (argv[first][0] == '-' && argv[first][1] != '\0') {
      fprintf(stderr, "which: unsupported option: %s\n", argv[first]);
      return 2;
    }
    break;
  }
  if (first == argc) {
    fprintf(stderr, "usage: %s [-a] command ...\n", argv[0]);
    return 2;
  }

  const char *search = getenv("PATH");
  if (search == NULL) search = "";
  int missing = 0;
  for (int argument = first; argument < argc; ++argument) {
    const char *name = argv[argument];
    int found = 0;
    if (strchr(name, '/') != NULL) {
      if (regular_file(name)) {
        puts(name);
        found = 1;
      }
    } else {
      const char *entry = search;
      do {
        const char *separator = strchr(entry, ':');
        const size_t length = separator == NULL
                                  ? strlen(entry)
                                  : (size_t)(separator - entry);
        const int match = print_match(entry, length, name);
        if (match < 0) {
          fputs("which: out of memory\n", stderr);
          return 2;
        }
        if (match) {
          found = 1;
          if (!all) break;
        }
        if (separator == NULL) break;
        entry = separator + 1;
      } while (1);
    }
    if (!found) {
      fprintf(stderr, "which: %s: command not found\n", name);
      missing = 1;
    }
  }
  return missing;
}
