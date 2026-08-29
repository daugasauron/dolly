#include <dirent.h>
#include <errno.h>
#include <stdio.h>
#include <string.h>

static int remove_path(const char *path, int recursive, int force) {
  DIR *directory = opendir(path);
  if (directory == NULL) {
    if (remove(path) == 0 || (force && errno == ENOENT)) return 0;
    fprintf(stderr, "rm: %s: %s\n", path, strerror(errno));
    return 1;
  }
  if (!recursive) {
    closedir(directory);
    fprintf(stderr, "rm: %s: is a directory\n", path);
    return 1;
  }

  int status = 0;
  struct dirent *entry;
  while ((entry = readdir(directory)) != NULL) {
    if (strcmp(entry->d_name, ".") == 0 || strcmp(entry->d_name, "..") == 0) {
      continue;
    }
    char child[1024];
    const int length = snprintf(child, sizeof(child), "%s/%s", path, entry->d_name);
    if (length < 0 || (size_t)length >= sizeof(child)) {
      fprintf(stderr, "rm: %s/%s: path is too long\n", path, entry->d_name);
      status = 1;
      continue;
    }
    if (remove_path(child, recursive, force) != 0) status = 1;
  }
  if (closedir(directory) != 0) status = 1;
  if (status == 0 && remove(path) != 0) {
    fprintf(stderr, "rm: %s: %s\n", path, strerror(errno));
    status = 1;
  }
  return status;
}

int main(int argc, char **argv) {
  int recursive = 0;
  int force = 0;
  int first_path = 1;
  for (; first_path < argc; first_path++) {
    const char *argument = argv[first_path];
    if (strcmp(argument, "--") == 0) {
      first_path++;
      break;
    }
    if (strcmp(argument, "--help") == 0) {
      fputs("usage: rm [-f] [-r|-R] [--] PATH ...\n", stdout);
      return 0;
    }
    if (argument[0] != '-' || argument[1] == '\0') break;
    for (const char *option = argument + 1; *option != '\0'; option++) {
      if (*option == 'f') force = 1;
      else if (*option == 'r' || *option == 'R') recursive = 1;
      else {
        fprintf(stderr, "rm: unsupported option: -%c\n", *option);
        return 2;
      }
    }
  }
  if (first_path == argc) {
    if (force) return 0;
    fputs("rm: missing operand\n", stderr);
    return 2;
  }

  int status = 0;
  for (int index = first_path; index < argc; index++) {
    const char *last = argv[index];
    for (const char *cursor = argv[index]; *cursor != '\0'; cursor++) {
      if (*cursor == '/') last = cursor + 1;
    }
    if (strcmp(last, ".") == 0 || strcmp(last, "..") == 0) {
      fprintf(stderr, "rm: refusing to remove %s recursively\n", argv[index]);
      status = 1;
      continue;
    }
    if (remove_path(argv[index], recursive, force) != 0) status = 1;
  }
  return status;
}
