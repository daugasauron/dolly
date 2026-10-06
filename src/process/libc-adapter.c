#define _GNU_SOURCE

#include <dolly/process.h>
#include <dolly/runtime.h>

#include <errno.h>
#include <dirent.h>
#include <fcntl.h>
#include <limits.h>
#include <netdb.h>
#include <netinet/in.h>
#include <pthread.h>
#include <sched.h>
#include <semaphore.h>
#include <signal.h>
#include <stdarg.h>
#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/resource.h>
#include <sys/stat.h>
#include <sys/statfs.h>
#include <sys/utsname.h>
#include <termios.h>
#include <time.h>
#include <unistd.h>
#include <wasi/api.h>

#define DOLLY_PROCESS_IO_CHUNK 16384u

_Static_assert(__WASI_WHENCE_SET == DOLLY_PROCESS_SEEK_SET &&
               __WASI_WHENCE_CUR == DOLLY_PROCESS_SEEK_CURRENT &&
               __WASI_WHENCE_END == DOLLY_PROCESS_SEEK_END, "seek whence encoding");
_Static_assert(__WASI_CLOCKID_REALTIME == DOLLY_PROCESS_CLOCK_REALTIME &&
               __WASI_CLOCKID_MONOTONIC == DOLLY_PROCESS_CLOCK_MONOTONIC,
               "clock encoding");

int isatty(int descriptor) { return dolly_isatty(descriptor); }

int uname(struct utsname *information) {
  if (information == NULL) { errno = EFAULT; return -1; }
  const struct utsname target = {
      .sysname = "Dolly", .nodename = "dolly", .release = "0",
      .version = "dolly-process-0", .machine = "wasm64",
  };
  *information = target;
  return 0;
}

static pid_t process_id(int parent) {
  static _Thread_local dolly_process_info_response identity;
  if (identity.pid == 0) {
    dolly_process_info_response response;
    const int64_t result = dolly_process_call(DOLLY_PROCESS_INFO,
        NULL, 0, &response, sizeof(response));
    if (result < 0) return (pid_t)result;
    if (result != sizeof(response) || response.pid == 0 ||
        response.pid > INT32_MAX || response.parent_pid > INT32_MAX) return -EIO;
    identity = response;
  }
  return (pid_t)(parent ? identity.parent_pid : identity.pid);
}

pid_t __syscall_getpid(void) { return process_id(0); }
pid_t __syscall_getppid(void) { return process_id(1); }

/* One thread per private process. libc-ww's fallback TID 42 would disagree
 * with pthread_self_stub's real PID and deadlock nested stdio locks. */
pid_t gettid(void) {
#ifdef __EMSCRIPTEN_PTHREADS__
  int __dolly_thread_tid(void);
  return __dolly_thread_tid();
#else
  return getpid();
#endif
}

pid_t __syscall_wait4(pid_t pid, int *status, int options, struct rusage *usage) {
  if (usage != NULL) return -ENOTSUP;
  const pid_t result = dolly_waitpid(pid, status, options);
  return result < 0 ? -errno : result;
}

/* Emscripten's kill is a self-only libc implementation, not a syscall veneer. */
int kill(pid_t pid, int signal_number) {
  if (pid == getpid() && signal_number != 0) return raise(signal_number);
  return dolly_kill(pid, signal_number);
}

static __wasi_errno_t call_errno(int64_t result) {
  if (result >= 0) return 0;
  const uint64_t error = (uint64_t)(-(result + 1)) + 1;
  return error <= UINT16_MAX ? (__wasi_errno_t)error : EIO;
}

static __wasi_errno_t read_sizes(uint32_t operation,
                                 __wasi_size_t *count,
                                 __wasi_size_t *bytes) {
  dolly_process_vector_sizes response = {0};
  const int64_t result = dolly_process_call(
      operation, NULL, 0, &response, sizeof(response));
  const __wasi_errno_t error = call_errno(result);
  if (error != 0) return error;
  if ((uint64_t)result != sizeof(response) || response.reserved != 0) return EIO;
  *count = response.count;
  *bytes = response.bytes;
  return 0;
}

static __wasi_errno_t read_string_vector(uint32_t operation,
                                         uint8_t **vector,
                                         uint8_t *buffer,
                                         size_t count,
                                         size_t bytes) {
  if (bytes > DOLLY_PROCESS_PACKET_LIMIT) return E2BIG;
  const int64_t result = dolly_process_call(operation, NULL, 0, buffer, bytes);
  const __wasi_errno_t error = call_errno(result);
  if (error != 0) return error;
  if ((uint64_t)result != bytes) return EIO;
  size_t offset = 0;
  for (size_t index = 0; index < count; ++index) {
    if (offset >= bytes) return EIO;
    vector[index] = buffer + offset;
    const size_t remaining = bytes - offset;
    const size_t length = strnlen((const char *)buffer + offset, remaining);
    if (length == remaining) return EIO;
    offset += length + 1;
  }
  return offset == bytes ? 0 : EIO;
}

__wasi_errno_t __wasi_args_sizes_get(__wasi_size_t *count,
                                     __wasi_size_t *bytes) {
  return read_sizes(DOLLY_PROCESS_ARGUMENT_SIZES, count, bytes);
}

__wasi_errno_t __wasi_args_get(uint8_t **vector, uint8_t *buffer) {
  __wasi_size_t count = 0;
  __wasi_size_t bytes = 0;
  __wasi_errno_t error = __wasi_args_sizes_get(&count, &bytes);
  return error == 0
      ? read_string_vector(DOLLY_PROCESS_ARGUMENTS, vector, buffer, count, bytes)
      : error;
}

__wasi_errno_t __wasi_environ_sizes_get(__wasi_size_t *count,
                                        __wasi_size_t *bytes) {
  return read_sizes(DOLLY_PROCESS_ENVIRONMENT_SIZES, count, bytes);
}

__wasi_errno_t __wasi_environ_get(uint8_t **vector, uint8_t *buffer) {
  __wasi_size_t count = 0;
  __wasi_size_t bytes = 0;
  __wasi_errno_t error = __wasi_environ_sizes_get(&count, &bytes);
  return error == 0
      ? read_string_vector(DOLLY_PROCESS_ENVIRONMENT, vector, buffer, count, bytes)
      : error;
}

_Noreturn void __wasi_proc_exit(__wasi_exitcode_t status) {
  const dolly_process_exit_request request = {status & 255u, 0};
  (void)dolly_process_call(
      DOLLY_PROCESS_EXIT, &request, sizeof(request), NULL, 0);
  __builtin_trap();
}

static __wasi_errno_t fd_read_one(uint32_t descriptor, void *buffer,
                                  size_t size, size_t *completed) {
  /* A process gate packet is deliberately bounded. POSIX read() permits a
   * short successful result, so expose at most one packet and let libc or the
   * caller request the remainder. This is also the correct behavior for
   * pipes: eagerly issuing a second call could block after returning all data
   * that was available for the original read. */
  if (size > DOLLY_PROCESS_PACKET_LIMIT) size = DOLLY_PROCESS_PACKET_LIMIT;
  const dolly_process_fd_io_request request = {descriptor, 0, size};
  const int64_t result = dolly_process_call(
      DOLLY_PROCESS_FD_READ, &request, sizeof(request), buffer, size);
  const __wasi_errno_t error = call_errno(result);
  if (error == 0) *completed = (size_t)result;
  return error;
}

__wasi_errno_t __wasi_fd_read(__wasi_fd_t descriptor,
                              const __wasi_iovec_t *vectors,
                              size_t vector_count,
                              __wasi_size_t *completed) {
  *completed = 0;
  if (vector_count == 0) return 0;
  if (vector_count == 1)
    return fd_read_one(descriptor, vectors[0].buf, vectors[0].buf_len, completed);
  size_t size = 0;
  for (size_t index = 0; index < vector_count && size < DOLLY_PROCESS_PACKET_LIMIT; ++index) {
    const size_t room = DOLLY_PROCESS_PACKET_LIMIT - size;
    size += vectors[index].buf_len < room ? vectors[index].buf_len : room;
  }
  unsigned char *bytes = malloc(size != 0 ? size : 1);
  if (bytes == NULL) return ENOMEM;
  const __wasi_errno_t error = fd_read_one(descriptor, bytes, size, completed);
  size_t offset = 0;
  for (size_t index = 0; index < vector_count && offset < *completed; ++index) {
    const size_t remaining = *completed - offset;
    const size_t count = vectors[index].buf_len < remaining ? vectors[index].buf_len : remaining;
    if (count != 0) memcpy(vectors[index].buf, bytes + offset, count);
    offset += count;
  }
  free(bytes);
  return error;
}

