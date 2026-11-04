#ifndef DOLLY_SESSION_RECORDS_H
#define DOLLY_SESSION_RECORDS_H

#include "fs-record.h"

// A save is a 16-byte header (magic, version:u32, count:u32) and its records in
// ascending path order: kind:u32, path_bytes:u32, data_bytes:u64,
// modified:i64 (nanoseconds since the epoch, 0 for a deletion), path, data.
enum {
  DOLLY_SESSION_VERSION = 3,
  DOLLY_SESSION_HEADER_SIZE = 16,
  DOLLY_SESSION_RECORD_SIZE = 24,
  DOLLY_SESSION_MAX_RECORDS = 100000,
  DOLLY_SESSION_DIRECTORY = DOLLY_FS_DIRECTORY,
  DOLLY_SESSION_FILE = DOLLY_FS_FILE,
  DOLLY_SESSION_SYMLINK = DOLLY_FS_SYMLINK,
  DOLLY_SESSION_DELETED = DOLLY_FS_DELETED,
};

static const uintptr_t DOLLY_SESSION_MAX_SIZE = (uintptr_t)512 * 1024 * 1024;
static const unsigned char DOLLY_SESSION_MAGIC[8] = {'D', 'O', 'L', 'L', 'Y', 'S', 'E', 'S'};

// A decoded save: its records and each one's modification time.
typedef struct {
  dolly_fs_record *records;
  int64_t *modified;
  uint32_t count;
} dolly_session_delta;

static inline int dolly_session_excluded_path(const char *path) {
  return strcmp(path, "/run") == 0 || strncmp(path, "/run/", 5) == 0 ||
         strcmp(path, "/dev") == 0 || strncmp(path, "/dev/", 5) == 0 ||
         strcmp(path, "/proc") == 0 || strncmp(path, "/proc/", 6) == 0;
}

static inline void dolly_session_free(dolly_session_delta *delta) {
  if (delta->records != NULL) {
    for (uint32_t index = 0; index < delta->count; ++index) free(delta->records[index].path);
  }
  free(delta->records);
  free(delta->modified);
  *delta = (dolly_session_delta){0};
}

static inline int dolly_session_decode(const unsigned char *bytes, uintptr_t size,
                                      dolly_session_delta *output) {
  *output = (dolly_session_delta){0};
  if (bytes == NULL || size < DOLLY_SESSION_HEADER_SIZE || size > DOLLY_SESSION_MAX_SIZE) return -1;
  const unsigned char *cursor = bytes;
  const unsigned char *end = bytes + size;
  const unsigned char *magic;
  uint32_t version, count;
  if (dolly_fs_take_bytes(&cursor, end, sizeof(DOLLY_SESSION_MAGIC), &magic) != 0 ||
      memcmp(magic, DOLLY_SESSION_MAGIC, sizeof(DOLLY_SESSION_MAGIC)) != 0 ||
      dolly_fs_take_u32(&cursor, end, &version) != 0 ||
      dolly_fs_take_u32(&cursor, end, &count) != 0 ||
      version != DOLLY_SESSION_VERSION || count > DOLLY_SESSION_MAX_RECORDS) return -1;

  dolly_session_delta delta = {
    .records = calloc(count == 0 ? 1 : count, sizeof(*delta.records)),
    .modified = calloc(count == 0 ? 1 : count, sizeof(*delta.modified)),
    .count = count,
  };
  if (delta.records == NULL || delta.modified == NULL) goto done;
  for (uint32_t index = 0; index < count; ++index) {
    dolly_fs_record *record = &delta.records[index];
    uint32_t path_length;
    uint64_t data_length, modified;
    const unsigned char *path;
    if (dolly_fs_take_u32(&cursor, end, &record->kind) != 0 ||
        dolly_fs_take_u32(&cursor, end, &path_length) != 0 ||
        dolly_fs_take_u64(&cursor, end, &data_length) != 0 ||
        dolly_fs_take_u64(&cursor, end, &modified) != 0 ||
        record->kind < DOLLY_SESSION_DIRECTORY || record->kind > DOLLY_SESSION_DELETED ||
        ((record->kind == DOLLY_SESSION_DIRECTORY || record->kind == DOLLY_SESSION_DELETED) &&
         data_length != 0) ||
        (record->kind == DOLLY_SESSION_DELETED && modified != 0) ||
        data_length > DOLLY_SESSION_MAX_SIZE ||
        dolly_fs_take_bytes(&cursor, end, path_length, &path) != 0 ||
        path_length == 0 || path_length >= PATH_MAX || memchr(path, 0, path_length) != NULL ||
        dolly_fs_take_bytes(&cursor, end, (uintptr_t)data_length, &record->data) != 0) goto done;
    record->path = strndup((const char *)path, path_length);
    if (record->path == NULL || !dolly_fs_valid_path(record->path) ||
        dolly_session_excluded_path(record->path)) goto done;
    record->size = (uintptr_t)data_length;
    delta.modified[index] = (int64_t)modified;
    if (index != 0 && strcmp(delta.records[index - 1].path, record->path) >= 0) goto done;
    if (record->kind == DOLLY_SESSION_SYMLINK &&
        (data_length == 0 || data_length >= PATH_MAX ||
         memchr(record->data, 0, (size_t)data_length) != NULL)) goto done;
  }
  if (cursor != end) goto done;

  *output = delta;
  return 0;
done:
  dolly_session_free(&delta);
  return -1;
}

// Restores the records, then their modification times: a directory's is set
// once the paths in it exist. Access times stay as the restore left them.
static inline int dolly_session_restore_delta(const dolly_session_delta *delta,
                                              int allow_missing_parents) {
  if (dolly_fs_restore(delta->records, delta->count, allow_missing_parents) != 0) return -1;
  for (uint32_t index = 0; index < delta->count; ++index) {
    if (delta->records[index].kind == DOLLY_SESSION_DELETED) continue;
    const int64_t modified = delta->modified[index];
    const int64_t remainder = modified % 1000000000;
    const struct timespec times[2] = {
        {0, UTIME_OMIT},
        {(time_t)(modified / 1000000000 - (remainder < 0)),
         (long)(remainder < 0 ? remainder + 1000000000 : remainder)},
    };
    if (utimensat(AT_FDCWD, delta->records[index].path, times, AT_SYMLINK_NOFOLLOW) != 0) return -1;
  }
  return 0;
}

#endif
