#define _POSIX_C_SOURCE 200809L

#include <errno.h>
#include <fcntl.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

enum { BLOCK_SIZE = 512, PATH_BYTES = 4096, EXTENDED_HEADER_BYTES = 64 * 1024 };

static int read_exact(int descriptor, void *bytes_value, size_t length) {
  unsigned char *bytes = bytes_value;
  while (length != 0) {
    const ssize_t count = read(descriptor, bytes, length);
    if (count < 0 && errno == EINTR) continue;
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
    if (count < 0 && errno == EINTR) continue;
    if (count < 0) return -1;
    if (count == 0) { errno = EIO; return -1; }
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
    if (!exists && mkdir(copy, 0755) != 0) {
      free(copy);
      return -1;
    }
    *cursor = saved;
    if (saved == '\0') break;
  }
  free(copy);
  return 0;
}

// The path a pax extended header ("LENGTH KEY=VALUE\n" records) gives the
// next member, as a malloc'd string in *path, or NULL when it gives none: GNU
// tar and libarchive also record times and attributes there. -1 with errno
// set for a malformed header.
static int pax_path(const unsigned char *records, size_t size, char **path) {
  *path = NULL;
  for (size_t offset = 0; offset < size;) {
    char *end;
    const unsigned long length = strtoul((const char *)records + offset, &end, 10);
    const size_t start = (size_t)(end - (const char *)records);
    if (length == 0 || offset + length > size || start >= offset + length || *end != ' ' ||
        records[offset + length - 1] != '\n') {
      errno = EINVAL;
      return -1;
    }
    if (strncmp(end + 1, "path=", 5) == 0) {
      *path = strndup(end + 6, offset + length - 1 - (start + 6));
      return *path == NULL ? -1 : 0;
    }
    offset += length;
  }
  return 0;
}

// A member's modification time, as every tar restores it; access times are
// left alone, as GNU tar leaves them.
static int set_time(const char *path, uint64_t seconds) {
  const struct timespec times[2] = {{0, UTIME_OMIT}, {(time_t)seconds, 0}};
  return utimensat(AT_FDCWD, path, times, 0);
}

// Directories get their times after their members, whose creation changes them.
struct directory_time {
  char *path;
  uint64_t seconds;
};

