#include "system-snapshot.h"

#include <emscripten/emscripten.h>

#include <errno.h>
#include <fcntl.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

enum {
  DOLLY_SNAPSHOT_VERSION = 1,
  DOLLY_SNAPSHOT_HEADER_SIZE = 16,
};

static const uintptr_t DOLLY_SNAPSHOT_MAX_SIZE = (uintptr_t)512 * 1024 * 1024;
static const unsigned char DOLLY_SNAPSHOT_MAGIC[8] = {
    'D', 'O', 'L', 'L', 'Y', 'S', 'N', 'P',
};

// This is deliberately a system manifest, not a host-visible filesystem walk.
// Source inputs are already preloaded by Emscripten and mutable workspaces,
// temporary files, model credentials, and session state must never enter the
// reusable system image.
static const char *const system_files[] = {
    "/bin/slop",
    "/bin/help",
    "/bin/pwd",
    "/bin/cd",
    "/bin/cat",
    "/bin/echo",
    "/bin/mkdir",
    "/bin/touch",
    "/bin/rm",
    "/bin/clear",
    "/bin/ls",
    "/bin/cc",
    "/bin/c++",
    "/bin/ld",
    "/bin/ar",
    "/bin/awk",
    "/bin/grep",
    "/bin/sed",
    "/bin/head",
    "/bin/wc",
    "/usr/bin/make",
    "/usr/bin/curl",
    "/usr/bin/git",
    "/usr/bin/qjs",
    "/usr/bin/janis",
    "/usr/bin/pi",
    "/usr/bin/zig",
    "/usr/bin/ghostty-vt",
    "/usr/bin/demo",
    "/usr/bin/graphics-demo",
    "/usr/lib/libcurl.a",
    "/usr/lib/libz.a",
    "/usr/lib/libgit.a",
    "/usr/lib/libdolly-js.a",
    "/usr/lib/libghostty-vt.a",
    "/usr/libexec/dolly/awk-maketab",
    "/usr/libexec/dolly/zig-object-check",
    "/usr/libexec/dolly/zig-check",
    "/usr/libexec/dolly/display.wasm",
    "/usr/libexec/dolly/cpp-check",
    "/usr/libexec/dolly/git-remote-http",
    "/usr/libexec/dolly/git-remote-https",
    "/usr/src/awk/proctab.c",
    "/etc/gitconfig",
    "/home/dolly/.gitconfig",
    "/home/dolly/.pi/agent/extensions/dolly-tools.js",
    "/home/dolly/.pi/agent/SYSTEM.md",
    "/home/dolly/.pi/agent/settings.json",
    "/home/dolly/.pi/agent/themes/dolly.json",
};

static unsigned char *capture_bytes;
static uintptr_t capture_size;
static unsigned char *restore_bytes;
static uintptr_t restore_capacity;

static int checked_add(uintptr_t *total, uintptr_t amount) {
  if (amount > DOLLY_SNAPSHOT_MAX_SIZE ||
      *total > DOLLY_SNAPSHOT_MAX_SIZE - amount) {
    errno = EFBIG;
    return -1;
  }
  *total += amount;
  return 0;
}

static void put_u32(unsigned char **cursor, uint32_t value) {
  for (unsigned shift = 0; shift < 32; shift += 8) {
    *(*cursor)++ = (unsigned char)(value >> shift);
  }
}

static void put_u64(unsigned char **cursor, uint64_t value) {
  for (unsigned shift = 0; shift < 64; shift += 8) {
    *(*cursor)++ = (unsigned char)(value >> shift);
  }
}

static int take_bytes(const unsigned char **cursor, const unsigned char *end,
                      uintptr_t length, const unsigned char **result) {
  if (length > (uintptr_t)(end - *cursor)) return -1;
  *result = *cursor;
  *cursor += length;
  return 0;
}

static int take_u32(const unsigned char **cursor, const unsigned char *end,
                    uint32_t *result) {
  const unsigned char *bytes;
  if (take_bytes(cursor, end, 4, &bytes) != 0) return -1;
  *result = (uint32_t)bytes[0] | (uint32_t)bytes[1] << 8 |
            (uint32_t)bytes[2] << 16 | (uint32_t)bytes[3] << 24;
  return 0;
}

