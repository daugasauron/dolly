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
  DOLLY_SNAPSHOT_MAX_FILES = 100000,
  DOLLY_SNAPSHOT_MAX_MANIFEST_SIZE = 8 * 1024 * 1024,
};

static const uintptr_t DOLLY_SNAPSHOT_MAX_SIZE = (uintptr_t)512 * 1024 * 1024;
static const unsigned char DOLLY_SNAPSHOT_MAGIC[8] = {
    'D', 'O', 'L', 'L', 'Y', 'S', 'N', 'P',
};

typedef struct {
  char *storage;
  char **paths;
  size_t count;
} dolly_snapshot_manifest;

static int read_exact(int descriptor, unsigned char *bytes, uintptr_t size);

static void dispose_manifest(dolly_snapshot_manifest *manifest) {
  if (manifest == NULL) return;
  free(manifest->paths);
  free(manifest->storage);
  memset(manifest, 0, sizeof(*manifest));
}

static int forbidden_manifest_path(const char *path) {
  static const char *const prefixes[] = {
      "/tmp", "/workspace", "/home/dolly/.pi/agent/auth.json",
      "/home/dolly/.pi/agent/sessions",
  };
  for (size_t index = 0; index < sizeof(prefixes) / sizeof(prefixes[0]); ++index) {
    const size_t length = strlen(prefixes[index]);
    if (strncmp(path, prefixes[index], length) == 0 &&
        (path[length] == '\0' || path[length] == '/')) return 1;
  }
  return 0;
}

static int valid_manifest_path(const char *path) {
  if (path[0] != '/' || path[1] == '\0' || strlen(path) > 4096 ||
      forbidden_manifest_path(path)) return 0;
  for (const char *cursor = path; *cursor != '\0'; ++cursor) {
    if (*cursor == '\\' || *cursor == '\r') return 0;
    if (cursor[0] == '/' && cursor[1] == '/') return 0;
    if (cursor[0] == '/' && cursor[1] == '.' &&
        (cursor[2] == '/' || cursor[2] == '\0' ||
         (cursor[2] == '.' && (cursor[3] == '/' || cursor[3] == '\0')))) {
      return 0;
    }
  }
  return 1;
}

// The selected Dollyfile compiler writes an exact, sorted list. Snapshot code
// consumes that list and never discovers files by walking the filesystem.
static int load_manifest(dolly_snapshot_manifest *manifest) {
  memset(manifest, 0, sizeof(*manifest));
  int descriptor = open("/etc/dolly/image.manifest", O_RDONLY);
  if (descriptor < 0) return -1;
  struct stat metadata = {0};
  if (fstat(descriptor, &metadata) != 0 || metadata.st_size <= 0 ||
      metadata.st_size > DOLLY_SNAPSHOT_MAX_MANIFEST_SIZE) {
    fprintf(stderr, "dolly: invalid manifest size: %lld (%s)\n",
            (long long)metadata.st_size, strerror(errno));
    close(descriptor);
    errno = EINVAL;
    return -1;
  }
  const size_t size = (size_t)metadata.st_size;
  manifest->storage = malloc(size + 1);
  if (manifest->storage == NULL) {
    close(descriptor);
    return -1;
  }
  if (read_exact(descriptor, (unsigned char *)manifest->storage, size) != 0 ||
      close(descriptor) != 0) {
    dispose_manifest(manifest);
    return -1;
  }
  manifest->storage[size] = '\0';
  if (manifest->storage[size - 1] != '\n') {
    fprintf(stderr, "dolly: image manifest lacks a final newline (last=%u)\n",
            (unsigned char)manifest->storage[size - 1]);
    dispose_manifest(manifest);
    errno = EINVAL;
    return -1;
  }
  for (size_t index = 0; index < size; ++index) {
    if (manifest->storage[index] == '\n') manifest->count++;
  }
  if (manifest->count == 0 || manifest->count > DOLLY_SNAPSHOT_MAX_FILES) {
    fprintf(stderr, "dolly: invalid image manifest count: %zu\n", manifest->count);
    dispose_manifest(manifest);
    errno = E2BIG;
    return -1;
  }
  manifest->paths = calloc(manifest->count, sizeof(*manifest->paths));
  if (manifest->paths == NULL) {
    dispose_manifest(manifest);
    return -1;
  }
  size_t path_index = 0;
  char *start = manifest->storage;
  for (size_t index = 0; index < size; ++index) {
    if (manifest->storage[index] != '\n') continue;
    manifest->storage[index] = '\0';
    if (!valid_manifest_path(start)) {
      fprintf(stderr, "dolly: invalid image manifest path: %s\n", start);
      dispose_manifest(manifest);
      errno = EINVAL;
      return -1;
    }
    if (path_index != 0 && strcmp(manifest->paths[path_index - 1], start) >= 0) {
      fprintf(stderr, "dolly: unsorted image manifest: %s then %s\n",
              manifest->paths[path_index - 1], start);
      dispose_manifest(manifest);
      errno = EINVAL;
      return -1;
    }
    manifest->paths[path_index++] = start;
    start = manifest->storage + index + 1;
  }
  return 0;
}

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
    struct stat metadata = {0};
    if (stat(copy, &metadata) == 0) {
      if (!S_ISDIR(metadata.st_mode)) {
        free(copy);
        errno = ENOTDIR;
        return -1;
      }
    } else {
      if (errno != ENOENT || mkdir(copy, 0755) != 0) {
        free(copy);
        return -1;
      }
    }
    *cursor = '/';
  }
  free(copy);
  return 0;
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
  dolly_snapshot_manifest manifest;
  if (load_manifest(&manifest) != 0) {
    fprintf(stderr, "dolly: could not load image manifest: %s\n", strerror(errno));
    return -1;
  }
  const size_t manifest_count = manifest.count;
  if (restore_bytes == NULL || size < DOLLY_SNAPSHOT_HEADER_SIZE ||
      size > restore_capacity) {
    dispose_manifest(&manifest);
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
    dispose_manifest(&manifest);
    errno = EINVAL;
    return -1;
  }

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
    const size_t expected_length = strlen(manifest.paths[record]);
    if (expected_length != path_length ||
        memcmp(manifest.paths[record], path, path_length) != 0) {
      errno = EINVAL;
      goto done;
    }

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
  result = 0;

