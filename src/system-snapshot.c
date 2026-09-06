#include "system-snapshot.h"
#include "fs-record.h"

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
  DOLLY_SNAPSHOT_VERSION = 2,
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
  return dolly_fs_valid_path(path) && strpbrk(path, "\\\r\n") == NULL &&
         !forbidden_manifest_path(path);
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
  const int read_status = read_exact(descriptor, (unsigned char *)manifest->storage, size);
  const int close_status = close(descriptor);
  if (read_status != 0 || close_status != 0) {
    dispose_manifest(manifest);
    return -1;
  }
  if (memchr(manifest->storage, 0, size) != NULL) {
    dispose_manifest(manifest);
    errno = EINVAL;
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

static int compare_paths(const void *left, const void *right) {
  return strcmp(*(const char *const *)left, *(const char *const *)right);
}

// Only boot calls this, after every builder process has exited and before any
// entry or saved session starts. Runtime devices and immutable seed mounts are
// not image contents; everything else must be retained or contain a kept path.
static int prune_path(const dolly_snapshot_manifest *manifest, const char *path) {
  if (strcmp(path, "/dev") == 0 || strcmp(path, "/seed") == 0) return 1;
  struct stat metadata;
  if (lstat(path, &metadata) != 0) return -1;
  int keep = bsearch(&path, manifest->paths, manifest->count,
                    sizeof(*manifest->paths), compare_paths) != NULL ||
             strcmp(path, "/etc/dolly/image.manifest") == 0;
  if (!S_ISDIR(metadata.st_mode)) return keep ? 1 : (unlink(path) == 0 ? 0 : -1);
  if (strcmp(path, "/") == 0 || strcmp(path, "/tmp") == 0 ||
      strcmp(path, "/workspace") == 0 || strcmp(path, "/home/dolly") == 0) keep = 1;
  struct dirent **entries = NULL;
  const int count = scandir(path, &entries, NULL, NULL);
  if (count < 0) return -1;
  int error = 0;
  for (int index = 0; index < count; ++index) {
    struct dirent *entry = entries[index];
    if (error != 0 || strcmp(entry->d_name, ".") == 0 || strcmp(entry->d_name, "..") == 0) {
      free(entry); continue;
    }
    char child[PATH_MAX];
    if (snprintf(child, sizeof(child), "%s%s%s", path,
                 strcmp(path, "/") == 0 ? "" : "/", entry->d_name) >= (int)sizeof(child)) {
      error = ENAMETOOLONG;
    } else {
      const int status = prune_path(manifest, child);
      if (status < 0) error = errno;
      if (status == 1) keep = 1;
    }
    free(entry);
  }
  free(entries);
  if (error != 0) { errno = error; return -1; }
  return keep ? 1 : (rmdir(path) == 0 ? 0 : -1);
}

int dolly_snapshot_prune(void) {
  dolly_snapshot_manifest manifest;
  if (load_manifest(&manifest) != 0) return 1;
  const int status = prune_path(&manifest, "/");
  dispose_manifest(&manifest);
  if (status < 0) fprintf(stderr, "dolly: could not discard image build inputs: %s\n", strerror(errno));
  return status < 0 ? 1 : 0;
}

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

static int restore_staged(uintptr_t size) {
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
  dolly_fs_record *records = calloc(file_count, sizeof(*records));
  if (records == NULL) { dispose_manifest(&manifest); return -1; }
  for (uint32_t record = 0; record < file_count; ++record) {
    uint32_t path_length;
    uint64_t data_length_64;
    const unsigned char *path;
    const unsigned char *data;
    if (take_u32(&cursor, end, &records[record].kind) != 0 ||
        records[record].kind < DOLLY_FS_DIRECTORY || records[record].kind > DOLLY_FS_SYMLINK ||
        take_u32(&cursor, end, &path_length) != 0 || path_length == 0 ||
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

    records[record].path = manifest.paths[record];
    records[record].data = data;
    records[record].size = (uintptr_t)data_length_64;
  }
  if (cursor != end) {
    errno = EINVAL;
    goto done;
  }
  result = dolly_fs_restore(records, file_count, 1);

done:
  free(records);
  dispose_manifest(&manifest);
  return result;
}

int dolly_snapshot_restore_staged(uintptr_t size) {
  const int result = restore_staged(size);
  const int error = errno;
  free(restore_bytes);
  restore_bytes = NULL;
  restore_capacity = 0;
  errno = error;
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
  dolly_fs_record *metadata = calloc(file_count, sizeof(*metadata));
  if (metadata == NULL) {
    fprintf(stderr, "dolly: snapshot metadata allocation failed: %s\n", strerror(errno));
    dispose_manifest(&manifest);
    return 1;
  }
  for (size_t index = 0; index < file_count; ++index) {
    metadata[index].path = manifest.paths[index];
    if (dolly_fs_metadata(metadata[index].path, &metadata[index].kind, &metadata[index].size) != 0) {
      fprintf(stderr, "dolly: snapshot input is missing: %s\n", manifest.paths[index]);
      free(metadata);
      dispose_manifest(&manifest);
      return 1;
    }
    uintptr_t path_size = strlen(manifest.paths[index]);
    if (metadata[index].size > DOLLY_SNAPSHOT_MAX_SIZE ||
        checked_add(&total, 16) != 0 || checked_add(&total, path_size) != 0 ||
        checked_add(&total, metadata[index].size) != 0) {
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
    uintptr_t data_size = metadata[index].size;
    put_u32(&cursor, metadata[index].kind);
    put_u32(&cursor, path_size);
    put_u64(&cursor, data_size);
    memcpy(cursor, manifest.paths[index], path_size);
    cursor += path_size;
    if (dolly_fs_read_data(&metadata[index], cursor) != 0) {
      fprintf(stderr, "dolly: could not capture %s\n", manifest.paths[index]);
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