static __wasi_errno_t fd_pread_one(uint32_t descriptor, void *buffer,
                                   size_t size, uint64_t offset,
                                   size_t *completed) {
  const dolly_process_fd_pread_request request = {
      descriptor, 0, offset, size,
  };
  const int64_t result = dolly_process_call(
      DOLLY_PROCESS_FD_PREAD, &request, sizeof(request), buffer, size);
  const __wasi_errno_t error = call_errno(result);
  if (error == 0) *completed = (size_t)result;
  return error;
}

__wasi_errno_t __wasi_fd_pread(__wasi_fd_t descriptor,
                               const __wasi_iovec_t *vectors,
                               size_t vector_count,
                               __wasi_filesize_t offset,
                               __wasi_size_t *completed) {
  if (completed == NULL) return EFAULT;
  *completed = 0;
  for (size_t index = 0; index < vector_count; ++index) {
    unsigned char *cursor = vectors[index].buf;
    size_t remaining = vectors[index].buf_len;
    while (remaining != 0) {
      const size_t chunk = remaining > DOLLY_PROCESS_PACKET_LIMIT
          ? DOLLY_PROCESS_PACKET_LIMIT : remaining;
      size_t current = 0;
      const __wasi_errno_t error = fd_pread_one(
          descriptor, cursor, chunk, offset + *completed, &current);
      if (error != 0) return error;
      *completed += current;
      cursor += current;
      remaining -= current;
      if (current != chunk) return 0;
    }
  }
  return 0;
}

static __wasi_errno_t fd_pwrite_one(uint32_t descriptor, const void *buffer,
                                    size_t size, uint64_t offset,
                                    size_t *completed) {
  if (size > DOLLY_PROCESS_IO_CHUNK) size = DOLLY_PROCESS_IO_CHUNK;
  const size_t packet_size = sizeof(dolly_process_fd_pread_request) + size;
  unsigned char *packet = malloc(packet_size);
  if (packet == NULL) return ENOMEM;
  const dolly_process_fd_pread_request request = {
      descriptor, 0, offset, size,
  };
  memcpy(packet, &request, sizeof(request));
  memcpy(packet + sizeof(request), buffer, size);
  dolly_process_io_result response = {0};
  const int64_t result = dolly_process_call(
      DOLLY_PROCESS_FD_PWRITE, packet, packet_size,
      &response, sizeof(response));
  free(packet);
  const __wasi_errno_t error = call_errno(result);
  if (error != 0) return error;
  if ((uint64_t)result != sizeof(response) || response.size > size) return EIO;
  *completed = response.size;
  return 0;
}

__wasi_errno_t __wasi_fd_pwrite(__wasi_fd_t descriptor,
                                const __wasi_ciovec_t *vectors,
                                size_t vector_count,
                                __wasi_filesize_t offset,
                                __wasi_size_t *completed) {
  if (completed == NULL) return EFAULT;
  *completed = 0;
  for (size_t index = 0; index < vector_count; ++index) {
    const unsigned char *cursor = vectors[index].buf;
    size_t remaining = vectors[index].buf_len;
    while (remaining != 0) {
      size_t current = 0;
      const __wasi_errno_t error = fd_pwrite_one(
          descriptor, cursor, remaining, offset + *completed, &current);
      if (error != 0) return error;
      *completed += current;
      cursor += current;
      remaining -= current;
      if (current == 0) return 0;
    }
  }
  return 0;
}

__wasi_errno_t __wasi_fd_write(__wasi_fd_t descriptor,
                               const __wasi_ciovec_t *vectors,
                               size_t vector_count,
                               __wasi_size_t *completed) {
  *completed = 0;
  size_t vector_offset = 0;
  while (vector_count != 0) {
    size_t size = 0;
    for (size_t index = 0; index < vector_count && size < DOLLY_PROCESS_IO_CHUNK; ++index) {
      const size_t available = vectors[index].buf_len - (index == 0 ? vector_offset : 0);
      const size_t room = DOLLY_PROCESS_IO_CHUNK - size;
      size += available < room ? available : room;
    }
    const size_t packet_size = sizeof(dolly_process_fd_io_request) + size;
    unsigned char *packet = malloc(packet_size);
    if (packet == NULL) return *completed != 0 ? 0 : ENOMEM;
    const dolly_process_fd_io_request request = {descriptor, 0, size};
    memcpy(packet, &request, sizeof(request));
    size_t offset = 0;
    for (size_t index = 0; index < vector_count && offset < size; ++index) {
      const size_t start = index == 0 ? vector_offset : 0;
      const size_t available = vectors[index].buf_len - start;
      const size_t count = available < size - offset ? available : size - offset;
      if (count != 0) memcpy(packet + sizeof(request) + offset,
                             (const unsigned char *)vectors[index].buf + start, count);
      offset += count;
    }
    dolly_process_io_result response = {0};
    const int64_t result = dolly_process_call(
        DOLLY_PROCESS_FD_WRITE, packet, packet_size, &response, sizeof(response));
    free(packet);
    /* POSIX: a write to a pipe nobody reads raises SIGPIPE in the writer, which
     * ends it unless the signal is ignored, handled or blocked. */
    if (result == -EPIPE) raise(SIGPIPE);
    const __wasi_errno_t error = call_errno(result);
    if (error != 0) return *completed != 0 ? 0 : error;
    if ((uint64_t)result != sizeof(response) || response.size > size) return EIO;
    *completed += response.size;
    if (response.size == 0) return 0;
    size_t written = response.size;
    while (vector_count != 0 && written >= vectors[0].buf_len - vector_offset) {
      written -= vectors[0].buf_len - vector_offset;
      ++vectors;
      --vector_count;
      vector_offset = 0;
    }
    vector_offset += written;
  }
  return 0;
}

/* Dolly does not account CPU time. clock() and CLOCK_PROCESS_CPUTIME_ID report
 * the monotonic time since the process started: an upper bound of its CPU
 * time, exact while it computes without blocking. */
static __wasi_timestamp_t process_started;

__wasi_errno_t __wasi_clock_time_get(__wasi_clockid_t clock_id,
                                     __wasi_timestamp_t precision,
                                     __wasi_timestamp_t *time) {
  const int process_time = clock_id == __WASI_CLOCKID_PROCESS_CPUTIME_ID;
  const dolly_process_clock_request request = {
      process_time ? DOLLY_PROCESS_CLOCK_MONOTONIC : clock_id, 0, precision,
  };
  dolly_process_clock_response response = {0};
  const int64_t result = dolly_process_call(
      DOLLY_PROCESS_CLOCK_TIME, &request, sizeof(request),
      &response, sizeof(response));
  const __wasi_errno_t error = call_errno(result);
  if (error != 0) return error;
  if ((uint64_t)result != sizeof(response)) return EIO;
  *time = response.nanoseconds - (process_time ? process_started : 0);
  return 0;
}

__attribute__((constructor)) static void record_process_start(void) {
  (void)__wasi_clock_time_get(__WASI_CLOCKID_MONOTONIC, 1, &process_started);
}

__wasi_errno_t __wasi_clock_res_get(__wasi_clockid_t clock_id,
                                    __wasi_timestamp_t *resolution) {
  if (resolution == NULL) return EFAULT;
  const dolly_process_clock_request request = {clock_id, 0, 0};
  dolly_process_clock_response response = {0};
  const int64_t result = dolly_process_call(
      DOLLY_PROCESS_CLOCK_RESOLUTION, &request, sizeof(request),
      &response, sizeof(response));
  const __wasi_errno_t error = call_errno(result);
  if (error != 0) return error;
  if ((uint64_t)result != sizeof(response)) return EIO;
  *resolution = response.nanoseconds;
  return 0;
}

