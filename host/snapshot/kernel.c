#include "process-kernel.h"
#include "session-records.h"

#include <dirent.h>
#include <emscripten/atomic.h>
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

#include "snapshot.h"
_Static_assert(sizeof(dolly_session_mailbox) == 64, "session mailbox layout");

typedef struct {
  char *path;
  uint32_t kind;
  uintptr_t size;
  int64_t modified;
} dolly_session_record;

typedef struct {
  dolly_session_record *records;
  size_t count;
  size_t capacity;
} dolly_session_records;

// A save is the whole filesystem but /dev, /proc and /run, streamed through the
// transfer range a chunk at a time; a restore streams it back into a filesystem
// emptied of everything else. Neither holds a save in memory.
_Alignas(64) static dolly_session_mailbox session_mailbox;
_Alignas(64) static unsigned char
    session_transfer[DOLLY_SESSION_TRANSFER_CAPACITY];

static int checked_add(uintptr_t *total, uintptr_t amount) {
  return dolly_fs_checked_add(total, amount, DOLLY_SESSION_MAX_SIZE);
}

static void dispose_records(dolly_session_records *records) {
  for (size_t index = 0; index < records->count; ++index) {
    free(records->records[index].path);
  }
  free(records->records);
  memset(records, 0, sizeof(*records));
}

static int append_record(dolly_session_records *records, const char *path,
                         uint32_t kind, uintptr_t size, int64_t modified) {
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
      .modified = modified,
  };
  return 0;
}

// Nanoseconds since the epoch, which a signed 64-bit count holds from 1677 to 2262.
static int modification_time(const struct stat *metadata, int64_t *modified) {
  if (__builtin_mul_overflow((int64_t)metadata->st_mtim.tv_sec, 1000000000, modified) ||
      __builtin_add_overflow(*modified, (int64_t)metadata->st_mtim.tv_nsec, modified)) {
    errno = EOVERFLOW;
    return -1;
  }
  return 0;
}

