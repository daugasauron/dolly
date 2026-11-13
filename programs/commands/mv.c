#define _POSIX_C_SOURCE 200809L

#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>

#include "path.h"

static int move_one(const char *source, const char *destination,
                    int destination_is_directory) {
  char *target = NULL;
  if (destination_is_directory) {
    char *name = base_name_copy(source);
    if (name == NULL) {
      fputs("mv: out of memory\n", stderr);
      return 1;
    }
    target = join_path(destination, name);
    if (target == NULL) {
      fprintf(stderr, "mv: %s/%s: %s\n", destination, name, strerror(errno));
      free(name);
      return 1;
    }
    free(name);
  }
  const char *resolved = target == NULL ? destination : target;
  if (rename(source, resolved) != 0) {
    fprintf(stderr, "mv: %s -> %s: %s\n", source, resolved, strerror(errno));
    free(target);
    return 1;
  }
  free(target);
  return 0;
}

int main(int argc, char **argv) {
  int first = 1;
  while (first < argc && argv[first][0] == '-') {
    if (strcmp(argv[first], "--") == 0) {
      first++;
      break;
    }
    if (strcmp(argv[first], "--help") == 0) {
      fputs("usage: mv [-f] [--] SOURCE... DESTINATION\n", stdout);
      return 0;
    }
    if (strcmp(argv[first], "-f") != 0) {
      fprintf(stderr, "mv: unsupported option %s\n", argv[first]);
      return 2;
    }
    first++;
  }
  if (argc - first < 2) {
    fputs("usage: mv [-f] SOURCE... DESTINATION\n", stderr);
    return 2;
  }
  const char *destination = argv[argc - 1];
  struct stat metadata;
  const int destination_is_directory =
      stat(destination, &metadata) == 0 && S_ISDIR(metadata.st_mode);
  if (argc - first > 2 && !destination_is_directory) {
    fprintf(stderr, "mv: %s is not a directory\n", destination);
    return 1;
  }
  int status = 0;
  for (int index = first; index < argc - 1; index++) {
    if (move_one(argv[index], destination, destination_is_directory) != 0) {
      status = 1;
    }
  }
  return status;
}
