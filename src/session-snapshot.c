#include "session-snapshot.h"

#include <dirent.h>
#include <emscripten/atomic.h>
#include <emscripten/emscripten.h>
#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <stdatomic.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

enum {
  DOLLY_SESSION_VERSION = 1,
  DOLLY_SESSION_HEADER_SIZE = 16,
  DOLLY_SESSION_RECORD_SIZE = 16,
  DOLLY_SESSION_MAX_RECORDS = 100000,
  DOLLY_SESSION_NAME_CAPACITY = 128,
  DOLLY_SESSION_MAILBOX_HEADER_SIZE = 64,
  DOLLY_SESSION_TRANSFER_CAPACITY = 1024 * 1024,
  DOLLY_SESSION_DIRECTORY = 1,
  DOLLY_SESSION_FILE = 2,
  DOLLY_SESSION_SYMLINK = 3,
};

static const uintptr_t DOLLY_SESSION_MAX_SIZE =
    (uintptr_t)512 * 1024 * 1024;
static const unsigned char DOLLY_SESSION_MAGIC[8] = {
    'D', 'O', 'L', 'L', 'Y', 'S', 'E', 'S',
};

typedef struct {
  _Atomic uint32_t request_sequence;
  _Atomic uint32_t completed_sequence;
  _Atomic uint32_t status;
  _Atomic uint32_t name_length;
  _Atomic uint32_t chunk_sequence;
  _Atomic uint32_t chunk_consumed_sequence;
  _Atomic uint32_t chunk_length;
  _Atomic uint32_t chunk_eof;
  _Atomic uint32_t total_size_low;
  _Atomic uint32_t total_size_high;
  unsigned char reserved[DOLLY_SESSION_MAILBOX_HEADER_SIZE -
                         10 * sizeof(uint32_t)];
} dolly_session_mailbox;

typedef struct {
  char *path;
  uint32_t kind;
  uintptr_t size;
} dolly_session_record;

typedef struct {
  dolly_session_record *records;
  size_t count;
  size_t capacity;
} dolly_session_records;

_Alignas(64) static dolly_session_mailbox session_mailbox;
_Alignas(64) static unsigned char
    session_name[DOLLY_SESSION_NAME_CAPACITY];
_Alignas(64) static unsigned char
    session_transfer[DOLLY_SESSION_TRANSFER_CAPACITY];
static unsigned char *capture_bytes;
static uintptr_t capture_size;
static unsigned char *restore_bytes;
static uintptr_t restore_capacity;