__wasi_errno_t __wasi_fd_close(__wasi_fd_t descriptor) {
  const dolly_process_fd_request request = {descriptor, 0};
  return call_errno(dolly_process_call(
      DOLLY_PROCESS_FD_CLOSE, &request, sizeof(request), NULL, 0));
}

__wasi_errno_t __wasi_fd_seek(__wasi_fd_t descriptor,
                              __wasi_filedelta_t offset,
                              __wasi_whence_t whence,
                              __wasi_filesize_t *new_offset) {
  dolly_process_fd_seek_request request = {descriptor, whence, offset};
  dolly_process_fd_seek_response response = {0};
  const int64_t result = dolly_process_call(
      DOLLY_PROCESS_FD_SEEK, &request, sizeof(request),
      &response, sizeof(response));
  const __wasi_errno_t error = call_errno(result);
  if (error != 0) return error;
  if ((uint64_t)result != sizeof(response)) return EIO;
  *new_offset = response.offset;
  return 0;
}

static int directory_descriptor(int descriptor) {
  return descriptor == AT_FDCWD ? -1 : descriptor;
}

static int checked_path_size(const char *path, size_t *size) {
  if (path == NULL) return -EFAULT;
  *size = strnlen(path, PATH_MAX + 1u);
  if (*size == 0) return -ENOENT;
  return *size > PATH_MAX ? -ENAMETOOLONG : 0;
}

/* Sends a fixed request header followed by the path bytes. */
static int64_t call_with_path(uint32_t operation, const void *header,
                              size_t header_size, const char *path,
                              size_t path_size, void *response,
                              size_t response_capacity) {
  unsigned char *packet = malloc(header_size + path_size);
  if (packet == NULL) return -ENOMEM;
  memcpy(packet, header, header_size);
  memcpy(packet + header_size, path, path_size);
  const int64_t result = dolly_process_call(
      operation, packet, header_size + path_size, response, response_capacity);
  free(packet);
  return result;
}

static int64_t path_call(uint32_t operation, int directory, uint32_t flags,
                         const char *path, void *response,
                         size_t response_capacity) {
  size_t path_size;
  const int checked = checked_path_size(path, &path_size);
  if (checked != 0) return checked;
  const dolly_process_path_request request = {
      (uint32_t)directory_descriptor(directory), flags, 0, (uint32_t)path_size,
  };
  return call_with_path(operation, &request, sizeof(request), path, path_size,
                        response, response_capacity);
}

static uint32_t translate_open_flags(int flags) {
  uint32_t result = 0;
  switch (flags & O_ACCMODE) {
    case O_RDONLY: result |= DOLLY_PROCESS_OPEN_READ; break;
    case O_WRONLY: result |= DOLLY_PROCESS_OPEN_WRITE; break;
    case O_RDWR: result |= DOLLY_PROCESS_OPEN_READ | DOLLY_PROCESS_OPEN_WRITE; break;
    default: return 0;
  }
  if ((flags & O_CREAT) != 0) result |= DOLLY_PROCESS_OPEN_CREATE;
  if ((flags & O_EXCL) != 0) result |= DOLLY_PROCESS_OPEN_EXCLUSIVE;
  if ((flags & O_TRUNC) != 0) result |= DOLLY_PROCESS_OPEN_TRUNCATE;
  if ((flags & O_APPEND) != 0) result |= DOLLY_PROCESS_OPEN_APPEND;
  if ((flags & O_CLOEXEC) != 0) result |= DOLLY_PROCESS_OPEN_CLOEXEC;
#ifdef O_DIRECTORY
  if ((flags & O_DIRECTORY) != 0) result |= DOLLY_PROCESS_OPEN_DIRECTORY;
#endif
#ifdef O_NOFOLLOW
  if ((flags & O_NOFOLLOW) != 0) result |= DOLLY_PROCESS_OPEN_NOFOLLOW;
#endif
  return result;
}

static int set_status_flags(int descriptor, int flags);

/* The mode is not part of Dolly's ABI: there is no permission model. */
int __syscall_openat(int directory, const char *path, int flags, ...) {
  const uint32_t translated = translate_open_flags(flags);
  if (translated == 0) return -EINVAL;
  dolly_process_path_open_response response = {0};
  const int64_t result = path_call(
      DOLLY_PROCESS_PATH_OPEN, directory, translated, path,
      &response, sizeof(response));
  if (result < 0) return (int)result;
  if ((uint64_t)result != sizeof(response) || response.reserved != 0) return -EIO;
  const int descriptor = (int)response.descriptor;
  if ((flags & O_NONBLOCK) != 0) {
    const int error = set_status_flags(descriptor, O_NONBLOCK);
    if (error != 0) {
      close(descriptor);
      return error;
    }
  }
  return descriptor;
}

static mode_t file_type_mode(uint32_t type) {
  switch (type) {
    case DOLLY_PROCESS_FILE_REGULAR: return S_IFREG;
    case DOLLY_PROCESS_FILE_DIRECTORY: return S_IFDIR;
    case DOLLY_PROCESS_FILE_SYMBOLIC_LINK: return S_IFLNK;
    case DOLLY_PROCESS_FILE_CHARACTER_DEVICE: return S_IFCHR;
    case DOLLY_PROCESS_FILE_BLOCK_DEVICE: return S_IFBLK;
    case DOLLY_PROCESS_FILE_FIFO: return S_IFIFO;
    case DOLLY_PROCESS_FILE_SOCKET: return S_IFSOCK;
    default: return 0;
  }
}

static int decode_stat(const dolly_process_stat_response *source,
                       struct stat *target) {
  if (source->reserved[0] != 0 || source->reserved[1] != 0 ||
      (source->mode & ~07777u) != 0) return -EIO;
  memset(target, 0, sizeof(*target));
  target->st_dev = source->device;
  target->st_ino = source->inode;
  target->st_size = source->size;
  target->st_mode = file_type_mode(source->file_type) | source->mode;
  target->st_nlink = source->link_count;
  target->st_uid = source->user;
  target->st_gid = source->group;
  target->st_blksize = source->block_size;
  target->st_blocks = source->blocks;
  target->st_atim.tv_sec = source->access_nanoseconds / 1000000000u;
  target->st_atim.tv_nsec = source->access_nanoseconds % 1000000000u;
  target->st_mtim.tv_sec = source->modification_nanoseconds / 1000000000u;
  target->st_mtim.tv_nsec = source->modification_nanoseconds % 1000000000u;
  target->st_ctim.tv_sec = source->change_nanoseconds / 1000000000u;
  target->st_ctim.tv_nsec = source->change_nanoseconds % 1000000000u;
  return 0;
}

int __syscall_fstat64(int descriptor, struct stat *metadata) {
  if (metadata == NULL) return -EFAULT;
  const dolly_process_fd_request request = {(uint32_t)descriptor, 0};
  dolly_process_stat_response response;
  const int64_t result = dolly_process_call(
      DOLLY_PROCESS_FD_STAT, &request, sizeof(request),
      &response, sizeof(response));
  if (result < 0) return (int)result;
  return (uint64_t)result == sizeof(response) ? decode_stat(&response, metadata) : -EIO;
}

__wasi_errno_t __wasi_fd_sync(__wasi_fd_t descriptor) {
  const dolly_process_fd_request request = {descriptor, 0};
  return call_errno(dolly_process_call(
      DOLLY_PROCESS_FD_SYNC, &request, sizeof(request), NULL, 0));
}

int __syscall_fdatasync(int descriptor) {
  const dolly_process_fd_request request = {(uint32_t)descriptor, 0};
  const int64_t result = dolly_process_call(
      DOLLY_PROCESS_FD_SYNC, &request, sizeof(request), NULL, 0);
  return result < 0 ? (int)result : 0;
}