static int collect_tree(const char *path, dolly_session_records *records) {
  if (dolly_session_excluded_path(path)) return 0;
  struct stat metadata = {0};
  int64_t modified;
  if (lstat(path, &metadata) != 0 || modification_time(&metadata, &modified) != 0) return -1;
  if (S_ISREG(metadata.st_mode)) {
    if (metadata.st_size < 0 ||
        (uint64_t)metadata.st_size > UINTPTR_MAX) {
      errno = EFBIG;
      return -1;
    }
    return append_record(records, path, DOLLY_SESSION_FILE,
                         (uintptr_t)metadata.st_size, modified);
  }
  if (S_ISLNK(metadata.st_mode)) {
    char target[PATH_MAX];
    ssize_t length = readlink(path, target, sizeof(target));
    if (length < 0 || length == (ssize_t)sizeof(target)) {
      if (length >= 0) errno = ENAMETOOLONG;
      return -1;
    }
    return append_record(records, path, DOLLY_SESSION_SYMLINK,
                         (uintptr_t)length, modified);
  }
  if (!S_ISDIR(metadata.st_mode)) {
    errno = ENOTSUP;
    return -1;
  }
  if (strcmp(path, "/") != 0 &&
      append_record(records, path, DOLLY_SESSION_DIRECTORY, 0, modified) != 0) {
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

// A file that changed between the listing and its bytes would make a save that
// is neither the old nor the new file: the save fails, naming it.
static int unchanged(int descriptor, const dolly_session_record *record) {
  struct stat metadata;
  int64_t modified;
  if (fstat(descriptor, &metadata) != 0 || modification_time(&metadata, &modified) != 0) return -1;
  if ((uint64_t)metadata.st_size == record->size && modified == record->modified) return 0;
  fprintf(stderr, "dolly: %s changed while the session was saved; save again\n", record->path);
  errno = EAGAIN;
  return -1;
}

// The save in flight: its records, the next one, the bytes of a record's header
// and path not yet published, and the open file whose data follows them.
static struct {
  dolly_session_records records;
  size_t index;
  unsigned char pending[DOLLY_SESSION_HEADER_SIZE + DOLLY_SESSION_RECORD_SIZE + 2 * PATH_MAX];
  size_t pending_size, pending_used;
  const dolly_session_record *current;
  uintptr_t data_left, total, produced;
  int descriptor;
} save = {.descriptor = -1};

static void save_dispose(void) {
  dolly_kernel_hold_calls(0);
  if (save.descriptor >= 0) close(save.descriptor);
  dispose_records(&save.records);
  memset(&save, 0, sizeof(save));
  save.descriptor = -1;
}

// The save is the filesystem as it is now: processes' calls wait until it ends.
static int save_begin(void) {
  save_dispose();
  dolly_kernel_hold_calls(1);
  if (collect_tree("/", &save.records) != 0) return -1;
  qsort(save.records.records, save.records.count, sizeof(*save.records.records), compare_records);
  uintptr_t total = DOLLY_SESSION_HEADER_SIZE;
  for (size_t index = 0; index < save.records.count; ++index) {
    const dolly_session_record *record = &save.records.records[index];
    if (checked_add(&total, DOLLY_SESSION_RECORD_SIZE) != 0 ||
        checked_add(&total, strlen(record->path)) != 0 || checked_add(&total, record->size) != 0) return -1;
  }
  unsigned char *cursor = save.pending;
  memcpy(cursor, DOLLY_SESSION_MAGIC, sizeof(DOLLY_SESSION_MAGIC));
  cursor += sizeof(DOLLY_SESSION_MAGIC);
  dolly_fs_put_u32(&cursor, DOLLY_SESSION_VERSION);
  dolly_fs_put_u32(&cursor, (uint32_t)save.records.count);
  save.pending_size = DOLLY_SESSION_HEADER_SIZE;
  save.total = total;
  return 0;
}

// The next record's header and path into pending, a symlink's target after
// them; a file's data then comes from its descriptor.
static int save_next_record(void) {
  const dolly_session_record *record = save.current = &save.records.records[save.index++];
  const uint32_t path_length = (uint32_t)strlen(record->path);
  unsigned char *cursor = save.pending;
  dolly_fs_put_u32(&cursor, record->kind);
  dolly_fs_put_u32(&cursor, path_length);
  dolly_fs_put_u64(&cursor, record->size);
  dolly_fs_put_u64(&cursor, (uint64_t)record->modified);
  memcpy(cursor, record->path, path_length);
  cursor += path_length;
  if (record->kind == DOLLY_SESSION_SYMLINK) {
    const ssize_t length = readlink(record->path, (char *)cursor, PATH_MAX);
    if (length < 0 || (uintptr_t)length != record->size) {
      fprintf(stderr, "dolly: %s changed while the session was saved; save again\n", record->path);
      errno = EAGAIN;
      return -1;
    }
    cursor += length;
  } else if (record->kind == DOLLY_SESSION_FILE) {
    save.descriptor = open(record->path, O_RDONLY);
    if (save.descriptor < 0 || unchanged(save.descriptor, record) != 0) {
      if (save.descriptor < 0) fprintf(stderr, "dolly: %s changed while the session was saved; save again\n", record->path);
      return -1;
    }
    save.data_left = record->size;
  }
  save.pending_size = (size_t)(cursor - save.pending);
  save.pending_used = 0;
  return 0;
}

// Every record published and the last file checked and closed.
static int save_done(void) {
  return save.index == save.records.count && save.descriptor < 0 &&
         save.pending_used == save.pending_size && save.data_left == 0;
}

// Fills the transfer range with the save's next bytes.
static int save_fill(uint32_t *length) {
  uint32_t used = 0;
  while (used < DOLLY_SESSION_TRANSFER_CAPACITY) {
    const uint32_t room = DOLLY_SESSION_TRANSFER_CAPACITY - used;
    if (save.pending_used < save.pending_size) {
      size_t count = save.pending_size - save.pending_used;
      if (count > room) count = room;
      memcpy(session_transfer + used, save.pending + save.pending_used, count);
      save.pending_used += count;
      used += (uint32_t)count;
    } else if (save.data_left != 0) {
      const uint32_t count = save.data_left < room ? (uint32_t)save.data_left : room;
      if (dolly_fs_read_exact(save.descriptor, session_transfer + used, count) != 0) return -1;
      save.data_left -= count;
      used += count;
    } else if (save.descriptor >= 0) {
      const int descriptor = save.descriptor;
      save.descriptor = -1;
      const int result = unchanged(descriptor, save.current);
      if (close(descriptor) != 0 || result != 0) return -1;
    } else if (save.index < save.records.count) {
      if (save_next_record() != 0) return -1;
    } else {
      break;
    }
  }
  save.produced += used;
  *length = used;
  if (save_done() && save.produced != save.total) {
    errno = EIO;
    return -1;
  }
  return 0;
}

// The restore in flight: a record's fixed fields, its path and a symlink's
// target as they arrive, the file its data goes to, and every directory's time,
// set at the end once nothing more is made in it.
static struct {
  int active, header_done;
  unsigned char fixed[DOLLY_SESSION_RECORD_SIZE];
  size_t fixed_used;
  uint32_t count, seen, kind, path_length;
  uint64_t data_left;
  int64_t modified;
  char path[PATH_MAX], previous[PATH_MAX], target[PATH_MAX];
  size_t path_used, target_used;
  int descriptor;
  dolly_session_records directories;
} restore = {.descriptor = -1};

static void restore_dispose(void) {
  if (restore.descriptor >= 0) close(restore.descriptor);
  dispose_records(&restore.directories);
  memset(&restore, 0, sizeof(restore));
  restore.descriptor = -1;
}

static int set_time(const char *path, int64_t modified) {
  const int64_t remainder = modified % 1000000000;
  const struct timespec times[2] = {
      {0, UTIME_OMIT},
      {(time_t)(modified / 1000000000 - (remainder < 0)),
       (long)(remainder < 0 ? remainder + 1000000000 : remainder)},
  };
  return utimensat(AT_FDCWD, path, times, AT_SYMLINK_NOFOLLOW);
}

// Empties the boot's filesystem but /dev, /proc and /run, then takes the save.
int dolly_session_restore_begin(void) {
  restore_dispose();
  if (dolly_kernel_boot_environment() != 0) return 1;
  DIR *root = opendir("/");
  if (root == NULL) return 1;
  int result = 0;
  for (;;) {
    errno = 0;
    struct dirent *entry = readdir(root);
    if (entry == NULL) { result = errno == 0 ? 0 : -1; break; }
    if (strcmp(entry->d_name, ".") == 0 || strcmp(entry->d_name, "..") == 0) continue;
    char path[PATH_MAX];
    snprintf(path, sizeof(path), "/%s", entry->d_name);
    if (dolly_session_excluded_path(path)) continue;
    if (dolly_fs_remove_tree(path) != 0) { result = -1; break; }
  }
  if (closedir(root) != 0) result = -1;
  if (result != 0) return 1;
  restore.active = 1;
  return 0;
}

// A record whose header and path have arrived: a directory is made at once, a
// file is opened for its data, a symlink waits for its target.
static int restore_open_record(void) {
  restore.path[restore.path_length] = '\0';
  if (memchr(restore.path, 0, restore.path_length) != NULL || !dolly_fs_valid_path(restore.path) ||
      dolly_session_excluded_path(restore.path) ||
      (restore.seen != 0 && strcmp(restore.previous, restore.path) >= 0)) return -1;
  memcpy(restore.previous, restore.path, restore.path_length + 1);
  if (restore.kind == DOLLY_SESSION_DIRECTORY) {
    struct stat metadata;
    if (mkdir(restore.path, 0755) != 0 && (errno != EEXIST || lstat(restore.path, &metadata) != 0 ||
                                           !S_ISDIR(metadata.st_mode))) return -1;
    return append_record(&restore.directories, restore.path, DOLLY_SESSION_DIRECTORY, 0, restore.modified);
  }
  if (restore.kind == DOLLY_SESSION_FILE) {
    restore.descriptor = open(restore.path, O_WRONLY | O_CREAT | O_TRUNC, 0644);
    return restore.descriptor < 0 ? -1 : 0;
  }
  restore.target_used = 0;
  return 0;
}

static int restore_close_record(void) {
  if (restore.kind == DOLLY_SESSION_FILE) {
    const int descriptor = restore.descriptor;
    restore.descriptor = -1;
    if (close(descriptor) != 0) return -1;
  } else if (restore.kind == DOLLY_SESSION_SYMLINK) {
    restore.target[restore.target_used] = '\0';
    if (memchr(restore.target, 0, restore.target_used) != NULL ||
        symlink(restore.target, restore.path) != 0) return -1;
  }
  if (restore.kind != DOLLY_SESSION_DIRECTORY && set_time(restore.path, restore.modified) != 0) return -1;
  ++restore.seen;
  restore.fixed_used = 0;
  restore.path_used = 0;
  return 0;
}

static int restore_take(const unsigned char *bytes, size_t length) {
  while (length != 0) {
    if (!restore.header_done) {
      size_t count = DOLLY_SESSION_HEADER_SIZE - restore.fixed_used;
      if (count > length) count = length;
      memcpy(restore.fixed + restore.fixed_used, bytes, count);
      restore.fixed_used += count; bytes += count; length -= count;
      if (restore.fixed_used < DOLLY_SESSION_HEADER_SIZE) continue;
      const unsigned char *cursor = restore.fixed + sizeof(DOLLY_SESSION_MAGIC);
      const unsigned char *end = restore.fixed + DOLLY_SESSION_HEADER_SIZE;
      uint32_t version;
      if (memcmp(restore.fixed, DOLLY_SESSION_MAGIC, sizeof(DOLLY_SESSION_MAGIC)) != 0 ||
          dolly_fs_take_u32(&cursor, end, &version) != 0 || dolly_fs_take_u32(&cursor, end, &restore.count) != 0 ||
          version != DOLLY_SESSION_VERSION || restore.count > DOLLY_SESSION_MAX_RECORDS) return -1;
      restore.header_done = 1;
      restore.fixed_used = 0;
    } else if (restore.seen == restore.count) {
      return -1;
    } else if (restore.fixed_used < DOLLY_SESSION_RECORD_SIZE) {
      size_t count = DOLLY_SESSION_RECORD_SIZE - restore.fixed_used;
      if (count > length) count = length;
      memcpy(restore.fixed + restore.fixed_used, bytes, count);
      restore.fixed_used += count; bytes += count; length -= count;
      if (restore.fixed_used < DOLLY_SESSION_RECORD_SIZE) continue;
      const unsigned char *cursor = restore.fixed, *end = restore.fixed + DOLLY_SESSION_RECORD_SIZE;
      uint64_t modified;
      dolly_fs_take_u32(&cursor, end, &restore.kind);
      dolly_fs_take_u32(&cursor, end, &restore.path_length);
      dolly_fs_take_u64(&cursor, end, &restore.data_left);
      dolly_fs_take_u64(&cursor, end, &modified);
      restore.modified = (int64_t)modified;
      if (restore.kind < DOLLY_SESSION_DIRECTORY || restore.kind > DOLLY_SESSION_SYMLINK ||
          restore.path_length == 0 || restore.path_length >= PATH_MAX ||
          (restore.kind == DOLLY_SESSION_DIRECTORY && restore.data_left != 0) ||
          (restore.kind == DOLLY_SESSION_SYMLINK && (restore.data_left == 0 || restore.data_left >= PATH_MAX)) ||
          restore.data_left > DOLLY_SNAPSHOT_MAX_SIZE) return -1;
    } else if (restore.path_used < restore.path_length) {
      size_t count = restore.path_length - restore.path_used;
      if (count > length) count = length;
      memcpy(restore.path + restore.path_used, bytes, count);
      restore.path_used += count; bytes += count; length -= count;
      if (restore.path_used == restore.path_length) {
        if (restore_open_record() != 0) return -1;
        if (restore.data_left == 0 && restore_close_record() != 0) return -1;
      }
    } else {
      size_t count = restore.data_left < length ? (size_t)restore.data_left : length;
      if (restore.kind == DOLLY_SESSION_FILE) {
        if (dolly_fs_write_exact(restore.descriptor, bytes, count) != 0) return -1;
      } else {
        memcpy(restore.target + restore.target_used, bytes, count);
        restore.target_used += count;
      }
      restore.data_left -= count; bytes += count; length -= count;
      if (restore.data_left == 0 && restore_close_record() != 0) return -1;
    }
  }
  return 0;
}

// The next LENGTH bytes of the save, from the transfer range; LAST ends it, and
// then every record must have arrived. A failed restore leaves the boot to fail.
int dolly_session_restore_write(uintptr_t length, int last) {
  if (!restore.active || length > DOLLY_SESSION_TRANSFER_CAPACITY ||
      restore_take(session_transfer, length) != 0) {
    restore_dispose();
    return 1;
  }
  if (!last) return 0;
  int result = restore.header_done && restore.seen == restore.count && restore.fixed_used == 0 ? 0 : 1;
  for (size_t index = 0; result == 0 && index < restore.directories.count; ++index) {
    const dolly_session_record *directory = &restore.directories.records[index];
    if (set_time(directory->path, directory->modified) != 0) result = 1;
  }
  restore_dispose();
  return result;
}

uintptr_t dolly_session_mailbox_address(void) {
  return (uintptr_t)&session_mailbox;
}

uintptr_t dolly_session_transfer_address(void) {
  return (uintptr_t)session_transfer;
}

static double monotonic_milliseconds(void) {
  struct timespec time;
  clock_gettime(CLOCK_MONOTONIC, &time);
  return (double)time.tv_sec * 1000 + (double)time.tv_nsec / 1000000;
}

// One save in flight: the page acknowledges each chunk before the next is
// published, and the kernel thread never waits for it.
static struct {
  int active, status;
  uint32_t request, sequence;
  double deadline;
} transfer;

// A failed capture keeps its own status over the transfer's outcome.
static void finish_transfer(int outcome) {
  const int status = transfer.status != 0 ? transfer.status : outcome;
  save_dispose();
  transfer.active = 0;
  // A cancelled transfer must not leave an unacknowledged chunk blocking the
  // next save. The next consumer starts from this published sequence.
  atomic_store_explicit(&session_mailbox.chunk_consumed_sequence,
      atomic_load_explicit(&session_mailbox.chunk_sequence, memory_order_relaxed),
      memory_order_release);
  atomic_store_explicit(&session_mailbox.status, (uint32_t)status,
                        memory_order_relaxed);
  atomic_store_explicit(&session_mailbox.completed_sequence, transfer.request,
                        memory_order_release);
  emscripten_atomic_notify((void *)&session_mailbox.completed_sequence,
                           EMSCRIPTEN_NOTIFY_ALL_WAITERS);
}

static void publish_chunk(void) {
  uint32_t length = 0;
  if (transfer.status == 0 && save_fill(&length) != 0) {
    finish_transfer(-(errno == 0 ? EIO : errno));
    return;
  }
  atomic_store_explicit(&session_mailbox.chunk_length, length, memory_order_relaxed);
  atomic_store_explicit(&session_mailbox.chunk_eof, transfer.status != 0 || save_done(),
                        memory_order_relaxed);
  atomic_store_explicit(&session_mailbox.chunk_sequence, ++transfer.sequence,
                        memory_order_release);
  emscripten_atomic_notify((void *)&session_mailbox.chunk_sequence,
                           EMSCRIPTEN_NOTIFY_ALL_WAITERS);
  transfer.deadline = monotonic_milliseconds() + 30000;
}

// One step of a save, on the supervisor tick and whenever the page writes the
// mailbox: starts a requested capture, publishes the next chunk once the page
// consumed the previous one, and finishes after the last acknowledgement.
void dolly_session_service(void) {
  if (transfer.active) {
    if (atomic_load_explicit(&session_mailbox.cancelled_sequence,
                             memory_order_acquire) == transfer.request) {
      finish_transfer(-ECANCELED);
    } else if (atomic_load_explicit(&session_mailbox.chunk_consumed_sequence,
                                    memory_order_acquire) != transfer.sequence) {
      if (monotonic_milliseconds() >= transfer.deadline) finish_transfer(-ETIMEDOUT);
    } else if (transfer.status != 0 || save_done()) {
      finish_transfer(0);
    } else {
      publish_chunk();
    }
    return;
  }
  const uint32_t request = atomic_load_explicit(
      &session_mailbox.request_sequence, memory_order_acquire);
  if (request == atomic_load_explicit(&session_mailbox.completed_sequence,
                                      memory_order_relaxed)) {
    return;
  }
  int status = 0;
  if (save_begin() != 0) {
    status = -(errno == 0 ? EIO : errno);
    save_dispose();
  }
  const uint64_t size = status == 0 ? (uint64_t)save.total : 0;
  atomic_store_explicit(&session_mailbox.total_size_low,
                        (uint32_t)size, memory_order_relaxed);
  atomic_store_explicit(&session_mailbox.total_size_high,
                        (uint32_t)(size >> 32), memory_order_relaxed);
  atomic_store_explicit(&session_mailbox.status, (uint32_t)status,
                        memory_order_relaxed);
  transfer.active = 1;
  transfer.status = status;
  transfer.request = request;
  transfer.sequence = atomic_load_explicit(&session_mailbox.chunk_sequence, memory_order_relaxed);
  publish_chunk();
}

// The page drives sessions through the snapshot mailbox; no process operations.
const dolly_kernel_module dolly_snapshot_kernel = {0};
