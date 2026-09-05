#define _GNU_SOURCE

#include <dolly/process.h>
#include <dolly/runtime.h>

#include <errno.h>
#include <dirent.h>
#include <fcntl.h>
#include <limits.h>
#include <stdarg.h>
#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/stat.h>
#include <sys/statfs.h>
#include <termios.h>
#include <time.h>
#include <unistd.h>
#include <wasi/api.h>

#define DOLLY_PROCESS_IO_CHUNK 16384u

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
  const dolly_process_exit_request request = {status, 0};
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
  for (size_t index = 0; index < vector_count; ++index) {
    size_t current = 0;
    __wasi_errno_t error = fd_read_one(
        descriptor, vectors[index].buf, vectors[index].buf_len, &current);
    if (error != 0) return error;
    *completed += current;
    if (current != vectors[index].buf_len) break;
  }
  return 0;
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

static __wasi_errno_t fd_write_one(uint32_t descriptor,
                                   const unsigned char *buffer,
                                   size_t size, size_t *completed) {
  if (size > DOLLY_PROCESS_IO_CHUNK) {
    size = DOLLY_PROCESS_IO_CHUNK;
  }
  const size_t packet_size = sizeof(dolly_process_fd_io_request) + size;
  unsigned char *packet = malloc(packet_size);
  if (packet == NULL) return ENOMEM;
  dolly_process_fd_io_request request = {descriptor, 0, size};
  memcpy(packet, &request, sizeof(request));
  memcpy(packet + sizeof(request), buffer, size);
  dolly_process_io_result response = {0};
  const int64_t result = dolly_process_call(
      DOLLY_PROCESS_FD_WRITE, packet, packet_size,
      &response, sizeof(response));
  free(packet);
  const __wasi_errno_t error = call_errno(result);
  if (error != 0) return error;
  if ((uint64_t)result != sizeof(response) || response.size > size) return EIO;
  *completed = response.size;
  return 0;
}

__wasi_errno_t __wasi_fd_write(__wasi_fd_t descriptor,
                               const __wasi_ciovec_t *vectors,
                               size_t vector_count,
                               __wasi_size_t *completed) {
  *completed = 0;
  for (size_t index = 0; index < vector_count; ++index) {
    const unsigned char *cursor = vectors[index].buf;
    size_t remaining = vectors[index].buf_len;
    while (remaining != 0) {
      size_t current = 0;
      __wasi_errno_t error = fd_write_one(
          descriptor, cursor, remaining, &current);
      if (error != 0) return error;
      *completed += current;
      if (current == 0) return 0;
      cursor += current;
      remaining -= current;
    }
  }
  return 0;
}

