// Paths and copies of Dolly's commands that walk or copy directories.
#ifndef DOLLY_COMMAND_PATH_H
#define DOLLY_COMMAND_PATH_H

#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

// DIRECTORY/NAME, one slash between them, in a new allocation; NULL with errno.
static inline char *join_path(const char *directory, const char *name) {
  const size_t directory_length = strlen(directory), name_length = strlen(name);
  const int slash = directory_length != 0 && directory[directory_length - 1] != '/';
  if (directory_length > SIZE_MAX - name_length - (size_t)slash - 1) {
    errno = ENAMETOOLONG;
    return NULL;
  }
  char *path = malloc(directory_length + (size_t)slash + name_length + 1);
  if (path == NULL) return NULL;
  memcpy(path, directory, directory_length);
  if (slash) path[directory_length] = '/';
  memcpy(path + directory_length + (size_t)slash, name, name_length + 1);
  return path;
}

// PATH's last component without its trailing slashes, in a new allocation.
static inline char *base_name_copy(const char *path) {
  size_t length = strlen(path);
  while (length > 1 && path[length - 1] == '/') length--;
  size_t start = length;
  while (start > 0 && path[start - 1] != '/') start--;
  return strndup(path + start, length - start);
}

// Copies INPUT's bytes to OUTPUT, as PROGRAM: 0, or 1 after saying which file failed and why.
static inline int copy_bytes(const char *program, int input, const char *source,
                             int output, const char *destination) {
  unsigned char buffer[16384];
  for (;;) {
    const ssize_t count = read(input, buffer, sizeof(buffer));
    if (count < 0 && errno == EINTR) continue;
    if (count < 0) {
      fprintf(stderr, "%s: %s: %s\n", program, source, strerror(errno));
      return 1;
    }
    if (count == 0) return 0;
    for (size_t offset = 0; offset < (size_t)count;) {
      const ssize_t written = write(output, buffer + offset, (size_t)count - offset);
      if (written < 0 && errno == EINTR) continue;
      if (written <= 0) {
        fprintf(stderr, "%s: %s: %s\n", program, destination,
                written == 0 ? "short write" : strerror(errno));
        return 1;
      }
      offset += (size_t)written;
    }
  }
}

#endif
