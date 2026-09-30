#include "system-snapshot.h"
#include "fs-record.h"
#include "sha256.h"

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

static const uintptr_t DOLLY_SNAPSHOT_MAX_SIZE = (uintptr_t)2 * 1024 * 1024 * 1024;
static const unsigned char DOLLY_SNAPSHOT_MAGIC[8] = {
    'D', 'O', 'L', 'L', 'Y', 'S', 'N', 'P',
};

typedef struct {
  char *storage;
  char **paths;
  size_t count;
} dolly_snapshot_manifest;

static void dispose_manifest(dolly_snapshot_manifest *manifest) {
  if (manifest == NULL) return;
  free(manifest->paths);
  free(manifest->storage);
  memset(manifest, 0, sizeof(*manifest));
}

static int valid_manifest_path(const char *path) {
  return dolly_fs_valid_path(path) && strpbrk(path, "\\\r\n") == NULL &&
         !dolly_fs_unretained_path(path);
}

// The selected Dollyfile compiler writes an exact, sorted list. Snapshot code
// consumes that list and never discovers files by walking the filesystem.
static int load_manifest(dolly_snapshot_manifest *manifest) {
  memset(manifest, 0, sizeof(*manifest));
  unsigned char *bytes;
  uintptr_t size;
  if (dolly_fs_read_file("/etc/dolly/image.manifest", DOLLY_SNAPSHOT_MAX_MANIFEST_SIZE,
                         &bytes, &size) != 0) return -1;
  manifest->storage = (char *)bytes;
  if (size == 0 || memchr(manifest->storage, 0, size) != NULL) {
    dispose_manifest(manifest);
    errno = EINVAL;
    return -1;
  }
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

static void discard_capture(void) {
  free(capture_bytes);
  capture_bytes = NULL;
  capture_size = 0;
}

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
  discard_capture();
  dolly_snapshot_manifest manifest;
  if (load_manifest(&manifest) != 0) return 1;
  const int status = prune_path(&manifest, "/");
  dispose_manifest(&manifest);
  if (status < 0) fprintf(stderr, "dolly: could not discard image build inputs: %s\n", strerror(errno));
  return status < 0 ? 1 : 0;
}

static int checked_add(uintptr_t *total, uintptr_t amount) {
  return dolly_fs_checked_add(total, amount, DOLLY_SNAPSHOT_MAX_SIZE);
}

uint32_t dolly_snapshot_format_version(void) {
  return DOLLY_SNAPSHOT_VERSION;
}

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