__wasi_errno_t __wasi_clock_time_get(__wasi_clockid_t clock_id,
                                     __wasi_timestamp_t precision,
                                     __wasi_timestamp_t *time) {
  const dolly_process_clock_request request = {clock_id, 0, precision};
  dolly_process_clock_response response = {0};
  const int64_t result = dolly_process_call(
      DOLLY_PROCESS_CLOCK_TIME, &request, sizeof(request),
      &response, sizeof(response));
  const __wasi_errno_t error = call_errno(result);
  if (error != 0) return error;
  if ((uint64_t)result != sizeof(response)) return EIO;
  *time = response.nanoseconds;
  return 0;
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

static int64_t path_call(uint32_t operation, int directory, uint32_t flags,
                         const char *path, void *response,
                         size_t response_capacity) {
  if (path == NULL) return -EFAULT;
  const size_t path_size = strnlen(path, PATH_MAX + 1u);
  if (path_size == 0) return -ENOENT;
  if (path_size > PATH_MAX) return -ENAMETOOLONG;
  unsigned char *packet = malloc(sizeof(dolly_process_path_request) + path_size);
  if (packet == NULL) return -ENOMEM;
  const dolly_process_path_request request = {
      (uint32_t)directory_descriptor(directory), flags, 0, (uint32_t)path_size,
  };
  memcpy(packet, &request, sizeof(request));
  memcpy(packet + sizeof(request), path, path_size);
  const int64_t result = dolly_process_call(
      operation, packet, sizeof(request) + path_size,
      response, response_capacity);
  free(packet);
  return result;
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
#ifdef O_DIRECTORY
  if ((flags & O_DIRECTORY) != 0) result |= DOLLY_PROCESS_OPEN_DIRECTORY;
#endif
#ifdef O_NOFOLLOW
  if ((flags & O_NOFOLLOW) != 0) result |= DOLLY_PROCESS_OPEN_NOFOLLOW;
#endif
  return result;
}

int __syscall_openat(int directory, const char *path, int flags, ...) {
  (void)sizeof(va_list); /* The mode is intentionally not part of Dolly's ABI. */
  const uint32_t translated = translate_open_flags(flags);
  if (translated == 0) return -EINVAL;
  dolly_process_path_open_response response = {0};
  const int64_t result = path_call(
      DOLLY_PROCESS_PATH_OPEN, directory, translated, path,
      &response, sizeof(response));
  if (result < 0) return (int)result;
  return (uint64_t)result == sizeof(response) && response.reserved == 0
      ? (int)response.descriptor : -EIO;
}

static int decode_stat(const dolly_process_stat_response *source,
                       struct stat *target) {
  if (source->reserved[0] != 0 || source->reserved[1] != 0) return -EIO;
  memset(target, 0, sizeof(*target));
  target->st_dev = source->device;
  target->st_ino = source->inode;
  target->st_size = source->size;
  target->st_mode = source->mode;
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
  const size_t path_size = strnlen(path, PATH_MAX + 1u);
  if (path_size == 0) return -ENOENT;
  if (path_size > PATH_MAX) return -ENAMETOOLONG;
  const size_t packet_size = sizeof(dolly_process_path_times_request) + path_size;
  unsigned char *packet = malloc(packet_size);
  if (packet == NULL) return -ENOMEM;
  dolly_process_path_times_request request = {
      .directory_descriptor = (uint32_t)directory_descriptor(directory),
      .flags = (flags & AT_SYMLINK_NOFOLLOW) != 0
          ? DOLLY_PROCESS_PATH_NOFOLLOW : 0,
      .path_size = (uint32_t)path_size,
  };
  encode_timestamps(times, &request.access, &request.modification, &result);
  if (result == 0) {
    memcpy(packet, &request, sizeof(request));
    memcpy(packet + sizeof(request), path, path_size);
    const int64_t called = dolly_process_call(
        DOLLY_PROCESS_PATH_SET_TIMES, packet, packet_size, NULL, 0);
    result = called < 0 ? (int)called : 0;
  }
  free(packet);
  return result;
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
  const mode_t previous = current;
  current = mask & 0777;
  return previous;
}

int __syscall_chmod(const char *path, mode_t mode) {
  (void)path;
  (void)mode;
  return 0;
}

int __syscall_fchmod(int descriptor, mode_t mode) {
  (void)descriptor;
  (void)mode;
  return 0;
}

int __syscall_fchmodat2(int directory, const char *path,
                        mode_t mode, int flags) {
  (void)directory;
  (void)path;
  (void)mode;
  (void)flags;
  return 0;
}

int __syscall_fchown32(int descriptor, unsigned user, unsigned group) {
  (void)descriptor;
  (void)user;
  (void)group;
  return 0;
}

int __syscall_fchownat(int directory, const char *path,
                       uid_t user, gid_t group, int flags) {
  (void)directory;
  (void)path;
  (void)user;
  (void)group;
  (void)flags;
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
  (void)descriptor;
  return -ENOSYS;
}

int __syscall_accept4(int descriptor, uintptr_t address,
                      uintptr_t address_length, int flags, int unused1,
                      int unused2) {
  (void)descriptor; (void)address; (void)address_length; (void)flags;
  (void)unused1; (void)unused2;
  return -ENOSYS;
}

int __syscall_bind(int descriptor, uintptr_t address, int address_length,
                   int unused1, int unused2, int unused3) {
  (void)descriptor; (void)address; (void)address_length;
  (void)unused1; (void)unused2; (void)unused3;
  return -ENOSYS;
}

int __syscall_connect(int descriptor, uintptr_t address, int address_length,
                      int unused1, int unused2, int unused3) {
  return __syscall_bind(descriptor, address, address_length,
                        unused1, unused2, unused3);
}

int __syscall_getsockname(int descriptor, uintptr_t address,
                          uintptr_t address_length, int unused1, int unused2,
                          int unused3) {
  (void)descriptor; (void)address; (void)address_length;
  (void)unused1; (void)unused2; (void)unused3;
  return -ENOSYS;
}

int __syscall_listen(int descriptor, int backlog, int unused1, int unused2,
                     int unused3, int unused4) {
  (void)descriptor; (void)backlog; (void)unused1; (void)unused2;
  (void)unused3; (void)unused4;
  return -ENOSYS;
}

int __syscall_recvmsg(int descriptor, uintptr_t message, int flags,
                      int unused1, int unused2, int unused3) {
  (void)descriptor; (void)message; (void)flags;
  (void)unused1; (void)unused2; (void)unused3;
  return -ENOSYS;
}

int __syscall_sendmsg(int descriptor, uintptr_t message, int flags,
                      int unused1, int unused2, int unused3) {
  return __syscall_recvmsg(descriptor, message, flags,
                           unused1, unused2, unused3);
}

int __syscall_setsockopt(int descriptor, int level, int option,
                         uintptr_t value, int value_size, int unused) {
  (void)descriptor; (void)level; (void)option; (void)value;
  (void)value_size; (void)unused;
  return -ENOSYS;
}

int __syscall_shutdown(int descriptor, int how, int unused1, int unused2,
                       int unused3, int unused4) {
  return __syscall_listen(descriptor, how, unused1, unused2, unused3, unused4);
}

int __syscall_socket(int domain, int type, int protocol, int unused1,
                     int unused2, int unused3) {
  return __syscall_listen(domain, type, protocol, unused1, unused2, unused3);
}

int getaddrinfo(const char *node, const char *service,
                const void *hints, void **result) {
  (void)node;
  (void)service;
  (void)hints;
  if (result != NULL) *result = NULL;
  return -4; /* EAI_FAIL without importing a platform-specific netdb value. */
}

/*
 * This is the process target's serialized libc fallback.  Runtimes such as
 * CPython deliberately provide a stronger single-thread pthread facade of
 * their own; normal static-link symbol ownership must let that definition
 * replace the generic one without a runtime-specific linker exception.
 */
__attribute__((weak)) uintptr_t pthread_self(void) { return 1; }

int sysctlbyname(const char *name, void *old_value, size_t *old_size,
                 const void *new_value, size_t new_size) {
  (void)name;
  (void)old_value;
  (void)old_size;
  (void)new_value;
  (void)new_size;
  errno = ENOSYS;
  return -1;
}

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
  if (new_descriptor < 0 || old_descriptor == new_descriptor ||
      (flags & ~O_CLOEXEC) != 0) return -EINVAL;
  return duplicate_descriptor(old_descriptor, (uint32_t)new_descriptor);
}

