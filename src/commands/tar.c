#define _POSIX_C_SOURCE 200809L

#include <errno.h>
#include <fcntl.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

enum { BLOCK_SIZE = 512 };

static int read_exact(int descriptor, void *bytes_value, size_t length) {
  unsigned char *bytes = bytes_value;
  while (length != 0) {
    const ssize_t count = read(descriptor, bytes, length);
    if (count < 0) return -1;
    if (count == 0) {
      errno = EIO;
      return -1;
    }
    bytes += (size_t)count;
    length -= (size_t)count;
  }
  return 0;
}

static int write_exact(int descriptor, const void *bytes_value, size_t length) {
  const unsigned char *bytes = bytes_value;
  while (length != 0) {
    const ssize_t count = write(descriptor, bytes, length);
    if (count <= 0) return -1;
    bytes += (size_t)count;
    length -= (size_t)count;
  }
  return 0;
}

static int all_zero(const unsigned char *bytes, size_t length) {
  for (size_t index = 0; index < length; ++index) {
    if (bytes[index] != 0) return 0;
  }
  return 1;
}

static size_t bounded_length(const unsigned char *bytes, size_t capacity) {
  size_t length = 0;
  while (length < capacity && bytes[length] != '\0') ++length;
  return length;
}

static int parse_octal(const unsigned char *bytes, size_t length,
                       uint64_t *value_out) {
  uint64_t value = 0;
  size_t index = 0;
  while (index < length && (bytes[index] == ' ' || bytes[index] == '\0')) ++index;
  int digits = 0;
  for (; index < length && bytes[index] != '\0' && bytes[index] != ' '; ++index) {
    if (bytes[index] < '0' || bytes[index] > '7' || value > (UINT64_MAX >> 3)) {
      return -1;
    }
    value = (value << 3) | (uint64_t)(bytes[index] - '0');
    digits = 1;
  }
  if (!digits) return -1;
  *value_out = value;
  return 0;
}

static int valid_member(const char *path) {
  if (path[0] == '\0' || path[0] == '/' || strlen(path) > 4096 ||
      strstr(path, "//") != NULL || strchr(path, '\\') != NULL) return 0;
  const char *cursor = path;
  while (*cursor != '\0') {
    const char *end = strchr(cursor, '/');
    const size_t length = end == NULL ? strlen(cursor) : (size_t)(end - cursor);
    if ((length == 1 && cursor[0] == '.') ||
        (length == 2 && cursor[0] == '.' && cursor[1] == '.')) return 0;
    if (end == NULL) break;
    cursor = end + 1;
  }
  return 1;
}

static int mkdir_parents(const char *path, int include_last) {
  char *copy = strdup(path);
  if (copy == NULL) return -1;
  if (!include_last) {
    char *end = strrchr(copy, '/');
    if (end != NULL) *end = '\0';
  }
  for (char *cursor = copy + 1;; ++cursor) {
    if (*cursor != '/' && *cursor != '\0') continue;
    const char saved = *cursor;
    *cursor = '\0';
    struct stat metadata;
    int exists = stat(copy, &metadata) == 0;
    if (exists && !S_ISDIR(metadata.st_mode)) {
      errno = ENOTDIR;
      free(copy);
      return -1;
    }
    if (!exists) {
      /*
       * The version-0 dynamic-command libc surface does not consistently
       * preserve errno across its WasmFS wrapper.  Treat the filesystem as
       * authoritative: after mkdir, verify the path instead of interpreting
       * errno as the result.
       */
      (void)mkdir(copy, 0755);
      if (stat(copy, &metadata) != 0 || !S_ISDIR(metadata.st_mode)) {
        if (errno == 0) errno = EIO;
        free(copy);
        return -1;
      }
    }
    *cursor = saved;
    if (saved == '\0') break;
  }
  free(copy);
  return 0;
}