int __syscall_fadvise64(int descriptor, int64_t offset, int64_t length,
                        int advice) {
  if (offset < 0 || length < 0 ||
      (advice != POSIX_FADV_NORMAL && advice != POSIX_FADV_RANDOM &&
       advice != POSIX_FADV_SEQUENTIAL && advice != POSIX_FADV_WILLNEED &&
       advice != POSIX_FADV_DONTNEED && advice != POSIX_FADV_NOREUSE)) {
    return -EINVAL;
  }
  /*
   * Advice never changes observable file contents, so version 0 deliberately
   * treats supported hints as no-ops. Still cross the descriptor boundary to
   * preserve POSIX EBADF behavior instead of accepting an arbitrary integer.
   */
  dolly_process_stat_response response;
  const dolly_process_fd_request request = {(uint32_t)descriptor, 0};
  const int64_t result = dolly_process_call(
      DOLLY_PROCESS_FD_STAT, &request, sizeof(request),
      &response, sizeof(response));
  if (result < 0) return (int)result;
  return (uint64_t)result == sizeof(response) ? 0 : -EIO;
}

int __syscall_ftruncate64(int descriptor, int64_t size) {
  if (size < 0) return -EINVAL;
  const dolly_process_fd_truncate_request request = {
      (uint32_t)descriptor, 0, (uint64_t)size,
  };
  const int64_t result = dolly_process_call(
      DOLLY_PROCESS_FD_TRUNCATE, &request, sizeof(request), NULL, 0);
  return result < 0 ? (int)result : 0;
}

int __syscall_fallocate(int descriptor, int mode,
                        off_t offset, off_t length) {
  if (mode != 0) return -ENOTSUP;
  if (offset < 0 || length <= 0 || offset > INT64_MAX - length) {
    return -EINVAL;
  }
  struct stat metadata;
  const int stated = __syscall_fstat64(descriptor, &metadata);
  if (stated != 0) return stated;
  const int64_t end = offset + length;
  return metadata.st_size >= end
      ? 0 : __syscall_ftruncate64(descriptor, end);
}

int __syscall_truncate64(const char *path, int64_t size) {
  if (path == NULL) return -EFAULT;
  if (size < 0) return -EINVAL;
  const int descriptor = __syscall_openat(AT_FDCWD, path, O_WRONLY);
  if (descriptor < 0) return descriptor;
  const int result = __syscall_ftruncate64(descriptor, size);
  const __wasi_errno_t close_error = __wasi_fd_close(descriptor);
  return result != 0 ? result : close_error == 0 ? 0 : -(int)close_error;
}

static int encode_timestamp(const struct timespec *source,
                            dolly_process_timestamp *target) {
  memset(target, 0, sizeof(*target));
  if (source->tv_nsec == UTIME_NOW) {
    target->flags = DOLLY_PROCESS_TIME_NOW;
  } else if (source->tv_nsec == UTIME_OMIT) {
    target->flags = DOLLY_PROCESS_TIME_OMIT;
  } else if (source->tv_nsec < 0 || source->tv_nsec >= 1000000000L) {
    return -EINVAL;
  } else {
    target->seconds = source->tv_sec;
    target->nanoseconds = (uint32_t)source->tv_nsec;
  }
  return 0;
}

static void encode_timestamps(const struct timespec times[2],
                              dolly_process_timestamp *access,
                              dolly_process_timestamp *modification,
                              int *result) {
  const struct timespec now[2] = {
      {.tv_nsec = UTIME_NOW}, {.tv_nsec = UTIME_NOW},
  };
  if (times == NULL) times = now;
  *result = encode_timestamp(&times[0], access);
  if (*result == 0) *result = encode_timestamp(&times[1], modification);
}

int __syscall_utimensat(int directory, const char *path,
                        const struct timespec times[2], int flags) {
  if ((flags & ~AT_SYMLINK_NOFOLLOW) != 0) return -EINVAL;
  int result = 0;
  if (path == NULL) {
    if (flags != 0 || directory < 0) return -EINVAL;
    dolly_process_fd_times_request request = {
        .descriptor = (uint32_t)directory,
    };
    encode_timestamps(times, &request.access, &request.modification, &result);
    if (result != 0) return result;
    const int64_t called = dolly_process_call(
        DOLLY_PROCESS_FD_SET_TIMES, &request, sizeof(request), NULL, 0);
    return called < 0 ? (int)called : 0;
  }
  size_t path_size;
  result = checked_path_size(path, &path_size);
  if (result != 0) return result;
  dolly_process_path_times_request request = {
      .directory_descriptor = (uint32_t)directory_descriptor(directory),
      .flags = (flags & AT_SYMLINK_NOFOLLOW) != 0
          ? DOLLY_PROCESS_PATH_NOFOLLOW : 0,
      .path_size = (uint32_t)path_size,
  };
  encode_timestamps(times, &request.access, &request.modification, &result);
  if (result != 0) return result;
  const int64_t called = call_with_path(DOLLY_PROCESS_PATH_SET_TIMES, &request,
                                        sizeof(request), path, path_size, NULL, 0);
  return called < 0 ? (int)called : 0;
}

static int decode_filesystem_stat(
    const dolly_process_filesystem_stat_response *source,
    struct statfs *target) {
  if (source->reserved != 0) return -EIO;
  memset(target, 0, sizeof(*target));
  target->f_type = source->type;
  target->f_bsize = source->block_size;
  target->f_blocks = source->blocks;
  target->f_bfree = source->blocks_free;
  target->f_bavail = source->blocks_available;
  target->f_files = source->files;
  target->f_ffree = source->files_free;
  target->f_fsid.__val[0] = source->filesystem_id[0];
  target->f_fsid.__val[1] = source->filesystem_id[1];
  target->f_namelen = source->maximum_name_length;
  target->f_frsize = source->fragment_size;
  target->f_flags = source->flags;
  return 0;
}

int __syscall_statfs64(const char *path, size_t size, struct statfs *metadata) {
  if (size != sizeof(*metadata) || metadata == NULL) return -EINVAL;
  dolly_process_filesystem_stat_response response;
  const int64_t result = path_call(
      DOLLY_PROCESS_PATH_STAT_FILESYSTEM, AT_FDCWD, 0, path,
      &response, sizeof(response));
  if (result < 0) return (int)result;
  return (uint64_t)result == sizeof(response)
      ? decode_filesystem_stat(&response, metadata) : -EIO;
}

int __syscall_fstatfs64(int descriptor, size_t size, struct statfs *metadata) {
  if (size != sizeof(*metadata) || metadata == NULL) return -EINVAL;
  const dolly_process_fd_request request = {(uint32_t)descriptor, 0};
  dolly_process_filesystem_stat_response response;
  const int64_t result = dolly_process_call(
      DOLLY_PROCESS_FD_STAT_FILESYSTEM, &request, sizeof(request),
      &response, sizeof(response));
  if (result < 0) return (int)result;
  return (uint64_t)result == sizeof(response)
      ? decode_filesystem_stat(&response, metadata) : -EIO;
}

int __syscall_getuid32(void) { return 0; }
int __syscall_geteuid32(void) { return 0; }
int __syscall_getgid32(void) { return 0; }
int __syscall_getegid32(void) { return 0; }

/* Dolly has no permission boundary inside its shared userspace. Keep umask as
 * process-local libc compatibility state without turning it into a kernel or
 * browser capability. */
int __syscall_umask(mode_t mask) {
  static mode_t current = 0022;
  return __atomic_exchange_n(&current, mask & 0777, __ATOMIC_SEQ_CST);
}

/* The limits every process has, which nothing can change: the kernel's
 * descriptor and process tables, and the linker's memory ceiling and stack. */
int __syscall_prlimit64(pid_t pid, int resource, const struct rlimit *new_limit,
                        struct rlimit *old_limit) {
  (void)pid;
  if (new_limit) return -EPERM;
  if (old_limit) {
    const rlim_t limit = resource == RLIMIT_NOFILE ? 256 : resource == RLIMIT_NPROC ? 32
        : resource == RLIMIT_AS || resource == RLIMIT_DATA ? (rlim_t)8 << 30
        : resource == RLIMIT_STACK ? (rlim_t)8 << 20 : RLIM_INFINITY;
    *old_limit = (struct rlimit){limit, limit};
  }
  return 0;
}

int __syscall_mknodat(int directory, const char *path,
                      mode_t mode, dev_t device) {
  (void)directory;
  (void)path;
  (void)mode;
  (void)device;
  return -ENOSYS;
}

