#ifndef DOLLY_SESSION_RECORDS_H
#define DOLLY_SESSION_RECORDS_H

#include "fs-record.h"

enum {
  DOLLY_SESSION_VERSION = 2,
  DOLLY_SESSION_HEADER_SIZE = 16,
  DOLLY_SESSION_RECORD_SIZE = 16,
  DOLLY_SESSION_MAX_RECORDS = 100000,
  DOLLY_SESSION_DIRECTORY = DOLLY_FS_DIRECTORY,
  DOLLY_SESSION_FILE = DOLLY_FS_FILE,
  DOLLY_SESSION_SYMLINK = DOLLY_FS_SYMLINK,
  DOLLY_SESSION_DELETED = DOLLY_FS_DELETED,
};

static const uintptr_t DOLLY_SESSION_MAX_SIZE = (uintptr_t)512 * 1024 * 1024;
static const unsigned char DOLLY_SESSION_MAGIC[8] = {'D', 'O', 'L', 'L', 'Y', 'S', 'E', 'S'};

static inline int dolly_session_take_bytes(const unsigned char **cursor, const unsigned char *end,
                                                uintptr_t length, const unsigned char **result) {
  if (length > (uintptr_t)(end - *cursor)) return -1;
  *result = *cursor;
  *cursor += length;
  return 0;
}

static inline int dolly_session_take_u32(const unsigned char **cursor, const unsigned char *end,
                                              uint32_t *result) {
  const unsigned char *bytes;
  if (dolly_session_take_bytes(cursor, end, 4, &bytes) != 0) return -1;
  *result = (uint32_t)bytes[0] | (uint32_t)bytes[1] << 8 |
            (uint32_t)bytes[2] << 16 | (uint32_t)bytes[3] << 24;
  return 0;
}

static inline int dolly_session_take_u64(const unsigned char **cursor, const unsigned char *end,
                                              uint64_t *result) {
  const unsigned char *bytes;
  if (dolly_session_take_bytes(cursor, end, 8, &bytes) != 0) return -1;
  uint64_t value = 0;
  for (unsigned index = 0; index < 8; ++index) {
    value |= (uint64_t)bytes[index] << (index * 8);
  }
  *result = value;
  return 0;
}

static inline int dolly_session_excluded_path(const char *path) {
  return strcmp(path, "/dev") == 0 || strncmp(path, "/dev/", 5) == 0 ||
         strcmp(path, "/seed") == 0 || strncmp(path, "/seed/", 6) == 0;
}

static inline void dolly_session_free_records(dolly_fs_record *records, size_t count) {
  for (size_t index = 0; index < count; ++index) free(records[index].path);
  free(records);
}

static inline int dolly_session_decode(const unsigned char *bytes, uintptr_t size,
                                      dolly_fs_record **output, uint32_t *output_count) {
  *output = NULL;
  *output_count = 0;
  if (bytes == NULL || size < DOLLY_SESSION_HEADER_SIZE || size > DOLLY_SESSION_MAX_SIZE) return -1;
  const unsigned char *cursor = bytes;
  const unsigned char *end = bytes + size;
  const unsigned char *magic;
  uint32_t version, count;
  if (dolly_session_take_bytes(&cursor, end, sizeof(DOLLY_SESSION_MAGIC), &magic) != 0 ||
      memcmp(magic, DOLLY_SESSION_MAGIC, sizeof(DOLLY_SESSION_MAGIC)) != 0 ||
      dolly_session_take_u32(&cursor, end, &version) != 0 ||
      dolly_session_take_u32(&cursor, end, &count) != 0 ||
      version != DOLLY_SESSION_VERSION || count > DOLLY_SESSION_MAX_RECORDS) return -1;

  dolly_fs_record *records = calloc(count == 0 ? 1 : count, sizeof(*records));
  if (records == NULL) return -1;
  for (uint32_t index = 0; index < count; ++index) {
    dolly_fs_record *record = &records[index];
    uint32_t path_length;
    uint64_t data_length;
    const unsigned char *path;
    if (dolly_session_take_u32(&cursor, end, &record->kind) != 0 ||
        dolly_session_take_u32(&cursor, end, &path_length) != 0 ||
        dolly_session_take_u64(&cursor, end, &data_length) != 0 ||
        record->kind < DOLLY_SESSION_DIRECTORY || record->kind > DOLLY_SESSION_DELETED ||
        ((record->kind == DOLLY_SESSION_DIRECTORY || record->kind == DOLLY_SESSION_DELETED) &&
         data_length != 0) ||
        data_length > DOLLY_SESSION_MAX_SIZE ||
        dolly_session_take_bytes(&cursor, end, path_length, &path) != 0 ||
        path_length == 0 || path_length >= PATH_MAX || memchr(path, 0, path_length) != NULL ||
        dolly_session_take_bytes(&cursor, end, (uintptr_t)data_length, &record->data) != 0) goto done;
    record->path = strndup((const char *)path, path_length);
    if (record->path == NULL || !dolly_fs_valid_path(record->path) ||
        dolly_session_excluded_path(record->path)) goto done;
    record->size = (uintptr_t)data_length;
    if (index != 0 && strcmp(records[index - 1].path, record->path) >= 0) goto done;
    if (record->kind == DOLLY_SESSION_SYMLINK &&
        (data_length == 0 || data_length >= PATH_MAX ||
         memchr(record->data, 0, (size_t)data_length) != NULL)) goto done;
  }
  if (cursor != end) goto done;

  *output = records;
  *output_count = count;
  return 0;
done:
  dolly_session_free_records(records, count);
  return -1;
}

#endif