// Prints why it failed, once.
static int extract(const char *archive_path, const char *directory) {
  int archive = strcmp(archive_path, "-") == 0 ? dup(STDIN_FILENO) : open(archive_path, O_RDONLY);
  if (archive < 0) {
    fprintf(stderr, "tar: %s: %s\n", archive_path, strerror(errno));
    return -1;
  }
  unsigned char header[BLOCK_SIZE] = {0};
  unsigned char data[BLOCK_SIZE];
  int status = 0;
  const char *stage = "read header";
  char active_member[PATH_BYTES + 1] = "";
  // The next member's path, from a pax or GNU long-name header before it.
  char *long_path = NULL;
  struct directory_time *directories = NULL;
  size_t directory_count = 0;
  for (;;) {
    stage = "read header";
    if (read_exact(archive, header, sizeof(header)) != 0) {
      status = -1;
      break;
    }
    if (all_zero(header, sizeof(header))) break;
    uint64_t declared_checksum;
    uint64_t size;
    uint64_t modified;
    stage = "parse header";
    if (parse_octal(header + 148, 8, &declared_checksum) != 0 ||
        parse_octal(header + 124, 12, &size) != 0 ||
        parse_octal(header + 136, 12, &modified) != 0) {
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
    const unsigned char type = header[156];
    // git archive writes a pax global header ('g', the commit id), and a pax
    // ('x') or GNU ('L') header names a member whose path does not fit; GNU
    // tar --format=pax writes an 'x' header of times before every member.
    if (type == 'g' || type == 'x' || type == 'L') {
      stage = "read extended header";
      unsigned char *records = size <= EXTENDED_HEADER_BYTES ? malloc((size_t)size + BLOCK_SIZE) : NULL;
      if (records == NULL) {
        errno = EFBIG;
        status = -1;
        break;
      }
      for (uint64_t offset = 0; status == 0 && offset < size; offset += BLOCK_SIZE)
        if (read_exact(archive, records + offset, BLOCK_SIZE) != 0) status = -1;
      records[size] = '\0';
      if (status == 0 && type != 'g') {
        free(long_path);
        long_path = NULL;
        if (type == 'L') {
          long_path = strndup((const char *)records, bounded_length(records, (size_t)size));
          if (long_path == NULL) status = -1;
        } else if (pax_path(records, (size_t)size, &long_path) != 0) {
          status = -1;
        }
      }
      free(records);
      if (status != 0) break;
      continue;
    }
    char member[PATH_BYTES + 1];
    const size_t name_length = bounded_length(header, 100);
    const size_t prefix_length = bounded_length(header + 345, 155);
    if (long_path != NULL) {
      if (strlen(long_path) > PATH_BYTES) {
        errno = ENAMETOOLONG;
        status = -1;
        break;
      }
      memcpy(member, long_path, strlen(long_path) + 1);
      free(long_path);
      long_path = NULL;
    } else if (prefix_length != 0) {
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
    const char *relative = member;
    while (strncmp(relative, "./", 2) == 0) relative += 2;
    const int root = *member != '\0' && (*relative == '\0' || strcmp(relative, ".") == 0);
    if (root && type == '5' && size == 0) continue;
    if (root || !valid_member(relative)) {
      errno = EINVAL;
      status = -1;
      break;
    }
    const size_t output_length = strlen(directory) + strlen(relative) + 2;
    char *output = malloc(output_length);
    if (output == NULL) {
      status = -1;
      break;
    }
    snprintf(output, output_length, "%s%s%s", directory,
             directory[strlen(directory) - 1] == '/' ? "" : "/", relative);
    int target = -1;
    if (type == '5') {
      stage = "create directory";
      struct directory_time *grown = realloc(directories, (directory_count + 1) * sizeof(*directories));
      if (grown != NULL) directories = grown;
      if (size != 0 || grown == NULL || mkdir_parents(output, 1) != 0) {
        status = -1;
      } else {
        directories[directory_count++] = (struct directory_time){output, modified};
        output = NULL;
      }
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
    if (target >= 0 && close(target) != 0 && status == 0) status = -1;
    if (target >= 0 && status == 0) {
      stage = "set time";
      status = set_time(output, modified);
    }
    free(output);
    if (status != 0) break;
  }
  for (size_t index = directory_count; index-- > 0;) {
    if (status == 0 && set_time(directories[index].path, directories[index].seconds) != 0) {
      stage = "set time";
      snprintf(active_member, sizeof(active_member), "%s", directories[index].path);
      status = -1;
    }
    free(directories[index].path);
  }
  free(directories);
  // A first block that is no header is no tar archive; gzip's starts 1f 8b.
  if (status != 0 && *active_member == '\0' && (strcmp(stage, "read header") == 0 ||
                                                strcmp(stage, "parse header") == 0)) {
    if (header[0] == 0x1f && header[1] == 0x8b) {
      fprintf(stderr, "tar: %s: gzip data, not a tar archive: gzip -dc %s | tar -xf - "
              "(amy install gzip, where gzip is missing)\n", archive_path, archive_path);
    } else {
      fprintf(stderr, "tar: %s: not a tar archive\n", archive_path);
    }
  } else if (status != 0) {
    fprintf(stderr, "tar: %s: %s%s%s: %s\n", archive_path, stage, *active_member ? " " : "", active_member, strerror(errno));
  }
  free(long_path);
  if (close(archive) != 0 && status == 0) {
    fprintf(stderr, "tar: %s: %s\n", archive_path, strerror(errno));
    status = -1;
  }
  return status;
}

static void usage(FILE *stream) {
  fputs("usage: tar -xf ARCHIVE [-C DIRECTORY]\n"
        "Use - as ARCHIVE to read stdin. This tar extracts only: git archive creates\n"
        "archives, and amy install tar gives a tar with its other options.\n", stream);
}

// -z, in any cluster of options (tar xzf as well), is refused with the way
// gzip data is read here; FILE is the archive f names, where there is one.
static int refuses_gzip(int argc, char **argv) {
  const char *archive = "FILE";
  int gzip = 0;
  for (int index = 1; index < argc; ++index) {
    const char *word = argv[index];
    const int cluster = word[0] == '-' ? word[1] != '-' && word[1] != '\0'
        : index == 1 && strspn(word, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ") == strlen(word);
    if (strcmp(word, "--gzip") == 0 || strcmp(word, "--gunzip") == 0 || (cluster && strchr(word, 'z'))) gzip = 1;
    if (cluster && strchr(word, 'f') && index + 1 < argc) archive = argv[++index];
  }
  if (gzip) {
    fprintf(stderr, "tar: -z is not supported here: gzip -dc %s | tar -xf - (amy install gzip, where gzip is missing; "
            "amy install tar gives a tar with -z)\n", archive);
  }
  return gzip;
}

int main(int argc, char **argv) {
  if (argc == 2 && strcmp(argv[1], "--help") == 0) {
    usage(stdout);
    return 0;
  }
  if (refuses_gzip(argc, argv)) return 1;
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
  return extract(argv[2], directory) != 0;
}