int __syscall_fchdir(int descriptor) {
  if (descriptor < 0) return -EBADF;
  const int64_t result = path_call(
      DOLLY_PROCESS_PATH_SET_CURRENT_DIRECTORY, descriptor, 0, ".", NULL, 0);
  return result < 0 ? (int)result : 0;
}

int getaddrinfo(const char *node, const char *service,
                const struct addrinfo *hints, struct addrinfo **result) {
  (void)node;
  (void)service;
  (void)hints;
  if (result != NULL) *result = NULL;
  return EAI_FAIL;
}

/* No address list is allocated by Dolly's unsupported resolver. */
void freeaddrinfo(struct addrinfo *result) { (void)result; }
struct protoent *getprotobyname(const char *name) {
  (void)name; errno = ENOSYS; return NULL;
}
struct protoent *getprotobynumber(int number) {
  (void)number; errno = ENOSYS; return NULL;
}
const struct in6_addr in6addr_any = IN6ADDR_ANY_INIT;

/*
 * This is the process target's serialized libc fallback.  Runtimes such as
 * CPython deliberately provide a stronger single-thread pthread facade of
 * their own; normal static-link symbol ownership must let that definition
 * replace the generic one without a runtime-specific linker exception.
 */
#ifndef __EMSCRIPTEN_PTHREADS__
__attribute__((weak)) pthread_t pthread_self(void) { return (pthread_t)(uintptr_t)1; }

__attribute__((weak)) int pthread_condattr_init(pthread_condattr_t *attribute) {
  (void)attribute; return ENOSYS;
}
__attribute__((weak)) int pthread_condattr_destroy(pthread_condattr_t *attribute) {
  (void)attribute; return ENOSYS;
}
__attribute__((weak)) int pthread_condattr_setclock(pthread_condattr_t *attribute,
                                                  clockid_t clock) {
  (void)attribute; (void)clock; return ENOSYS;
}
__attribute__((weak)) int pthread_getname_np(pthread_t thread, char *name, size_t size) {
  (void)thread; (void)name; (void)size; return ENOSYS;
}
__attribute__((weak)) int pthread_setname_np(pthread_t thread, const char *name) {
  (void)thread; (void)name; return ENOSYS;
}
__attribute__((weak)) int pthread_getschedparam(pthread_t thread, int *policy,
                                               struct sched_param *parameter) {
  (void)thread; (void)policy; (void)parameter; return ENOSYS;
}
__attribute__((weak)) int pthread_setschedparam(pthread_t thread, int policy,
                                               const struct sched_param *parameter) {
  (void)thread; (void)policy; (void)parameter; return ENOSYS;
}
int sched_get_priority_max(int policy) { (void)policy; errno = ENOSYS; return -1; }
int sched_get_priority_min(int policy) { (void)policy; errno = ENOSYS; return -1; }
__attribute__((weak)) int sem_init(sem_t *semaphore, int shared, unsigned value) {
  (void)semaphore; (void)shared; (void)value; errno = ENOSYS; return -1;
}
__attribute__((weak)) int sem_destroy(sem_t *semaphore) {
  (void)semaphore; errno = ENOSYS; return -1;
}
/* A serial process has one thread, so a cleanup handler runs only when popped. */
void _pthread_cleanup_push(struct __ptcb *callback,
                           void (*function)(void *), void *argument) {
  callback->__f = function;
  callback->__x = argument;
  callback->__next = NULL;
}
void _pthread_cleanup_pop(struct __ptcb *callback, int execute) {
  if (execute != 0 && callback != NULL && callback->__f != NULL) {
    callback->__f(callback->__x);
  }
}
#endif

__wasi_errno_t __wasi_random_get(uint8_t *buffer, __wasi_size_t size) {
  if (buffer == NULL && size != 0) return EFAULT;
  unsigned char *cursor = buffer;
  while (size != 0) {
    const size_t chunk = size > DOLLY_PROCESS_PACKET_LIMIT
        ? DOLLY_PROCESS_PACKET_LIMIT : size;
    const int64_t result = dolly_process_call(
        DOLLY_PROCESS_RANDOM, NULL, 0, cursor, chunk);
    const __wasi_errno_t error = call_errno(result);
    if (error != 0) return error;
    if ((uint64_t)result != chunk) return EIO;
    cursor += chunk;
    size -= chunk;
  }
  return 0;
}

static __wasi_filetype_t wasi_file_type(uint32_t type) {
  switch (type) {
    case DOLLY_PROCESS_FILE_BLOCK_DEVICE: return __WASI_FILETYPE_BLOCK_DEVICE;
    case DOLLY_PROCESS_FILE_CHARACTER_DEVICE: return __WASI_FILETYPE_CHARACTER_DEVICE;
    case DOLLY_PROCESS_FILE_DIRECTORY: return __WASI_FILETYPE_DIRECTORY;
    case DOLLY_PROCESS_FILE_REGULAR: return __WASI_FILETYPE_REGULAR_FILE;
    case DOLLY_PROCESS_FILE_SYMBOLIC_LINK: return __WASI_FILETYPE_SYMBOLIC_LINK;
    default: return __WASI_FILETYPE_UNKNOWN;
  }
}

__wasi_errno_t __wasi_fd_fdstat_get(__wasi_fd_t descriptor,
                                     __wasi_fdstat_t *status) {
  if (status == NULL) return EFAULT;
  const dolly_process_fd_request request = {descriptor, 0};
  dolly_process_stat_response response;
  const int64_t result = dolly_process_call(
      DOLLY_PROCESS_FD_STAT, &request, sizeof(request),
      &response, sizeof(response));
  const __wasi_errno_t error = call_errno(result);
  if (error != 0) return error;
  if ((uint64_t)result != sizeof(response)) return EIO;
  memset(status, 0, sizeof(*status));
  status->fs_filetype = wasi_file_type(response.file_type);
  status->fs_rights_base = UINT64_MAX;
  status->fs_rights_inheriting = UINT64_MAX;
  return 0;
}

static int stat_path(int directory, const char *path, struct stat *metadata,
                     uint32_t flags) {
  if (metadata == NULL) return -EFAULT;
  dolly_process_stat_response response;
  const int64_t result = path_call(
      DOLLY_PROCESS_PATH_STAT, directory, flags, path,
      &response, sizeof(response));
  if (result < 0) return (int)result;
  return (uint64_t)result == sizeof(response) ? decode_stat(&response, metadata) : -EIO;
}

/* One user and no permission bits: chmod and chown only check that their
 * target exists and change nothing. */
static int existing_path(int directory, const char *path, int flags) {
  if ((flags & ~AT_SYMLINK_NOFOLLOW) != 0) return -EINVAL;
  struct stat metadata;
  return stat_path(directory, path, &metadata,
                   flags != 0 ? DOLLY_PROCESS_PATH_NOFOLLOW : 0);
}

static int existing_descriptor(int descriptor) {
  struct stat metadata;
  return __syscall_fstat64(descriptor, &metadata);
}

int __syscall_chmod(const char *path, mode_t mode) {
  (void)mode;
  return existing_path(AT_FDCWD, path, 0);
}

int __syscall_fchmodat2(int directory, const char *path,
                        mode_t mode, int flags) {
  (void)mode;
  return existing_path(directory, path, flags);
}

int __syscall_fchmod(int descriptor, mode_t mode) {
  (void)mode;
  return existing_descriptor(descriptor);
}

int __syscall_fchown32(int descriptor, unsigned user, unsigned group) {
  (void)user;
  (void)group;
  return existing_descriptor(descriptor);
}

int __syscall_fchownat(int directory, const char *path,
                       uid_t user, gid_t group, int flags) {
  (void)user;
  (void)group;
  return existing_path(directory, path, flags);
}

int __syscall_stat64(const char *path, struct stat *metadata) {
  return stat_path(AT_FDCWD, path, metadata, 0);
}

int __syscall_lstat64(const char *path, struct stat *metadata) {
  return stat_path(AT_FDCWD, path, metadata, DOLLY_PROCESS_PATH_NOFOLLOW);
}