done:
  dispose_manifest(&manifest);
  return result;
}

EMSCRIPTEN_KEEPALIVE
int dolly_snapshot_capture(void) {
  dolly_snapshot_manifest manifest;
  if (load_manifest(&manifest) != 0) {
    fprintf(stderr, "dolly: could not load image manifest: %s\n", strerror(errno));
    return 1;
  }
  const size_t file_count = manifest.count;
  uintptr_t total = DOLLY_SNAPSHOT_HEADER_SIZE;
  struct stat *metadata = calloc(file_count, sizeof(*metadata));
  if (metadata == NULL) {
    fprintf(stderr, "dolly: snapshot metadata allocation failed: %s\n", strerror(errno));
    dispose_manifest(&manifest);
    return 1;
  }
  for (size_t index = 0; index < file_count; ++index) {
    if (stat(manifest.paths[index], &metadata[index]) != 0 ||
        !S_ISREG(metadata[index].st_mode) || metadata[index].st_size < 0) {
      fprintf(stderr, "dolly: snapshot input is missing: %s\n", manifest.paths[index]);
      free(metadata);
      dispose_manifest(&manifest);
      return 1;
    }
    uintptr_t path_size = strlen(manifest.paths[index]);
    if ((uint64_t)metadata[index].st_size > DOLLY_SNAPSHOT_MAX_SIZE ||
        checked_add(&total, 12) != 0 || checked_add(&total, path_size) != 0 ||
        checked_add(&total, (uintptr_t)metadata[index].st_size) != 0) {
      fprintf(stderr, "dolly: system snapshot exceeds its size limit\n");
      free(metadata);
      dispose_manifest(&manifest);
      return 1;
    }
  }

  unsigned char *replacement = realloc(capture_bytes, total);
  if (replacement == NULL) {
    fprintf(stderr, "dolly: snapshot buffer allocation failed: %s\n", strerror(errno));
    free(metadata);
    dispose_manifest(&manifest);
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
    uint32_t path_size = (uint32_t)strlen(manifest.paths[index]);
    uintptr_t data_size = (uintptr_t)metadata[index].st_size;
    put_u32(&cursor, path_size);
    put_u64(&cursor, data_size);
    memcpy(cursor, manifest.paths[index], path_size);
    cursor += path_size;
    int descriptor = open(manifest.paths[index], O_RDONLY);
    if (descriptor < 0 || read_exact(descriptor, cursor, data_size) != 0) {
      if (descriptor >= 0) close(descriptor);
      fprintf(stderr, "dolly: could not capture %s\n", manifest.paths[index]);
      free(metadata);
      dispose_manifest(&manifest);
      return 1;
    }
    if (close(descriptor) != 0) {
      fprintf(stderr, "dolly: could not close snapshot input %s: %s\n",
              manifest.paths[index], strerror(errno));
      free(metadata);
      dispose_manifest(&manifest);
      return 1;
    }
    cursor += data_size;
  }
  free(metadata);
  dispose_manifest(&manifest);
  if ((uintptr_t)(cursor - capture_bytes) != total) {
    fprintf(stderr, "dolly: snapshot size accounting mismatch\n");
    return 1;
  }
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