static int fcntl_get_flags(int descriptor) {
  if (descriptor < 0) return -EBADF;
  const dolly_process_fd_request request = {(uint32_t)descriptor, 0};
  dolly_process_fd_flags response = {0};
  const int64_t result = dolly_process_call(
      DOLLY_PROCESS_FD_GET_FLAGS, &request, sizeof(request),
      &response, sizeof(response));
  if (result < 0) return (int)result;
  if ((uint64_t)result != sizeof(response) ||
      response.descriptor != (uint32_t)descriptor ||
      response.flags > INT_MAX) return -EIO;
  return (int)response.flags;
}

static int fcntl_set_flags(int descriptor, int flags) {
  if (descriptor < 0) return -EBADF;
  const dolly_process_fd_flags request = {
      (uint32_t)descriptor, (uint32_t)flags,
  };
  const int64_t result = dolly_process_call(
      DOLLY_PROCESS_FD_SET_FLAGS, &request, sizeof(request), NULL, 0);
  return result < 0 ? (int)result : result == 0 ? 0 : -EIO;
}

/*
 * Emscripten musl lowers ioctl() to this syscall veneer and passes a pointer
 * to the packed variadic argument.  Standalone Wasm otherwise contributes a
 * weak ENOSYS stub, which is observably wrong even for ordinary file opens:
 * POSIX runtimes commonly probe FIOCLEX before falling back to fcntl().
 *
 * Keep libc structures above the process ABI.  Dolly's machine contract only
 * carries semantic descriptor flags and its two terminal-discipline bits;
 * this adapter translates the target libc's ioctl numbers and layouts.
 */
static uintptr_t ioctl_argument(uintptr_t arguments) {
  uintptr_t argument = 0;
  if (arguments != 0) {
    memcpy(&argument, (const void *)arguments, sizeof(argument));
  }
  return argument;
}