int __syscall_newfstatat(int directory, const char *path,
                         struct stat *metadata, int flags) {
  const int known = AT_SYMLINK_NOFOLLOW;
  if ((flags & ~known) != 0) return -EINVAL;
  return stat_path(directory, path, metadata,
                   (flags & AT_SYMLINK_NOFOLLOW) != 0
                       ? DOLLY_PROCESS_PATH_NOFOLLOW : 0);
}

int __syscall_faccessat(int directory, const char *path, int mode, int flags) {
  const int known_mode = R_OK | W_OK | X_OK;
  int known_flags = AT_SYMLINK_NOFOLLOW;
#ifdef AT_EACCESS
  known_flags |= AT_EACCESS;
#endif
  if ((mode & ~known_mode) != 0 || (flags & ~known_flags) != 0) return -EINVAL;
  struct stat metadata;
  return stat_path(directory, path, &metadata,
                   (flags & AT_SYMLINK_NOFOLLOW) != 0
                       ? DOLLY_PROCESS_PATH_NOFOLLOW : 0);
}

int __syscall_mkdirat(int directory, const char *path, mode_t mode) {
  (void)mode;
  const int64_t result = path_call(
      DOLLY_PROCESS_PATH_CREATE_DIRECTORY, directory, 0, path, NULL, 0);
  return result < 0 ? (int)result : 0;
}

int __syscall_chdir(const char *path) {
  const int64_t result = path_call(
      DOLLY_PROCESS_PATH_SET_CURRENT_DIRECTORY, AT_FDCWD, 0, path, NULL, 0);
  return result < 0 ? (int)result : 0;
}

int __syscall_unlinkat(int directory, const char *path, int flags) {
  if ((flags & ~AT_REMOVEDIR) != 0) return -EINVAL;
  const int64_t result = path_call(
      DOLLY_PROCESS_PATH_REMOVE, directory,
      (flags & AT_REMOVEDIR) != 0 ? DOLLY_PROCESS_PATH_DIRECTORY : 0,
      path, NULL, 0);
  return result < 0 ? (int)result : 0;
}

int __syscall_rmdir(const char *path) {
  return __syscall_unlinkat(AT_FDCWD, path, AT_REMOVEDIR);
}

static int two_path_call(uint32_t operation,
                         int old_directory, const char *old_path,
                         int new_directory, const char *new_path) {
  if (old_path == NULL || new_path == NULL) return -EFAULT;
  const size_t old_size = strnlen(old_path, PATH_MAX + 1u);
  const size_t new_size = strnlen(new_path, PATH_MAX + 1u);
  if (old_size == 0 || new_size == 0) return -ENOENT;
  if (old_size > PATH_MAX || new_size > PATH_MAX) return -ENAMETOOLONG;
  const size_t packet_size = sizeof(dolly_process_two_path_request) +
      old_size + new_size;
  unsigned char *packet = malloc(packet_size);
  if (packet == NULL) return -ENOMEM;
  const dolly_process_two_path_request request = {
      (uint32_t)directory_descriptor(old_directory),
      (uint32_t)directory_descriptor(new_directory),
      (uint32_t)old_size,
      (uint32_t)new_size,
  };
  memcpy(packet, &request, sizeof(request));
  memcpy(packet + sizeof(request), old_path, old_size);
  memcpy(packet + sizeof(request) + old_size, new_path, new_size);
  const int64_t result = dolly_process_call(
      operation, packet, packet_size, NULL, 0);
  free(packet);
  return result < 0 ? (int)result : 0;
}

int __syscall_renameat(int old_directory, const char *old_path,
                       int new_directory, const char *new_path) {
  return two_path_call(DOLLY_PROCESS_PATH_RENAME,
                       old_directory, old_path, new_directory, new_path);
}

int __syscall_linkat(int old_directory, const char *old_path,
                     int new_directory, const char *new_path, int flags) {
  if (flags != 0) return -ENOTSUP;
  return two_path_call(DOLLY_PROCESS_PATH_LINK,
                       old_directory, old_path, new_directory, new_path);
}

int __syscall_symlinkat(const char *target, int directory,
                        const char *link_path) {
  return two_path_call(DOLLY_PROCESS_PATH_SYMLINK,
                       AT_FDCWD, target, directory, link_path);
}

int __syscall_readlinkat(int directory, const char *path,
                         char *buffer, size_t size) {
  if (buffer == NULL && size != 0) return -EFAULT;
  const int64_t result = path_call(
      DOLLY_PROCESS_PATH_READLINK, directory, 0, path, buffer, size);
  if (result < 0) return (int)result;
  return result <= INT_MAX ? (int)result : -EOVERFLOW;
}

static int duplicate_descriptor_flags(int old_descriptor,
                                      uint32_t new_descriptor,
                                      uint32_t flags) {
  if (old_descriptor < 0) return -EBADF;
  const dolly_process_fd_dup_request request = {
      (uint32_t)old_descriptor, new_descriptor, flags, 0,
  };
  dolly_process_fd_dup_response response = {0};
  const int64_t result = dolly_process_call(
      DOLLY_PROCESS_FD_DUP, &request, sizeof(request),
      &response, sizeof(response));
  if (result < 0) return (int)result;
  if ((uint64_t)result != sizeof(response) || response.reserved != 0 ||
      response.descriptor > INT_MAX ||
      ((flags & DOLLY_PROCESS_FD_DUP_MINIMUM) == 0 &&
       new_descriptor != UINT32_MAX && response.descriptor != new_descriptor) ||
      ((flags & DOLLY_PROCESS_FD_DUP_MINIMUM) != 0 &&
       response.descriptor < new_descriptor)) {
    return -EIO;
  }
  return (int)response.descriptor;
}

static int duplicate_descriptor(int old_descriptor, uint32_t new_descriptor) {
  return duplicate_descriptor_flags(old_descriptor, new_descriptor, 0);
}

int __syscall_dup(int descriptor) {
  return duplicate_descriptor(descriptor, UINT32_MAX);
}

int __syscall_dup3(int old_descriptor, int new_descriptor, int flags) {
  if (new_descriptor < 0) return -EBADF;
  if (old_descriptor == new_descriptor ||
      (flags & ~O_CLOEXEC) != 0) return -EINVAL;
  return duplicate_descriptor_flags(old_descriptor, (uint32_t)new_descriptor,
      (flags & O_CLOEXEC) != 0 ? DOLLY_PROCESS_FD_DUP_CLOEXEC : 0);
}

static int fd_flags_get(uint32_t operation, int descriptor) {
  if (descriptor < 0) return -EBADF;
  const dolly_process_fd_request request = {(uint32_t)descriptor, 0};
  dolly_process_fd_flags response = {0};
  const int64_t result = dolly_process_call(
      operation, &request, sizeof(request),
      &response, sizeof(response));
  if (result < 0) return (int)result;
  if ((uint64_t)result != sizeof(response) ||
      response.descriptor != (uint32_t)descriptor ||
      response.flags > INT_MAX) return -EIO;
  return (int)response.flags;
}

static int fd_flags_set(uint32_t operation, int descriptor, uint32_t flags) {
  if (descriptor < 0) return -EBADF;
  const dolly_process_fd_flags request = {
      (uint32_t)descriptor, flags,
  };
  const int64_t result = dolly_process_call(
      operation, &request, sizeof(request), NULL, 0);
  return result < 0 ? (int)result : result == 0 ? 0 : -EIO;
}

static int get_status_flags(int descriptor) {
  const int status = fd_flags_get(DOLLY_PROCESS_FD_GET_FLAGS, descriptor);
  if (status < 0) return status;
  const int readable = (status & DOLLY_PROCESS_FD_STATUS_READ) != 0;
  const int writable = (status & DOLLY_PROCESS_FD_STATUS_WRITE) != 0;
  return (readable && writable ? O_RDWR : writable ? O_WRONLY : O_RDONLY) |
      (status & DOLLY_PROCESS_FD_STATUS_APPEND ? O_APPEND : 0) |
      (status & DOLLY_PROCESS_FD_STATUS_NONBLOCK ? O_NONBLOCK : 0);
}

