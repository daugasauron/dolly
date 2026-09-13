#include "session-snapshot.h"
#include "sha256.h"
#include "session-records.h"

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
#include <time.h>
#include <unistd.h>

enum {
  DOLLY_SESSION_NAME_CAPACITY = 128,
  DOLLY_SESSION_MAILBOX_HEADER_SIZE = 64,
  DOLLY_SESSION_TRANSFER_CAPACITY = 1024 * 1024,
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
  _Atomic uint32_t cancelled_sequence;
  unsigned char reserved[DOLLY_SESSION_MAILBOX_HEADER_SIZE -
                         11 * sizeof(uint32_t)];
} dolly_session_mailbox;

typedef struct {
  char *path;
  uint32_t kind;
  uintptr_t size;
  unsigned char digest[32];
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
static dolly_session_records base_records;
static int base_ready;

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
  if (dolly_session_excluded_path(path)) return 0;
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

static int fingerprint_record(dolly_session_record *record) {
  Sha256 sha;
  sha256_init(&sha);
  unsigned char bytes[65536];
  if (record->kind == DOLLY_SESSION_FILE) {
    int descriptor = open(record->path, O_RDONLY);
    if (descriptor < 0) return -1;
    uintptr_t remaining = record->size;
    while (remaining != 0) {
      const size_t length = remaining < sizeof(bytes) ? remaining : sizeof(bytes);
      if (read_exact(descriptor, bytes, length) != 0) {
        close(descriptor);
        return -1;
      }
      sha256_update(&sha, bytes, length);
      remaining -= length;
    }
    if (close(descriptor) != 0) return -1;
  } else if (record->kind == DOLLY_SESSION_SYMLINK) {
    ssize_t length = readlink(record->path, (char *)bytes, sizeof(bytes));
    if (length < 0 || (uintptr_t)length != record->size) return -1;
    sha256_update(&sha, bytes, (size_t)length);
  }
  sha256_finish(&sha, record->digest);
  return 0;
}

static int collect_fingerprints(dolly_session_records *records) {
  if (collect_tree("/", records) != 0) return -1;
  qsort(records->records, records->count, sizeof(*records->records), compare_records);
  for (size_t index = 0; index < records->count; ++index) {
    if (fingerprint_record(&records->records[index]) != 0) return -1;
  }
  return 0;
}

EMSCRIPTEN_KEEPALIVE
int dolly_session_base_capture(void) {
  if (base_ready) return 1;
  if (collect_fingerprints(&base_records) != 0) {
    dispose_records(&base_records);
    return 1;
  }
  base_ready = 1;
  return 0;
}

static int capture_filesystem(void) {
  dolly_session_records records = {0};
  if (!base_ready) { errno = EINVAL; return -1; }
  if (collect_fingerprints(&records) != 0) {
    dispose_records(&records);
    return -1;
  }
  // Keep only differences from the immutable boot baseline. Fingerprints and
  // paths stay in Wasm; the browser handles only the resulting opaque delta.
  size_t current = 0;
  for (size_t index = 0; index < base_records.count; ++index) {
    const dolly_session_record *base = &base_records.records[index];
    while (current < records.count &&
           strcmp(records.records[current].path, base->path) < 0) ++current;
    if (current < records.count &&
        strcmp(records.records[current].path, base->path) == 0) {
      dolly_session_record *record = &records.records[current++];
      if (record->kind == base->kind && record->size == base->size &&
          memcmp(record->digest, base->digest, sizeof(base->digest)) == 0) {
        record->kind = 0;
      }
    }
  }
  // A second merge detects deleted base paths before appending tombstones.
  current = 0;
  const size_t present_count = records.count;
  for (size_t index = 0; index < base_records.count; ++index) {
    const char *path = base_records.records[index].path;
    while (current < present_count && strcmp(records.records[current].path, path) < 0) ++current;
    if (current == present_count || strcmp(records.records[current].path, path) != 0) {
      if (append_record(&records, path, DOLLY_SESSION_DELETED, 0) != 0) {
        dispose_records(&records);
        return -1;
      }
    }
  }
  qsort(records.records, records.count, sizeof(*records.records),
        compare_records);
  uintptr_t total = DOLLY_SESSION_HEADER_SIZE;
  uint32_t count = 0;
  for (size_t index = 0; index < records.count; ++index) {
    if (records.records[index].kind == 0) continue;
    ++count;
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
  put_u32(&cursor, count);
  for (size_t index = 0; index < records.count; ++index) {
    const dolly_session_record *record = &records.records[index];
    if (record->kind == 0) continue;
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

static int restore_filesystem(uintptr_t size) {
  if (!base_ready || size > restore_capacity) return 1;
  dolly_fs_record *records;
  uint32_t count;
  if (dolly_session_decode(restore_bytes, size, &records, &count) != 0) return 1;
  const int result = dolly_fs_restore(records, count, 0);
  dolly_session_free_records(records, count);
  return result != 0;
}

EMSCRIPTEN_KEEPALIVE
int dolly_session_restore(uintptr_t size) {
  const int result = restore_filesystem(size);
  free(restore_bytes);
  restore_bytes = NULL;
  restore_capacity = 0;
  return result;
}

static double monotonic_milliseconds(void) {
  struct timespec time;
  if (clock_gettime(CLOCK_MONOTONIC, &time) != 0) return -1;
  return (double)time.tv_sec * 1000 + (double)time.tv_nsec / 1000000;
}

static int wait_for_chunk(uint32_t sequence, uint32_t request) {
  const double start = monotonic_milliseconds();
  if (start < 0) return -1;
  const double deadline = start + 30000;
  for (;;) {
    // Wait on precisely the value compared, not a second load which could
    // observe the acknowledgement and then wait forever for its replacement.
    const uint32_t consumed = atomic_load_explicit(
        &session_mailbox.chunk_consumed_sequence, memory_order_acquire);
    if (consumed == sequence) return 0;
    if (atomic_load_explicit(&session_mailbox.cancelled_sequence,
                             memory_order_acquire) == request) {
      errno = ECANCELED;
      return -1;
    }
    const double now = monotonic_milliseconds();
    if (now < 0) return -1;
    if (now >= deadline) {
      errno = ETIMEDOUT;
      return -1;
    }
    emscripten_atomic_wait_u32(
        (void *)&session_mailbox.chunk_consumed_sequence, consumed, 1000000000);
  }
}

static int publish_capture(uint32_t request) {
  uint32_t sequence = atomic_load_explicit(
      &session_mailbox.chunk_sequence, memory_order_relaxed);
  uintptr_t offset = 0;
  for (;;) {
    if (wait_for_chunk(sequence, request) != 0) return -1;
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
  return wait_for_chunk(sequence, request);
}

EMSCRIPTEN_KEEPALIVE
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
  if (publish_capture(request) != 0 && status == 0) status = -errno;
  free(capture_bytes);
  capture_bytes = NULL;
  capture_size = 0;
  // A cancelled transfer must not leave an unacknowledged chunk blocking the
  // next save. The next consumer starts from this published sequence.
  atomic_store_explicit(&session_mailbox.chunk_consumed_sequence,
      atomic_load_explicit(&session_mailbox.chunk_sequence, memory_order_relaxed),
      memory_order_release);
  atomic_store_explicit(&session_mailbox.status, (uint32_t)status,
                        memory_order_relaxed);
  atomic_store_explicit(&session_mailbox.completed_sequence, request,
                        memory_order_release);
  emscripten_atomic_notify((void *)&session_mailbox.completed_sequence,
                           EMSCRIPTEN_NOTIFY_ALL_WAITERS);
}
