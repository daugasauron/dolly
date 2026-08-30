#include <errno.h>
#include <stdio.h>
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
  char buffer[1024];
  const size_t length = strlen(path);
  if (length == 0 || length >= sizeof(buffer)) {
    errno = length == 0 ? EINVAL : ENAMETOOLONG;
    return -1;
  }
  memcpy(buffer, path, length + 1);
  for (char *cursor = buffer + 1; *cursor != '\0'; cursor++) {
    if (*cursor != '/') continue;
    *cursor = '\0';
    if (ensure_directory(buffer) != 0) return -1;
    *cursor = '/';
  }
  return ensure_directory(buffer);
}

int main(int argc, char **argv) {
  int parents = 0;
  int first_path = 1;
  for (; first_path < argc; first_path++) {
    if (strcmp(argv[first_path], "--") == 0) {
      first_path++;
      break;
    }
    if (strcmp(argv[first_path], "--help") == 0) {
      fputs("usage: mkdir [-p] [--] DIRECTORY ...\n", stdout);
      return 0;
    }
    if (strcmp(argv[first_path], "-p") == 0 ||
        strcmp(argv[first_path], "--parents") == 0) {
      parents = 1;
    } else if (argv[first_path][0] == '-') {
      fprintf(stderr, "mkdir: unsupported option: %s\n", argv[first_path]);
      return 2;
    } else {
      break;
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