/* F_SETFL ignores the access mode and file creation flags; musl always adds O_LARGEFILE. */
static int set_status_flags(int descriptor, int flags) {
  const int ignored = O_ACCMODE | O_LARGEFILE | O_CLOEXEC | O_CREAT | O_DIRECTORY | O_EXCL |
      O_NOCTTY | O_NOFOLLOW | O_TRUNC;
  if ((flags & ~(ignored | O_APPEND | O_NONBLOCK)) != 0) return -EINVAL;
  return fd_flags_set(DOLLY_PROCESS_FD_SET_FLAGS, descriptor,
      (flags & O_APPEND ? DOLLY_PROCESS_FD_STATUS_APPEND : 0) |
      (flags & O_NONBLOCK ? DOLLY_PROCESS_FD_STATUS_NONBLOCK : 0));
}

/*
 * Emscripten musl lowers ioctl() to this syscall veneer and passes a pointer
 * to the packed variadic argument.  Standalone Wasm otherwise contributes a
 * weak ENOSYS stub, which is observably wrong even for ordinary file opens:
 * POSIX runtimes commonly probe FIOCLEX before falling back to fcntl().
 *
 * Keep libc structures above the process ABI.  Dolly's machine contract only
 * carries semantic descriptor flags and its terminal-discipline bits; this
 * adapter translates the target libc's ioctl numbers and layouts.
 */
static uintptr_t ioctl_argument(uintptr_t arguments) {
  uintptr_t argument = 0;
  if (arguments != 0) {
    memcpy(&argument, (const void *)arguments, sizeof(argument));
  }
  return argument;
}

/*
 * The terminal performs no input mapping or flow control, Ctrl+C is its only
 * signal key, and reads return the bytes available (VMIN 1, VTIME 0).
 * TCGETS reports exactly that. TCSETS* rejects requests for anything else
 * and, as POSIX allows, ignores attributes that cannot apply to a terminal
 * without a line, such as speeds, parity and break handling.
 */
static int terminal_mode_from_attributes(const struct termios *attributes) {
  const tcflag_t unsupported_input =
      ICRNL | INLCR | IGNCR | IUCLC | IXON | IXOFF | IXANY | ISTRIP;
  const cc_t *keys = attributes->c_cc;
  if ((attributes->c_iflag & unsupported_input) != 0 ||
      (attributes->c_oflag & ~(tcflag_t)(OPOST | ONLCR)) != 0 ||
      ((attributes->c_lflag & ISIG) != 0 &&
       (keys[VINTR] != 3 || keys[VQUIT] != 0 || keys[VSUSP] != 0)) ||
      ((attributes->c_lflag & ICANON) == 0 &&
       (keys[VMIN] != 1 || keys[VTIME] != 0))) return -EINVAL;
  uint32_t mode = 0;
  if ((attributes->c_lflag & ICANON) != 0) mode |= DOLLY_TERMINAL_CANONICAL;
  if ((attributes->c_lflag & ECHO) != 0) mode |= DOLLY_TERMINAL_ECHO;
  if ((attributes->c_lflag & ISIG) != 0) mode |= DOLLY_TERMINAL_ISIG;
  if ((attributes->c_oflag & OPOST) != 0) mode |= DOLLY_TERMINAL_OPOST;
  if ((attributes->c_oflag & ONLCR) != 0) mode |= DOLLY_TERMINAL_ONLCR;
  return (int)mode;
}

/* Output is never queued, so only unread input can be discarded. */
static int discard_terminal_input(int descriptor) {
  const dolly_process_terminal_request request = {
      DOLLY_PROCESS_TERMINAL_READ, (uint32_t)descriptor, 0, 0, 0,
  };
  dolly_process_terminal_response response;
  int64_t result;
  do {
    result = dolly_process_call(DOLLY_PROCESS_TERMINAL, &request, sizeof(request),
                                &response, sizeof(response));
  } while (result == sizeof(response) && response.value >= 0);
  if (result < 0) return (int)result;
  return result == sizeof(response) ? 0 : -EIO;
}

int __syscall_ioctl(int descriptor, int request, uintptr_t arguments) {
  const uintptr_t argument = ioctl_argument(arguments);
  switch (request) {
    case FIOCLEX:
    case FIONCLEX:
      return fd_flags_set(DOLLY_PROCESS_FD_SET_DESCRIPTOR_FLAGS, descriptor,
          request == FIOCLEX ? DOLLY_PROCESS_FD_CLOEXEC : 0);
    case FIONBIO: {
      if (argument == 0) return -EFAULT;
      int enabled = 0;
      memcpy(&enabled, (const void *)argument, sizeof(enabled));
      const int flags = get_status_flags(descriptor);
      if (flags < 0) return flags;
      return set_status_flags(descriptor, enabled ? flags | O_NONBLOCK : flags & ~O_NONBLOCK);
    }
    case TCGETS: {
      if (argument == 0) return -EFAULT;
      const int mode = dolly_terminal_mode_get(descriptor);
      if (mode < 0) return mode;
      struct termios attributes;
      memset(&attributes, 0, sizeof(attributes));
      if (mode & DOLLY_TERMINAL_OPOST) attributes.c_oflag |= OPOST;
      if (mode & DOLLY_TERMINAL_ONLCR) attributes.c_oflag |= ONLCR;
      attributes.c_cflag = CS8 | CREAD;
      if ((mode & DOLLY_TERMINAL_ISIG) != 0) attributes.c_lflag |= ISIG;
      if ((mode & DOLLY_TERMINAL_CANONICAL) != 0) {
        attributes.c_lflag |= ICANON;
      }
      if ((mode & DOLLY_TERMINAL_ECHO) != 0) {
        attributes.c_lflag |= ECHO | ECHOE | ECHOK;
      }
      attributes.c_cc[VINTR] = 3;
      attributes.c_cc[VERASE] = 127;
      attributes.c_cc[VKILL] = 21;
      attributes.c_cc[VEOF] = 4;
      attributes.c_cc[VMIN] = 1;
      attributes.c_cc[VTIME] = 0;
      attributes.__c_ispeed = B38400;
      attributes.__c_ospeed = B38400;
      memcpy((void *)argument, &attributes, sizeof(attributes));
      return 0;
    }
    case TCSETS:
    case TCSETSW:
    case TCSETSF: {
      if (argument == 0) return -EFAULT;
      struct termios attributes;
      memcpy(&attributes, (const void *)argument, sizeof(attributes));
      const int mode = terminal_mode_from_attributes(&attributes);
      if (mode < 0) return mode;
      const int result = dolly_terminal_mode_set(descriptor, (uint32_t)mode);
      if (result < 0 || request != TCSETSF) return result;
      return discard_terminal_input(descriptor);
    }
    /* These pass an int, and only the argument's low half holds it. */
    case TCFLSH: {
      const int mode = dolly_terminal_mode_get(descriptor);
      if (mode < 0) return mode;
      if ((int)argument == TCOFLUSH) return 0;
      if ((int)argument != TCIFLUSH && (int)argument != TCIOFLUSH) return -EINVAL;
      return discard_terminal_input(descriptor);
    }
    case TCSBRK:
    case TCXONC: {
      /* tcdrain() is TCSBRK with a nonzero argument; break and flow control
       * have no meaning without a line. */
      const int mode = dolly_terminal_mode_get(descriptor);
      if (mode < 0) return mode;
      return request == TCSBRK && (int)argument != 0 ? 0 : -ENOTSUP;
    }
    case TIOCGWINSZ: {
      if (argument == 0) return -EFAULT;
      const dolly_process_terminal_request request = {
          DOLLY_PROCESS_TERMINAL_SIZE, (uint32_t)descriptor, 0, 0, 0,
      };
      dolly_process_terminal_response response;
      const int64_t result = dolly_process_call(
          DOLLY_PROCESS_TERMINAL, &request, sizeof(request), &response, sizeof(response));
      if (result < 0) return (int)result;
      if ((uint64_t)result != sizeof(response)) return -EIO;
      struct winsize size;
      memset(&size, 0, sizeof(size));
      size.ws_row = (unsigned short)response.rows;
      size.ws_col = (unsigned short)response.columns;
      memcpy((void *)argument, &size, sizeof(size));
      return 0;
    }
    case TIOCSWINSZ: {
      const int mode = dolly_terminal_mode_get(descriptor);
      return mode < 0 ? mode : -EPERM;
    }
    default: {
      const int flags = fd_flags_get(DOLLY_PROCESS_FD_GET_FLAGS, descriptor);
      return flags < 0 ? flags : -ENOTTY;
    }
  }
}