static int take_u64(const unsigned char **cursor, const unsigned char *end,
                    uint64_t *result) {
  const unsigned char *bytes;
  if (take_bytes(cursor, end, 8, &bytes) != 0) return -1;
  uint64_t value = 0;
  for (unsigned index = 0; index < 8; ++index) {
    value |= (uint64_t)bytes[index] << (index * 8);
  }
  *result = value;
  return 0;
}

static int read_exact(int descriptor, unsigned char *bytes, uintptr_t size) {
  while (size != 0) {
    ssize_t count = read(descriptor, bytes, size);
    if (count < 0 && errno == EINTR) continue;
    if (count <= 0) return -1;
    bytes += (uintptr_t)count;
    size -= (uintptr_t)count;
  }
  return 0;
}

static int write_exact(int descriptor, const unsigned char *bytes,
                       uintptr_t size) {
  while (size != 0) {
    ssize_t count = write(descriptor, bytes, size);
    if (count < 0 && errno == EINTR) continue;
    if (count <= 0) return -1;
    bytes += (uintptr_t)count;
    size -= (uintptr_t)count;
  }
  return 0;
}

static int make_parent_directories(const char *path) {
  size_t length = strlen(path);
  char *copy = malloc(length + 1);
  if (copy == NULL) return -1;
  memcpy(copy, path, length + 1);
  for (char *cursor = copy + 1; *cursor != '\0'; ++cursor) {
    if (*cursor != '/') continue;
    *cursor = '\0';
    if (mkdir(copy, 0755) != 0 && errno != EEXIST) {
      free(copy);
      return -1;
    }
    *cursor = '/';
  }
  free(copy);
  return 0;
}

static int manifest_index(const unsigned char *path, uint32_t length) {
  const size_t count = sizeof(system_files) / sizeof(system_files[0]);
  for (size_t index = 0; index < count; ++index) {
    size_t expected = strlen(system_files[index]);
    if (expected == length && memcmp(path, system_files[index], length) == 0) {
      return (int)index;
    }
  }
  return -1;
}

EMSCRIPTEN_KEEPALIVE
uint32_t dolly_snapshot_format_version(void) {
  return DOLLY_SNAPSHOT_VERSION;
}

EMSCRIPTEN_KEEPALIVE
uintptr_t dolly_snapshot_restore_address(uintptr_t size) {
  if (size < DOLLY_SNAPSHOT_HEADER_SIZE || size > DOLLY_SNAPSHOT_MAX_SIZE) {
    return 0;
  }
  if (size > restore_capacity) {
    unsigned char *replacement = realloc(restore_bytes, size);
    if (replacement == NULL) return 0;
    restore_bytes = replacement;
    restore_capacity = size;
  }
  return (uintptr_t)restore_bytes;
}

int dolly_snapshot_restore_staged(uintptr_t size) {
  const size_t manifest_count = sizeof(system_files) / sizeof(system_files[0]);
  if (restore_bytes == NULL || size < DOLLY_SNAPSHOT_HEADER_SIZE ||
      size > restore_capacity) {
    errno = EINVAL;
    return -1;
  }
  const unsigned char *cursor = restore_bytes;
  const unsigned char *end = restore_bytes + size;
  const unsigned char *magic;
  uint32_t version;
  uint32_t file_count;
  if (take_bytes(&cursor, end, sizeof(DOLLY_SNAPSHOT_MAGIC), &magic) != 0 ||
      memcmp(magic, DOLLY_SNAPSHOT_MAGIC, sizeof(DOLLY_SNAPSHOT_MAGIC)) != 0 ||
      take_u32(&cursor, end, &version) != 0 ||
      take_u32(&cursor, end, &file_count) != 0 ||
      version != DOLLY_SNAPSHOT_VERSION || file_count != manifest_count) {
    errno = EINVAL;
    return -1;
  }

  unsigned char *seen = calloc(manifest_count, 1);
  if (seen == NULL) return -1;
  int result = -1;
  for (uint32_t record = 0; record < file_count; ++record) {
    uint32_t path_length;
    uint64_t data_length_64;
    const unsigned char *path;
    const unsigned char *data;
    if (take_u32(&cursor, end, &path_length) != 0 || path_length == 0 ||
        path_length > 4096 ||
        take_u64(&cursor, end, &data_length_64) != 0 ||
        data_length_64 > DOLLY_SNAPSHOT_MAX_SIZE ||
        take_bytes(&cursor, end, path_length, &path) != 0 ||
        take_bytes(&cursor, end, (uintptr_t)data_length_64, &data) != 0) {
      errno = EINVAL;
      goto done;
    }
    int index = manifest_index(path, path_length);
    if (index < 0 || seen[index]) {
      errno = EINVAL;
      goto done;
    }
    seen[index] = 1;

    char *path_string = malloc((size_t)path_length + 1);
    if (path_string == NULL) goto done;
    memcpy(path_string, path, path_length);
    path_string[path_length] = '\0';
    if (make_parent_directories(path_string) != 0) {
      free(path_string);
      goto done;
    }
    int descriptor = open(path_string, O_WRONLY | O_CREAT | O_TRUNC, 0666);
    free(path_string);
    if (descriptor < 0) goto done;
    int write_status = write_exact(descriptor, data, (uintptr_t)data_length_64);
    int close_status = close(descriptor);
    if (write_status != 0 || close_status != 0) goto done;
  }
  if (cursor != end) {
    errno = EINVAL;
    goto done;
  }
  for (size_t index = 0; index < manifest_count; ++index) {
    if (!seen[index]) {
      errno = EINVAL;
      goto done;
    }
  }
  result = 0;

done:
  free(seen);
  return result;
}