int __syscall_ioctl(int descriptor, int request, uintptr_t arguments) {
  const uintptr_t argument = ioctl_argument(arguments);
  switch (request) {
    case FIOCLEX:
    case FIONCLEX: {
      /* Dolly spawn receives an explicit descriptor vector and has no ambient
       * exec inheritance.  Validate the descriptor, then accept these flags as
       * the same process-local compatibility no-op as F_SETFD. */
      const int flags = fcntl_get_flags(descriptor);
      return flags < 0 ? flags : 0;
    }
    case FIONBIO: {
      if (argument == 0) return -EFAULT;
      int enabled = 0;
      memcpy(&enabled, (const void *)argument, sizeof(enabled));
      int flags = fcntl_get_flags(descriptor);
      if (flags < 0) return flags;
      flags = enabled ? flags | O_NONBLOCK : flags & ~O_NONBLOCK;
      return fcntl_set_flags(descriptor, flags);
    }
    case TCGETS: {
      if (argument == 0) return -EFAULT;
      const int mode = dolly_terminal_mode_get(descriptor);
      if (mode < 0) return mode;
      struct termios attributes;
      memset(&attributes, 0, sizeof(attributes));
      attributes.c_iflag = ICRNL | IXON;
      attributes.c_oflag = OPOST | ONLCR;
      attributes.c_cflag = CS8 | CREAD;
      attributes.c_lflag = ISIG;
      if ((mode & DOLLY_TERMINAL_CANONICAL) != 0) {
        attributes.c_lflag |= ICANON;
      }
      if ((mode & DOLLY_TERMINAL_ECHO) != 0) {
        attributes.c_lflag |= ECHO | ECHOE | ECHOK;
      }
      attributes.c_cc[VINTR] = 3;
      attributes.c_cc[VQUIT] = 28;
      attributes.c_cc[VERASE] = 127;
      attributes.c_cc[VKILL] = 21;
      attributes.c_cc[VEOF] = 4;
      attributes.c_cc[VMIN] = 1;
      attributes.c_cc[VTIME] = 0;
      attributes.c_cc[VSTART] = 17;
      attributes.c_cc[VSTOP] = 19;
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
      uint32_t mode = 0;
      if ((attributes.c_lflag & ICANON) != 0) {
        mode |= DOLLY_TERMINAL_CANONICAL;
      }
      if ((attributes.c_lflag & ECHO) != 0) mode |= DOLLY_TERMINAL_ECHO;
      return dolly_terminal_mode_set(descriptor, mode);
    }
    case TIOCGWINSZ: {
      if (argument == 0) return -EFAULT;
      const int mode = dolly_terminal_mode_get(descriptor);
      if (mode < 0) return mode;
      struct winsize size;
      memset(&size, 0, sizeof(size));
      size.ws_row = (unsigned short)dolly_terminal_rows();
      size.ws_col = (unsigned short)dolly_terminal_columns();
      memcpy((void *)argument, &size, sizeof(size));
      return 0;
    }
    case TIOCSWINSZ: {
      const int mode = dolly_terminal_mode_get(descriptor);
      return mode < 0 ? mode : -EPERM;
    }
    default: {
      const int flags = fcntl_get_flags(descriptor);
      return flags < 0 ? flags : -ENOTTY;
    }
  }
}

/*
 * Emscripten's musl syscall veneer passes a pointer to its packed variadic
 * arguments. Keep fcntl policy process-shaped: descriptors are kernel-owned,
 * close-on-exec has no effect until exec replacement exists, and advisory
 * record locks succeed because Dolly has one cooperating userspace.
 */
int __syscall_fcntl64(int descriptor, int command, uintptr_t arguments) {
  int integer = 0;
  if (arguments != 0) memcpy(&integer, (const void *)arguments, sizeof(integer));
  switch (command) {
    case F_DUPFD:
    case F_DUPFD_CLOEXEC:
      if (arguments == 0 || integer < 0) return -EINVAL;
      return duplicate_descriptor_flags(
          descriptor, (uint32_t)integer, DOLLY_PROCESS_FD_DUP_MINIMUM);
    case F_GETFD:
      return 0;
    case F_SETFD:
      return arguments != 0 && (integer & ~FD_CLOEXEC) == 0 ? 0 : -EINVAL;
    case F_GETFL:
      return fcntl_get_flags(descriptor);
    case F_SETFL:
      return arguments == 0 ? -EINVAL : fcntl_set_flags(descriptor, integer);
    case F_GETLK: {
      uintptr_t pointer = 0;
      if (arguments != 0) {
        memcpy(&pointer, (const void *)arguments, sizeof(pointer));
      }
      if (pointer == 0) return -EFAULT;
      ((struct flock *)pointer)->l_type = F_UNLCK;
      return 0;
    }
    case F_SETLK:
    case F_SETLKW:
      return arguments == 0 ? -EFAULT : 0;
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
  if ((flags & ~known) != 0 || (flags & O_NONBLOCK) != 0) return -ENOTSUP;
  dolly_process_pipe_response response = {0};
  const int64_t result = dolly_process_call(
      DOLLY_PROCESS_FD_PIPE, NULL, 0, &response, sizeof(response));
  if (result < 0) return (int)result;
  if ((uint64_t)result != sizeof(response)) return -EIO;
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
