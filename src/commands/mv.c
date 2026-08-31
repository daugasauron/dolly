#define _POSIX_C_SOURCE 200809L

#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>

static const char *base_name(const char *path) {
  const char *slash = strrchr(path, '/');
  return slash == NULL ? path : slash + 1;
}

static int move_one(const char *source, const char *destination,
                    int destination_is_directory) {
  char *target = NULL;
  if (destination_is_directory) {
    const char *name = base_name(source);
    const size_t destination_length = strlen(destination);
    const size_t name_length = strlen(name);
    const int slash = destination_length != 0 &&
                      destination[destination_length - 1] != '/';
    target = malloc(destination_length + (size_t)slash + name_length + 1);
    if (target == NULL) {
      fputs("mv: out of memory\n", stderr);
      return 1;
    }
    memcpy(target, destination, destination_length);
    if (slash) target[destination_length] = '/';
    memcpy(target + destination_length + (size_t)slash, name, name_length + 1);
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