EMSCRIPTEN_KEEPALIVE
int dolly_snapshot_capture(void) {
  const size_t file_count = sizeof(system_files) / sizeof(system_files[0]);
  uintptr_t total = DOLLY_SNAPSHOT_HEADER_SIZE;
  struct stat *metadata = calloc(file_count, sizeof(*metadata));
  if (metadata == NULL) return 1;
  for (size_t index = 0; index < file_count; ++index) {
    if (stat(system_files[index], &metadata[index]) != 0 ||
        !S_ISREG(metadata[index].st_mode) || metadata[index].st_size < 0) {
      fprintf(stderr, "dolly: snapshot input is missing: %s\n", system_files[index]);
      free(metadata);
      return 1;
    }
    uintptr_t path_size = strlen(system_files[index]);
    if ((uint64_t)metadata[index].st_size > DOLLY_SNAPSHOT_MAX_SIZE ||
        checked_add(&total, 12) != 0 || checked_add(&total, path_size) != 0 ||
        checked_add(&total, (uintptr_t)metadata[index].st_size) != 0) {
      fprintf(stderr, "dolly: system snapshot exceeds its size limit\n");
      free(metadata);
      return 1;
    }
  }

  unsigned char *replacement = realloc(capture_bytes, total);
  if (replacement == NULL) {
    free(metadata);
    return 1;
  }
  capture_bytes = replacement;
  capture_size = 0;
  unsigned char *cursor = capture_bytes;
  memcpy(cursor, DOLLY_SNAPSHOT_MAGIC, sizeof(DOLLY_SNAPSHOT_MAGIC));
  cursor += sizeof(DOLLY_SNAPSHOT_MAGIC);
  put_u32(&cursor, DOLLY_SNAPSHOT_VERSION);
  put_u32(&cursor, (uint32_t)file_count);

  for (size_t index = 0; index < file_count; ++index) {
    uint32_t path_size = (uint32_t)strlen(system_files[index]);
    uintptr_t data_size = (uintptr_t)metadata[index].st_size;
    put_u32(&cursor, path_size);
    put_u64(&cursor, data_size);
    memcpy(cursor, system_files[index], path_size);
    cursor += path_size;
    int descriptor = open(system_files[index], O_RDONLY);
    if (descriptor < 0 || read_exact(descriptor, cursor, data_size) != 0) {
      if (descriptor >= 0) close(descriptor);
      fprintf(stderr, "dolly: could not capture %s\n", system_files[index]);
      free(metadata);
      return 1;
    }
    if (close(descriptor) != 0) {
      free(metadata);
      return 1;
    }
    cursor += data_size;
  }
  free(metadata);
  if ((uintptr_t)(cursor - capture_bytes) != total) return 1;
  capture_size = total;
  return 0;
}

EMSCRIPTEN_KEEPALIVE
uintptr_t dolly_snapshot_address(void) {
  return (uintptr_t)capture_bytes;
}

EMSCRIPTEN_KEEPALIVE
uintptr_t dolly_snapshot_size(void) {
  return capture_size;
}
