#define _POSIX_C_SOURCE 200809L

#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>

static int ensure_directory(const char *path) {
  if (mkdir(path, 0777) == 0) return 0;
  if (errno != EEXIST) return -1;
  struct stat metadata;
  if (stat(path, &metadata) != 0) return -1;
  if (S_ISDIR(metadata.st_mode)) return 0;
  errno = ENOTDIR;
  return -1;
}

static int create_parents(const char *path) {
  if (path[0] == '\0') {
    errno = EINVAL;
    return -1;
  }
  char *buffer = strdup(path);
  if (buffer == NULL) return -1;
  int result = 0;
  for (char *cursor = buffer + 1; result == 0 && *cursor != '\0'; cursor++) {
    if (*cursor != '/') continue;
    *cursor = '\0';
    result = ensure_directory(buffer);
    *cursor = '/';
  }
  if (result == 0) result = ensure_directory(buffer);
  const int error = errno;
  free(buffer);
  errno = error;
  return result;
}

int main(int argc, char **argv) {
  int parents = 0;
  int first_path = 1;
  for (; first_path < argc; first_path++) {
    const char *argument = argv[first_path];
    if (strcmp(argument, "--") == 0) {
      first_path++;
      break;
    }
    if (strcmp(argument, "--help") == 0) {
      fputs("usage: mkdir [-p] [-m MODE] [--] DIRECTORY ...\n"
            "-m is accepted for unchanged install recipes: there are no modes to set\n", stdout);
      return 0;
    }
    if (strcmp(argument, "--parents") == 0) {
      parents = 1;
      continue;
    }
    if (argument[0] != '-' || argument[1] == '\0') break;
    for (const char *letter = argument + 1; *letter != '\0'; letter++) {
      if (*letter == 'p') {
        parents = 1;
      } else if (*letter == 'm') {
        // The mode takes the rest of the word or the next one: -m755, -pm 755.
        if (letter[1] == '\0' && ++first_path == argc) {
          fputs("mkdir: -m requires a mode\n", stderr);
          return 2;
        }
        break;
      } else {
        fprintf(stderr, "mkdir: unsupported option: -%c\n", *letter);
        return 2;
      }
    }
  }
  if (first_path == argc) {
    fputs("mkdir: missing directory operand\n", stderr);
    return 2;
  }

  int status = 0;
  for (int index = first_path; index < argc; index++) {
    const int result = parents ? create_parents(argv[index])
                               : mkdir(argv[index], 0777);
    if (result != 0) {
      fprintf(stderr, "mkdir: %s: %s\n", argv[index], strerror(errno));
      status = 1;
    }
  }
  return status;
}