static int restore_staged(uintptr_t size, const char *only_path) {
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
  if (dolly_fs_take_bytes(&cursor, end, sizeof(DOLLY_SNAPSHOT_MAGIC), &magic) != 0 ||
      memcmp(magic, DOLLY_SNAPSHOT_MAGIC, sizeof(DOLLY_SNAPSHOT_MAGIC)) != 0 ||
      dolly_fs_take_u32(&cursor, end, &version) != 0 ||
      dolly_fs_take_u32(&cursor, end, &file_count) != 0 ||
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
    if (dolly_fs_take_u32(&cursor, end, &records[record].kind) != 0 ||
        records[record].kind < DOLLY_FS_DIRECTORY || records[record].kind > DOLLY_FS_SYMLINK ||
        dolly_fs_take_u32(&cursor, end, &path_length) != 0 || path_length == 0 ||
        path_length > 4096 ||
        dolly_fs_take_u64(&cursor, end, &data_length_64) != 0 ||
        data_length_64 > DOLLY_SNAPSHOT_MAX_SIZE ||
        dolly_fs_take_bytes(&cursor, end, path_length, &path) != 0 ||
        dolly_fs_take_bytes(&cursor, end, (uintptr_t)data_length_64, &data) != 0) {
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
  if (only_path == NULL) {
    result = dolly_fs_restore(records, file_count, 1);
  } else if (dolly_fs_validate_restore(records, file_count, 1) == 0) {
    errno = ENOENT;
    for (uint32_t index = 0; index < file_count; ++index) {
      if (strcmp(records[index].path, only_path) != 0) continue;
      if (records[index].kind != DOLLY_FS_FILE) errno = EINVAL;
      else result = dolly_fs_restore(&records[index], 1, 1);
      break;
    }
  }

done:
  free(records);
  dispose_manifest(&manifest);
  return result;
}

int dolly_snapshot_restore_staged(uintptr_t size, const char *only_path) {
  const int result = restore_staged(size, only_path);
  const int error = errno;
  free(restore_bytes);
  restore_bytes = NULL;
  restore_capacity = 0;
  errno = error;
  return result;
}

// Streaming restore is boot-only: no process observes partial files. The final
// canonical digest binds the complete image independently of pack boundaries.
static struct {
  dolly_snapshot_manifest manifest;
  unsigned char *seen;
  unsigned char expected[32], part_digest[32], scratch[4096];
  uintptr_t expected_size, total, data_left;
  size_t used, need, index, previous, restored;
  uint32_t phase, count, remaining, parts;
  dolly_fs_record record;
  Sha256 part_sha;
  int active, descriptor;
} stream;

static int stream_dispose(int result) {
  const int error = errno;
  if (stream.active && stream.descriptor >= 0) close(stream.descriptor);
  dispose_manifest(&stream.manifest);
  free(stream.seen);
  memset(&stream, 0, sizeof(stream));
  free(restore_bytes);
  restore_bytes = NULL;
  restore_capacity = 0;
  errno = error;
  return result;
}

int dolly_snapshot_stream_begin(uintptr_t size) {
  if (stream.active || restore_capacity < 32 || size < 16 || size > DOLLY_SNAPSHOT_MAX_SIZE) {
    errno = EINVAL;
    return stream_dispose(-1);
  }
  if (load_manifest(&stream.manifest) != 0) return stream_dispose(-1);
  stream.seen = calloc(stream.manifest.count, 1);
  if (stream.seen == NULL) return stream_dispose(-1);
  memcpy(stream.expected, restore_bytes, 32);
  stream.expected_size = size;
  stream.total = 16;
  stream.need = 16;
  stream.descriptor = -1;
  stream.active = 1;
  sha256_init(&stream.part_sha);
  return 0;
}

static int stream_record_done(void) {
  if (stream.descriptor >= 0) {
    const int descriptor = stream.descriptor;
    stream.descriptor = -1;
    if (close(descriptor) != 0) return -1;
  } else {
    stream.record.data = stream.scratch;
    if (dolly_fs_restore(&stream.record, 1, 1) != 0) return -1;
  }
  stream.seen[stream.index] = 1;
  ++stream.restored;
  stream.previous = stream.index;
  stream.phase = --stream.remaining ? 1 : 4;
  stream.used = 0;
  stream.need = 16;
  return 0;
}

static int stream_field(void) {
  const unsigned char *cursor = stream.scratch, *end = cursor + stream.need;
  if (stream.phase == 0) {
    uint32_t version;
    cursor += 8;
    if (memcmp(stream.scratch, DOLLY_SNAPSHOT_MAGIC, 8) != 0 ||
        dolly_fs_take_u32(&cursor, end, &version) != 0 || version != DOLLY_SNAPSHOT_VERSION ||
        dolly_fs_take_u32(&cursor, end, &stream.count) != 0 || stream.count == 0 ||
        stream.count > stream.manifest.count) return -1;
    stream.remaining = stream.count;
    stream.phase = 1;
  } else if (stream.phase == 1) {
    uint32_t path_size;
    uint64_t size;
    if (dolly_fs_take_u32(&cursor, end, &stream.record.kind) != 0 ||
        dolly_fs_take_u32(&cursor, end, &path_size) != 0 || dolly_fs_take_u64(&cursor, end, &size) != 0 ||
        stream.record.kind < DOLLY_FS_DIRECTORY || stream.record.kind > DOLLY_FS_SYMLINK ||
        path_size < 2 || path_size >= sizeof(stream.scratch) || size > DOLLY_SNAPSHOT_MAX_SIZE ||
        (stream.record.kind == DOLLY_FS_DIRECTORY && size != 0) ||
        (stream.record.kind == DOLLY_FS_SYMLINK && (size == 0 || size >= sizeof(stream.scratch))) ||
        checked_add(&stream.total, 16 + path_size) != 0 ||
        checked_add(&stream.total, size) != 0 || stream.total > stream.expected_size) return -1;
    stream.record.size = size;
    stream.data_left = size;
    stream.need = path_size;
    stream.phase = 2;
  } else {
    if (memchr(stream.scratch, 0, stream.need) != NULL) return -1;
    stream.scratch[stream.need] = 0;
    const char *path = (const char *)stream.scratch;
    char **found = bsearch(&path, stream.manifest.paths, stream.manifest.count,
                          sizeof(*stream.manifest.paths), compare_paths);
    if (found == NULL) return -1;
    stream.index = found - stream.manifest.paths;
    if (stream.seen[stream.index] || (stream.remaining != stream.count && stream.index <= stream.previous)) return -1;
    // A retained descendant requires its ancestor to be a directory, even
    // when the ancestor and descendant arrive in different packs.
    if (stream.record.kind != DOLLY_FS_DIRECTORY && stream.index + 1 < stream.manifest.count &&
        strncmp(found[1], path, stream.need) == 0 && found[1][stream.need] == '/') return -1;
    stream.record.path = *found;
    if (stream.record.kind == DOLLY_FS_FILE) {
      dolly_fs_record empty = stream.record;
      empty.size = 0;
      if (dolly_fs_restore(&empty, 1, 1) != 0) return -1;
      stream.descriptor = open(*found, O_WRONLY);
      if (stream.descriptor < 0 || ftruncate(stream.descriptor, stream.record.size) != 0) return -1;
    }
    stream.phase = 3;
    if (stream.data_left == 0) return stream_record_done();
  }
  stream.used = 0;
  return 0;
}

int dolly_snapshot_stream_write(uintptr_t size, uint32_t end_part) {
  if (!stream.active || size > restore_capacity || end_part > 1) {
    errno = EINVAL;
    return stream_dispose(-1);
  }
  sha256_update(&stream.part_sha, restore_bytes, size);
  const unsigned char *cursor = restore_bytes, *end = cursor + size;
  while (cursor != end) {
    if (stream.phase == 4) goto invalid;
    size_t amount = stream.phase == 3 ? stream.data_left : stream.need - stream.used;
    if (amount > (size_t)(end - cursor)) amount = end - cursor;
    if (stream.phase == 3 && stream.record.kind == DOLLY_FS_FILE) {
      size_t written = 0;
      while (written < amount) {
        const ssize_t count = write(stream.descriptor, cursor + written, amount - written);
        if (count < 0 && errno == EINTR) continue;
        if (count <= 0) return stream_dispose(-1);
        written += count;
      }
    } else {
      memcpy(stream.scratch + stream.used, cursor, amount);
      stream.used += amount;
    }
    cursor += amount;
    if (stream.phase == 3) {
      stream.data_left -= amount;
      if (stream.data_left == 0 && stream_record_done() != 0) return stream_dispose(-1);
    } else if (stream.used == stream.need && stream_field() != 0) goto invalid;
  }
  if (end_part) {
    if (stream.phase != 4 || restore_capacity < 32) goto invalid;
    sha256_finish(&stream.part_sha, stream.part_digest);
    memcpy(restore_bytes, stream.part_digest, 32);
    ++stream.parts;
    sha256_init(&stream.part_sha);
    stream.phase = 0;
    stream.used = 0;
    stream.need = 16;
  }
  return 0;
invalid:
  errno = EINVAL;
  return stream_dispose(-1);
}

int dolly_snapshot_stream_finish(void) {
  if (!stream.active || stream.phase != 0 || stream.used != 0 ||
      stream.restored != stream.manifest.count || stream.total != stream.expected_size) {
    errno = EINVAL;
    return stream_dispose(-1);
  }
  Sha256 sha;
  if (stream.parts == 1) {
    if (memcmp(stream.part_digest, stream.expected, 32) != 0) {
      errno = EBADMSG;
      return stream_dispose(-1);
    }
    return stream_dispose(0);
  }
  sha256_init(&sha);
  unsigned char buffer[64 * 1024], *cursor = buffer;
  memcpy(cursor, DOLLY_SNAPSHOT_MAGIC, 8); cursor += 8;
  dolly_fs_put_u32(&cursor, DOLLY_SNAPSHOT_VERSION);
  dolly_fs_put_u32(&cursor, stream.manifest.count);
  sha256_update(&sha, buffer, 16);
  for (size_t index = 0; index < stream.manifest.count; ++index) {
    dolly_fs_record record = {.path = stream.manifest.paths[index]};
    if (dolly_fs_metadata(record.path, &record.kind, &record.size) != 0) return stream_dispose(-1);
    cursor = buffer;
    dolly_fs_put_u32(&cursor, record.kind);
    dolly_fs_put_u32(&cursor, strlen(record.path));
    dolly_fs_put_u64(&cursor, record.size);
    sha256_update(&sha, buffer, 16);
    sha256_update(&sha, record.path, strlen(record.path));
    if (record.kind == DOLLY_FS_FILE) {
      stream.descriptor = open(record.path, O_RDONLY);
      if (stream.descriptor < 0) return stream_dispose(-1);
      while (record.size != 0) {
        const size_t amount = record.size < sizeof(buffer) ? record.size : sizeof(buffer);
        if (dolly_fs_read_exact(stream.descriptor, buffer, amount) != 0) return stream_dispose(-1);
        sha256_update(&sha, buffer, amount);
        record.size -= amount;
      }
      const int descriptor = stream.descriptor;
      stream.descriptor = -1;
      if (close(descriptor) != 0) return stream_dispose(-1);
    } else if (record.kind == DOLLY_FS_SYMLINK) {
      if (record.size >= sizeof(buffer) || dolly_fs_read_data(&record, buffer) != 0) return stream_dispose(-1);
      sha256_update(&sha, buffer, record.size);
    }
  }
  sha256_finish(&sha, buffer);
  if (memcmp(buffer, stream.expected, 32) != 0) {
    errno = EBADMSG;
    return stream_dispose(-1);
  }
  return stream_dispose(0);
}

static int capture_snapshot(void) {
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

  capture_bytes = malloc(total);
  if (capture_bytes == NULL) {
    fprintf(stderr, "dolly: snapshot buffer allocation failed: %s\n", strerror(errno));
    free(metadata);
    dispose_manifest(&manifest);
    return 1;
  }
  unsigned char *cursor = capture_bytes;
  memcpy(cursor, DOLLY_SNAPSHOT_MAGIC, sizeof(DOLLY_SNAPSHOT_MAGIC));
  cursor += sizeof(DOLLY_SNAPSHOT_MAGIC);
  dolly_fs_put_u32(&cursor, DOLLY_SNAPSHOT_VERSION);
  dolly_fs_put_u32(&cursor, (uint32_t)file_count);

  for (size_t index = 0; index < file_count; ++index) {
    uint32_t path_size = (uint32_t)strlen(manifest.paths[index]);
    uintptr_t data_size = metadata[index].size;
    dolly_fs_put_u32(&cursor, metadata[index].kind);
    dolly_fs_put_u32(&cursor, path_size);
    dolly_fs_put_u64(&cursor, data_size);
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

int dolly_snapshot_capture(void) {
  discard_capture();
  const int result = capture_snapshot();
  if (result != 0) discard_capture();
  return result;
}

uintptr_t dolly_snapshot_address(void) {
  return (uintptr_t)capture_bytes;
}

uintptr_t dolly_snapshot_size(void) {
  return capture_size;
}