static int extract(const char *archive_path, const char *directory) {
  int archive = open(archive_path, O_RDONLY);
  if (archive < 0) return -1;
  unsigned char header[BLOCK_SIZE];
  unsigned char data[BLOCK_SIZE];
  int status = 0;
  const char *stage = "read header";
  char active_member[257] = "<header>";
  for (;;) {
    stage = "read header";
    if (read_exact(archive, header, sizeof(header)) != 0) {
      status = -1;
      break;
    }
    if (all_zero(header, sizeof(header))) break;
    uint64_t declared_checksum;
    uint64_t size;
    stage = "parse header";
    if (parse_octal(header + 148, 8, &declared_checksum) != 0 ||
        parse_octal(header + 124, 12, &size) != 0) {
      errno = EINVAL;
      status = -1;
      break;
    }
    uint64_t checksum = 0;
    for (size_t index = 0; index < sizeof(header); ++index) {
      checksum += index >= 148 && index < 156 ? ' ' : header[index];
    }
    if (checksum != declared_checksum) {
      errno = EBADMSG;
      status = -1;
      break;
    }
    char member[257];
    const size_t name_length = bounded_length(header, 100);
    const size_t prefix_length = bounded_length(header + 345, 155);
    if (prefix_length != 0) {
      if (prefix_length + name_length + 2 > sizeof(member)) {
        errno = ENAMETOOLONG;
        status = -1;
        break;
      }
      memcpy(member, header + 345, prefix_length);
      member[prefix_length] = '/';
      memcpy(member + prefix_length + 1, header, name_length);
      member[prefix_length + name_length + 1] = '\0';
    } else {
      memcpy(member, header, name_length);
      member[name_length] = '\0';
    }
    memcpy(active_member, member, strlen(member) + 1);
    stage = "validate path";
    if (!valid_member(member)) {
      errno = EINVAL;
      status = -1;
      break;
    }
    const size_t output_length = strlen(directory) + strlen(member) + 2;
    char *output = malloc(output_length);
    if (output == NULL) {
      status = -1;
      break;
    }
    snprintf(output, output_length, "%s%s%s", directory,
             directory[strlen(directory) - 1] == '/' ? "" : "/", member);
    const unsigned char type = header[156];
    int target = -1;
    if (type == '5') {
      stage = "create directory";
      if (size != 0 || mkdir_parents(output, 1) != 0) status = -1;
    } else if (type == '\0' || type == '0') {
      stage = "create parents";
      if (size > SIZE_MAX || mkdir_parents(output, 0) != 0) {
        status = -1;
      } else {
        stage = "open output";
        target = open(output, O_WRONLY | O_CREAT | O_TRUNC, 0666);
      }
      if (target < 0) {
        status = -1;
      }
    } else {
      errno = ENOTSUP;
      status = -1;
    }
    uint64_t remaining = size;
    while (status == 0 && remaining != 0) {
      stage = "read data";
      if (read_exact(archive, data, sizeof(data)) != 0) {
        status = -1;
        break;
      }
      const size_t count = remaining < sizeof(data) ? (size_t)remaining : sizeof(data);
      if (target >= 0 && write_exact(target, data, count) != 0) {
        stage = "write data";
        status = -1;
      }
      remaining -= count;
    }
    if (size == 0 || size % BLOCK_SIZE == 0) {
      // No partial padding block remains. Zero-size regular files still need
      // their output descriptor closed below.
    } else if (remaining == 0) {
      // The final read above consumed the whole padded block.
    }
    if (target >= 0 && close(target) != 0 && status == 0) status = -1;
    free(output);
    if (status != 0) break;
  }
  if (status != 0) {
    fprintf(stderr, "tar: %s at %s (errno %d)\n", stage, active_member, errno);
  }
  if (close(archive) != 0 && status == 0) status = -1;
  return status;
}

static void usage(FILE *stream) {
  fputs("usage: tar -xf ARCHIVE [-C DIRECTORY]\n", stream);
}

int main(int argc, char **argv) {
  if (argc == 2 && strcmp(argv[1], "--help") == 0) {
    usage(stdout);
    return 0;
  }
  if ((argc != 3 && argc != 5) || strcmp(argv[1], "-xf") != 0 ||
      (argc == 5 && strcmp(argv[3], "-C") != 0)) {
    usage(stderr);
    return 2;
  }
  const char *directory = argc == 5 ? argv[4] : ".";
  struct stat metadata;
  if (stat(directory, &metadata) != 0 || !S_ISDIR(metadata.st_mode)) {
    fprintf(stderr, "tar: %s: %s\n", directory, strerror(errno));
    return 1;
  }
  if (extract(argv[2], directory) != 0) {
    fprintf(stderr, "tar: %s: %s\n", argv[2], strerror(errno));
    return 1;
  }
  return 0;
}