/*
 * Emscripten's musl syscall veneer passes a pointer to its packed variadic
 * arguments. Descriptor and open-file flags are distinct kernel state.
 */
int __syscall_fcntl64(int descriptor, int command, uintptr_t arguments) {
  int integer = 0;
  if (arguments != 0) memcpy(&integer, (const void *)arguments, sizeof(integer));
  switch (command) {
    case F_DUPFD:
    case F_DUPFD_CLOEXEC:
      if (arguments == 0 || integer < 0) return -EINVAL;
      return duplicate_descriptor_flags(
          descriptor, (uint32_t)integer, DOLLY_PROCESS_FD_DUP_MINIMUM |
          (command == F_DUPFD_CLOEXEC ? DOLLY_PROCESS_FD_DUP_CLOEXEC : 0));
    case F_GETFD: {
      const int flags = fd_flags_get(
          DOLLY_PROCESS_FD_GET_DESCRIPTOR_FLAGS, descriptor);
      if (flags < 0) return flags;
      if ((flags & ~DOLLY_PROCESS_FD_CLOEXEC) != 0) return -EIO;
      return (flags & DOLLY_PROCESS_FD_CLOEXEC) != 0 ? FD_CLOEXEC : 0;
    }
    case F_SETFD:
      if (arguments == 0 || (integer & ~FD_CLOEXEC) != 0) return -EINVAL;
      return fd_flags_set(DOLLY_PROCESS_FD_SET_DESCRIPTOR_FLAGS, descriptor,
          (integer & FD_CLOEXEC) != 0 ? DOLLY_PROCESS_FD_CLOEXEC : 0);
    case F_GETFL:
      return get_status_flags(descriptor);
    case F_SETFL:
      return arguments == 0 ? -EINVAL : set_status_flags(descriptor, integer);
    case F_GETLK:
    case F_SETLK:
    case F_SETLKW: {
      const int flags = fd_flags_get(
          DOLLY_PROCESS_FD_GET_DESCRIPTOR_FLAGS, descriptor);
      return flags < 0 ? flags : -ENOTSUP;
    }
    default:
      return -EINVAL;
  }
}

int __syscall_pipe2(int descriptors[2], int flags) {
  if (descriptors == NULL) return -EFAULT;
  int known = O_CLOEXEC;
#ifdef O_NONBLOCK
  known |= O_NONBLOCK;
#endif
  if ((flags & ~known) != 0) return -EINVAL;
  const dolly_process_pipe_request request = {
      (flags & O_CLOEXEC) != 0 ? DOLLY_PROCESS_FD_CLOEXEC : 0, 0,
  };
  dolly_process_pipe_response response = {0};
  const int64_t result = dolly_process_call(
      DOLLY_PROCESS_FD_PIPE, &request, sizeof(request), &response, sizeof(response));
  if (result < 0) return (int)result;
  if ((uint64_t)result != sizeof(response) ||
      response.read_descriptor > INT_MAX || response.write_descriptor > INT_MAX ||
      response.read_descriptor == response.write_descriptor) return -EIO;
  if (flags & O_NONBLOCK) {
    int error = set_status_flags(response.read_descriptor, O_NONBLOCK);
    if (error == 0) error = set_status_flags(response.write_descriptor, O_NONBLOCK);
    if (error != 0) {
      close(response.read_descriptor);
      close(response.write_descriptor);
      return error;
    }
  }
  descriptors[0] = (int)response.read_descriptor;
  descriptors[1] = (int)response.write_descriptor;
  return 0;
}

static unsigned char directory_type(uint32_t type) {
  switch (type) {
    case DOLLY_PROCESS_FILE_REGULAR: return DT_REG;
    case DOLLY_PROCESS_FILE_DIRECTORY: return DT_DIR;
    case DOLLY_PROCESS_FILE_SYMBOLIC_LINK: return DT_LNK;
    case DOLLY_PROCESS_FILE_CHARACTER_DEVICE: return DT_CHR;
    case DOLLY_PROCESS_FILE_BLOCK_DEVICE: return DT_BLK;
    case DOLLY_PROCESS_FILE_FIFO: return DT_FIFO;
    case DOLLY_PROCESS_FILE_SOCKET: return DT_SOCK;
    default: return DT_UNKNOWN;
  }
}

int __syscall_getdents64(int descriptor, void *buffer, size_t size) {
  if (buffer == NULL) return -EFAULT;
  const size_t maximum_entries = size / sizeof(struct dirent);
  if (maximum_entries == 0) return -EINVAL;
  if (maximum_entries > UINT32_MAX) return -E2BIG;
  size_t stable_capacity = maximum_entries *
      (sizeof(dolly_process_directory_entry) + sizeof(((struct dirent *)0)->d_name) - 1);
  if (stable_capacity > DOLLY_PROCESS_PACKET_LIMIT) {
    stable_capacity = DOLLY_PROCESS_PACKET_LIMIT;
  }
  unsigned char *stable = malloc(stable_capacity);
  if (stable == NULL) return -ENOMEM;
  const dolly_process_directory_request request = {
      (uint32_t)descriptor, (uint32_t)maximum_entries, UINT64_MAX, 0,
  };
  const int64_t result = dolly_process_call(
      DOLLY_PROCESS_FD_READ_DIRECTORY, &request, sizeof(request),
      stable, stable_capacity);
  if (result < 0) {
    free(stable);
    return (int)result;
  }
  size_t source = 0;
  size_t output = 0;
  while (source < (size_t)result) {
    if ((size_t)result - source < sizeof(dolly_process_directory_entry) ||
        size - output < sizeof(struct dirent)) {
      free(stable);
      return -EIO;
    }
    dolly_process_directory_entry encoded;
    memcpy(&encoded, stable + source, sizeof(encoded));
    source += sizeof(encoded);
    if (encoded.name_size == 0 || encoded.name_size >= sizeof(((struct dirent *)0)->d_name) ||
        encoded.name_size > (size_t)result - source) {
      free(stable);
      return -EIO;
    }
    struct dirent *entry = (struct dirent *)((unsigned char *)buffer + output);
    memset(entry, 0, sizeof(*entry));
    entry->d_ino = encoded.inode;
    entry->d_off = encoded.next_cookie;
    entry->d_reclen = sizeof(*entry);
    entry->d_type = directory_type(encoded.file_type);
    memcpy(entry->d_name, stable + source, encoded.name_size);
    source += encoded.name_size;
    output += sizeof(*entry);
  }
  free(stable);
  return (int)output;
}

int __syscall_getcwd(char *buffer, size_t size) {
  if (buffer == NULL || size == 0) return -EINVAL;
  const int64_t result = dolly_process_call(
      DOLLY_PROCESS_PATH_GET_CURRENT_DIRECTORY, NULL, 0, buffer, size);
  if (result < 0) return (int)result;
  if ((uint64_t)result > size || result == 0 || buffer[result - 1] != 0) return -EIO;
  return (int)result;
}

/* Zig's C output references this BSD query; Dolly has no such table. */
int sysctlbyname(const char *name, void *old_value, size_t *old_size,
                 const void *new_value, size_t new_size) {
  (void)name; (void)old_value; (void)old_size; (void)new_value; (void)new_size;
  errno = ENOSYS;
  return -1;
}

/*
 * Emscripten's shared-memory libc normally obtains these from its worker JS.
 * Dolly has one execution thread per process; the pinned pthread_self_stub.c
 * supplies the real single-thread control block, while this initializes the
 * otherwise unused Wasm-Workers state lazily.
 */
void __do_set_thread_state(void) {}

/*
 * Emscripten's standalone libc calls this after memory.grow so a generated JS
 * loader can refresh cached typed-array views. Dolly's syscall gate either
 * uses Wasm multi-memory instructions or creates a fresh view for each call,
 * so it deliberately has no process import or cached view to update.
 */
void emscripten_notify_memory_growth(size_t memory_index) {
  (void)memory_index;
}