static int checked_add(uintptr_t *total, uintptr_t amount) {
  if (amount > DOLLY_SESSION_MAX_SIZE ||
      *total > DOLLY_SESSION_MAX_SIZE - amount) {
    errno = EFBIG;
    return -1;
  }
  *total += amount;
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

static int valid_path_bytes(const unsigned char *path, uint32_t length) {
  if (length < 2 || length > 4096 || path[0] != '/' ||
      (length == 4 && memcmp(path, "/dev", 4) == 0) ||
      (length > 4 && memcmp(path, "/dev/", 5) == 0) ||
      (length == 5 && memcmp(path, "/seed", 5) == 0) ||
      (length > 5 && memcmp(path, "/seed/", 6) == 0)) {
    return 0;
  }
  for (uint32_t index = 0; index < length; ++index) {
    if (path[index] == '\0' || path[index] == '\\' || path[index] == '\r' ||
        (path[index] == '/' && index + 1 < length && path[index + 1] == '/')) {
      return 0;
    }
  }
  const unsigned char *component = path + 1;
  const unsigned char *end = path + length;
  while (component < end) {
    const unsigned char *slash = memchr(component, '/', (size_t)(end - component));
    const unsigned char *component_end = slash == NULL ? end : slash;
    const size_t component_length = (size_t)(component_end - component);
    if ((component_length == 1 && component[0] == '.') ||
        (component_length == 2 && component[0] == '.' && component[1] == '.')) {
      return 0;
    }
    component = component_end + (slash == NULL ? 0 : 1);
  }
  return 1;
}

static int excluded_path(const char *path) {
  return strcmp(path, "/dev") == 0 || strncmp(path, "/dev/", 5) == 0 ||
         strcmp(path, "/seed") == 0 || strncmp(path, "/seed/", 6) == 0;
}

static void dispose_records(dolly_session_records *records) {
  for (size_t index = 0; index < records->count; ++index) {
    free(records->records[index].path);
  }
  free(records->records);
  memset(records, 0, sizeof(*records));
}

static int append_record(dolly_session_records *records, const char *path,
                         uint32_t kind, uintptr_t size) {
  if (records->count == DOLLY_SESSION_MAX_RECORDS) {
    errno = E2BIG;
    return -1;
  }
  if (records->count == records->capacity) {
    size_t capacity = records->capacity == 0 ? 256 : records->capacity * 2;
    if (capacity > DOLLY_SESSION_MAX_RECORDS) {
      capacity = DOLLY_SESSION_MAX_RECORDS;
    }
    dolly_session_record *replacement =
        realloc(records->records, capacity * sizeof(*replacement));
    if (replacement == NULL) return -1;
    records->records = replacement;
    records->capacity = capacity;
  }
  char *copy = strdup(path);
  if (copy == NULL) return -1;
  records->records[records->count++] = (dolly_session_record){
      .path = copy,
      .kind = kind,
      .size = size,
  };
  return 0;
}

static int collect_tree(const char *path, dolly_session_records *records) {
  if (excluded_path(path)) return 0;
  struct stat metadata = {0};
  if (lstat(path, &metadata) != 0) return -1;
  if (S_ISREG(metadata.st_mode)) {
    if (metadata.st_size < 0 ||
        (uint64_t)metadata.st_size > DOLLY_SESSION_MAX_SIZE) {
      errno = EFBIG;
      return -1;
    }
    return append_record(records, path, DOLLY_SESSION_FILE,
                         (uintptr_t)metadata.st_size);
  }
  if (S_ISLNK(metadata.st_mode)) {
    char target[PATH_MAX];
    ssize_t length = readlink(path, target, sizeof(target));
    if (length < 0 || length == (ssize_t)sizeof(target)) {
      if (length >= 0) errno = ENAMETOOLONG;
      return -1;
    }
    return append_record(records, path, DOLLY_SESSION_SYMLINK,
                         (uintptr_t)length);
  }
  if (!S_ISDIR(metadata.st_mode)) {
    errno = ENOTSUP;
    return -1;
  }
  if (strcmp(path, "/") != 0 &&
      append_record(records, path, DOLLY_SESSION_DIRECTORY, 0) != 0) {
    return -1;
  }

  DIR *directory = opendir(path);
  if (directory == NULL) return -1;
  int result = 0;
  for (;;) {
    errno = 0;
    struct dirent *entry = readdir(directory);
    if (entry == NULL) {
      if (errno != 0) result = -1;
      break;
    }
    if (strcmp(entry->d_name, ".") == 0 || strcmp(entry->d_name, "..") == 0) {
      continue;
    }
    const size_t path_length = strlen(path);
    const size_t name_length = strlen(entry->d_name);
    const size_t separator = strcmp(path, "/") == 0 ? 0 : 1;
    if (path_length + separator + name_length + 1 > PATH_MAX) {
      errno = ENAMETOOLONG;
      result = -1;
      break;
    }
    char child[PATH_MAX];
    snprintf(child, sizeof(child), "%s%s%s", path, separator ? "/" : "",
             entry->d_name);
    if (collect_tree(child, records) != 0) {
      result = -1;
      break;
    }
  }
  const int saved_error = errno;
  if (closedir(directory) != 0 && result == 0) result = -1;
  if (result != 0) errno = saved_error == 0 ? EIO : saved_error;
  return result;
}

static int compare_records(const void *left_value, const void *right_value) {
  const dolly_session_record *left = left_value;
  const dolly_session_record *right = right_value;
  return strcmp(left->path, right->path);
}

static int capture_filesystem(void) {
  dolly_session_records records = {0};
  if (collect_tree("/", &records) != 0) {
    dispose_records(&records);
    return -1;
  }
  qsort(records.records, records.count, sizeof(*records.records),
        compare_records);
  uintptr_t total = DOLLY_SESSION_HEADER_SIZE;
  for (size_t index = 0; index < records.count; ++index) {
    const uintptr_t path_length = strlen(records.records[index].path);
    if (checked_add(&total, DOLLY_SESSION_RECORD_SIZE) != 0 ||
        checked_add(&total, path_length) != 0 ||
        checked_add(&total, records.records[index].size) != 0) {
      dispose_records(&records);
      return -1;
    }
  }
  unsigned char *replacement = realloc(capture_bytes, total);
  if (replacement == NULL) {
    dispose_records(&records);
    return -1;
  }
  capture_bytes = replacement;
  capture_size = 0;
  unsigned char *cursor = capture_bytes;
  memcpy(cursor, DOLLY_SESSION_MAGIC, sizeof(DOLLY_SESSION_MAGIC));
  cursor += sizeof(DOLLY_SESSION_MAGIC);
  put_u32(&cursor, DOLLY_SESSION_VERSION);
  put_u32(&cursor, (uint32_t)records.count);
  for (size_t index = 0; index < records.count; ++index) {
    const dolly_session_record *record = &records.records[index];
    const uint32_t path_length = (uint32_t)strlen(record->path);
    put_u32(&cursor, record->kind);
    put_u32(&cursor, path_length);
    put_u64(&cursor, record->size);
    memcpy(cursor, record->path, path_length);
    cursor += path_length;
    if (record->kind == DOLLY_SESSION_FILE) {
      int descriptor = open(record->path, O_RDONLY);
      if (descriptor < 0 || read_exact(descriptor, cursor, record->size) != 0 ||
          close(descriptor) != 0) {
        if (descriptor >= 0) close(descriptor);
        dispose_records(&records);
        return -1;
      }
      cursor += record->size;
    } else if (record->kind == DOLLY_SESSION_SYMLINK) {
      ssize_t length = readlink(record->path, (char *)cursor, record->size);
      if (length < 0 || (uintptr_t)length != record->size) {
        dispose_records(&records);
        return -1;
      }
      cursor += record->size;
    }
  }
  dispose_records(&records);
  if ((uintptr_t)(cursor - capture_bytes) != total) {
    errno = EIO;
    return -1;
  }
  capture_size = total;
  return 0;
}

static int remove_tree(const char *path) {
  struct stat metadata = {0};
  if (lstat(path, &metadata) != 0) return errno == ENOENT ? 0 : -1;
  if (!S_ISDIR(metadata.st_mode)) return unlink(path);
  DIR *directory = opendir(path);
  if (directory == NULL) return -1;
  int result = 0;
  for (;;) {
    errno = 0;
    struct dirent *entry = readdir(directory);
    if (entry == NULL) {
      if (errno != 0) result = -1;
      break;
    }
    if (strcmp(entry->d_name, ".") == 0 || strcmp(entry->d_name, "..") == 0) {
      continue;
    }
    char child[PATH_MAX];
    if (snprintf(child, sizeof(child), "%s/%s", path, entry->d_name) >=
        (int)sizeof(child) || remove_tree(child) != 0) {
      if (errno == 0) errno = ENAMETOOLONG;
      result = -1;
      break;
    }
  }
  const int saved_error = errno;
  if (closedir(directory) != 0 && result == 0) result = -1;
  if (result == 0) result = rmdir(path);
  if (result != 0) errno = saved_error == 0 ? EIO : saved_error;
  return result;
}

static int clear_mutable_filesystem(void) {
  DIR *root = opendir("/");
  if (root == NULL) return -1;
  int result = 0;
  for (;;) {
    errno = 0;
    struct dirent *entry = readdir(root);
    if (entry == NULL) {
      if (errno != 0) result = -1;
      break;
    }
    if (strcmp(entry->d_name, ".") == 0 || strcmp(entry->d_name, "..") == 0 ||
        strcmp(entry->d_name, "dev") == 0 || strcmp(entry->d_name, "seed") == 0) {
      continue;
    }
    char path[PATH_MAX];
    if (snprintf(path, sizeof(path), "/%s", entry->d_name) >=
        (int)sizeof(path) || remove_tree(path) != 0) {
      if (errno == 0) errno = ENAMETOOLONG;
      result = -1;
      break;
    }
  }
  const int saved_error = errno;
  if (closedir(root) != 0 && result == 0) result = -1;
  if (result != 0) errno = saved_error == 0 ? EIO : saved_error;
  return result;
}

static int make_parent_directories(const char *path) {
  char copy[PATH_MAX];
  const size_t length = strlen(path);
  if (length >= sizeof(copy)) {
    errno = ENAMETOOLONG;
    return -1;
  }
  memcpy(copy, path, length + 1);
  for (char *cursor = copy + 1; *cursor != '\0'; ++cursor) {
    if (*cursor != '/') continue;
    *cursor = '\0';
    struct stat metadata = {0};
    if (lstat(copy, &metadata) == 0) {
      if (!S_ISDIR(metadata.st_mode)) {
        errno = ENOTDIR;
        return -1;
      }
    } else if (errno != ENOENT || mkdir(copy, 0755) != 0) {
      return -1;
    }
    *cursor = '/';
  }
  return 0;
}

static int write_session_marker(const char *name) {
  (void)mkdir("/home", 0755);
  (void)mkdir("/home/dolly", 0755);
  int descriptor = open("/home/dolly/.dolly-session-name",
                        O_WRONLY | O_CREAT | O_TRUNC, 0666);
  if (descriptor < 0) return -1;
  char marker[256];
  const int length = snprintf(marker, sizeof(marker),
                              "DOLLY-SESSION 1\nname %s\n", name);
  const int result = length > 0 && length < (int)sizeof(marker) &&
                             write_exact(descriptor,
                                         (const unsigned char *)marker,
                                         (uintptr_t)length) == 0 &&
                             close(descriptor) == 0
                         ? 0
                         : -1;
  if (result != 0) close(descriptor);
  return result;
}

static int valid_session_name(const unsigned char *name, uint32_t length) {
  if (length == 0 || length > 64) return 0;
  for (uint32_t index = 0; index < length; ++index) {
    const unsigned char byte = name[index];
    if (!((byte >= 'a' && byte <= 'z') || (byte >= 'A' && byte <= 'Z') ||
          (byte >= '0' && byte <= '9') || byte == '-' || byte == '_' ||
          byte == '.')) {
      return 0;
    }
  }
  return strcmp((const char *)name, ".") != 0 &&
         strcmp((const char *)name, "..") != 0;
}

EMSCRIPTEN_KEEPALIVE
uintptr_t dolly_session_mailbox_address(void) {
  return (uintptr_t)&session_mailbox;
}

EMSCRIPTEN_KEEPALIVE
uint32_t dolly_session_mailbox_version(void) {
  return DOLLY_SESSION_VERSION;
}

EMSCRIPTEN_KEEPALIVE
uintptr_t dolly_session_name_address(void) {
  return (uintptr_t)session_name;
}

EMSCRIPTEN_KEEPALIVE
uint32_t dolly_session_name_capacity(void) {
  return DOLLY_SESSION_NAME_CAPACITY;
}

EMSCRIPTEN_KEEPALIVE
uintptr_t dolly_session_transfer_address(void) {
  return (uintptr_t)session_transfer;
}

EMSCRIPTEN_KEEPALIVE
uint32_t dolly_session_transfer_capacity(void) {
  return DOLLY_SESSION_TRANSFER_CAPACITY;
}

EMSCRIPTEN_KEEPALIVE
uintptr_t dolly_session_restore_address(uintptr_t size) {
  if (size < DOLLY_SESSION_HEADER_SIZE || size > DOLLY_SESSION_MAX_SIZE) {
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

EMSCRIPTEN_KEEPALIVE
int dolly_session_restore(uintptr_t size) {
  if (restore_bytes == NULL || size < DOLLY_SESSION_HEADER_SIZE ||
      size > restore_capacity) {
    errno = EINVAL;
    return 1;
  }
  const unsigned char *cursor = restore_bytes;
  const unsigned char *end = restore_bytes + size;
  const unsigned char *magic;
  uint32_t version;
  uint32_t count;
  if (take_bytes(&cursor, end, sizeof(DOLLY_SESSION_MAGIC), &magic) != 0 ||
      memcmp(magic, DOLLY_SESSION_MAGIC, sizeof(DOLLY_SESSION_MAGIC)) != 0 ||
      take_u32(&cursor, end, &version) != 0 ||
      take_u32(&cursor, end, &count) != 0 ||
      version != DOLLY_SESSION_VERSION || count > DOLLY_SESSION_MAX_RECORDS) {
    errno = EINVAL;
    return 1;
  }

  const unsigned char *validation = cursor;
  const unsigned char *previous_path = NULL;
  uint32_t previous_length = 0;
  for (uint32_t index = 0; index < count; ++index) {
    uint32_t kind;
    uint32_t path_length;
    uint64_t data_length;
    const unsigned char *path;
    const unsigned char *data;
    if (take_u32(&validation, end, &kind) != 0 ||
        take_u32(&validation, end, &path_length) != 0 ||
        take_u64(&validation, end, &data_length) != 0 ||
        (kind != DOLLY_SESSION_DIRECTORY && kind != DOLLY_SESSION_FILE &&
         kind != DOLLY_SESSION_SYMLINK) ||
        (kind == DOLLY_SESSION_DIRECTORY && data_length != 0) ||
        data_length > DOLLY_SESSION_MAX_SIZE ||
        take_bytes(&validation, end, path_length, &path) != 0 ||
        !valid_path_bytes(path, path_length) ||
        take_bytes(&validation, end, (uintptr_t)data_length, &data) != 0) {
      errno = EINVAL;
      return 1;
    }
    if (previous_path != NULL) {
      const uint32_t shared = previous_length < path_length
                                  ? previous_length
                                  : path_length;
      const int order = memcmp(previous_path, path, shared);
      if (order > 0 || (order == 0 && previous_length >= path_length)) {
        errno = EINVAL;
        return 1;
      }
    }
    previous_path = path;
    previous_length = path_length;
  }
  if (validation != end || clear_mutable_filesystem() != 0) return 1;

  for (uint32_t index = 0; index < count; ++index) {
    uint32_t kind;
    uint32_t path_length;
    uint64_t data_length;
    const unsigned char *path;
    const unsigned char *data;
    (void)take_u32(&cursor, end, &kind);
    (void)take_u32(&cursor, end, &path_length);
    (void)take_u64(&cursor, end, &data_length);
    (void)take_bytes(&cursor, end, path_length, &path);
    (void)take_bytes(&cursor, end, (uintptr_t)data_length, &data);
    char path_string[4097];
    memcpy(path_string, path, path_length);
    path_string[path_length] = '\0';
    if (make_parent_directories(path_string) != 0) return 1;
    if (kind == DOLLY_SESSION_DIRECTORY) {
      if (mkdir(path_string, 0755) != 0 && errno != EEXIST) return 1;
    } else if (kind == DOLLY_SESSION_FILE) {
      // Sessions share the system snapshot's mode-free filesystem model. Mode
      // bits are compatibility metadata only; executable validation still
      // happens at Dolly's typed loader boundary.
      int descriptor = open(path_string, O_WRONLY | O_CREAT | O_TRUNC, 0777);
      if (descriptor < 0) return 1;
      const int write_status =
          write_exact(descriptor, data, (uintptr_t)data_length);
      const int close_status = close(descriptor);
      if (write_status != 0 || close_status != 0) return 1;
    } else {
      char target[PATH_MAX];
      if (data_length >= sizeof(target)) {
        errno = ENAMETOOLONG;
        return 1;
      }
      memcpy(target, data, (size_t)data_length);
      target[data_length] = '\0';
      if (symlink(target, path_string) != 0) return 1;
    }
  }
  return 0;
}

static int publish_capture(void) {
  uint32_t sequence = atomic_load_explicit(
      &session_mailbox.chunk_sequence, memory_order_relaxed);
  uintptr_t offset = 0;
  for (;;) {
    while (atomic_load_explicit(&session_mailbox.chunk_consumed_sequence,
                                memory_order_acquire) != sequence) {
      const uint32_t consumed = atomic_load_explicit(
          &session_mailbox.chunk_consumed_sequence, memory_order_relaxed);
      emscripten_atomic_wait_u32(
          (void *)&session_mailbox.chunk_consumed_sequence, consumed,
          ATOMICS_WAIT_DURATION_INFINITE);
    }
    const uintptr_t remaining = capture_size - offset;
    const uint32_t length = remaining > DOLLY_SESSION_TRANSFER_CAPACITY
                                ? DOLLY_SESSION_TRANSFER_CAPACITY
                                : (uint32_t)remaining;
    if (length != 0) memcpy(session_transfer, capture_bytes + offset, length);
    offset += length;
    atomic_store_explicit(&session_mailbox.chunk_length, length,
                          memory_order_relaxed);
    atomic_store_explicit(&session_mailbox.chunk_eof,
                          offset == capture_size, memory_order_relaxed);
    sequence++;
    atomic_store_explicit(&session_mailbox.chunk_sequence, sequence,
                          memory_order_release);
    emscripten_atomic_notify((void *)&session_mailbox.chunk_sequence,
                             EMSCRIPTEN_NOTIFY_ALL_WAITERS);
    if (offset == capture_size) break;
  }
  while (atomic_load_explicit(&session_mailbox.chunk_consumed_sequence,
                              memory_order_acquire) != sequence) {
    const uint32_t consumed = atomic_load_explicit(
        &session_mailbox.chunk_consumed_sequence, memory_order_relaxed);
    emscripten_atomic_wait_u32(
        (void *)&session_mailbox.chunk_consumed_sequence, consumed,
        ATOMICS_WAIT_DURATION_INFINITE);
  }
  return 0;
}

void dolly_session_service(void) {
  const uint32_t request = atomic_load_explicit(
      &session_mailbox.request_sequence, memory_order_acquire);
  if (request == atomic_load_explicit(&session_mailbox.completed_sequence,
                                      memory_order_relaxed)) {
    return;
  }
  int status = 0;
  const uint32_t length = atomic_load_explicit(
      &session_mailbox.name_length, memory_order_relaxed);
  if (length >= DOLLY_SESSION_NAME_CAPACITY) {
    status = -EINVAL;
  } else {
    session_name[length] = '\0';
    if (!valid_session_name(session_name, length) ||
        write_session_marker((const char *)session_name) != 0 ||
        capture_filesystem() != 0) {
      status = -(errno == 0 ? EIO : errno);
    }
  }
  if (status != 0) capture_size = 0;
  const uint64_t size = status == 0 ? (uint64_t)capture_size : 0;
  atomic_store_explicit(&session_mailbox.total_size_low,
                        (uint32_t)size, memory_order_relaxed);
  atomic_store_explicit(&session_mailbox.total_size_high,
                        (uint32_t)(size >> 32), memory_order_relaxed);
  atomic_store_explicit(&session_mailbox.status, (uint32_t)status,
                        memory_order_relaxed);
  if (publish_capture() != 0 && status == 0) status = -EIO;
  atomic_store_explicit(&session_mailbox.status, (uint32_t)status,
                        memory_order_relaxed);
  atomic_store_explicit(&session_mailbox.completed_sequence, request,
                        memory_order_release);
  emscripten_atomic_notify((void *)&session_mailbox.completed_sequence,
                           EMSCRIPTEN_NOTIFY_ALL_WAITERS);
}
