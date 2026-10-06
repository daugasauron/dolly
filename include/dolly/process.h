#ifndef DOLLY_PROCESS_H
#define DOLLY_PROCESS_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/*
 * The packet contract behind abi/dolly-process-0.wat. The ABI identity hashes
 * the exact bytes of this header, so any edit changes executable identity.
 * scripts/generate-abi-constants.mjs derives the JavaScript constants from
 * the same declarations.
 */
#define DOLLY_PROCESS_PACKET_LIMIT (1024u * 1024u)

/*
 * The only callable import of a Dolly process. Request and response packets
 * use fixed-width little-endian fields and contain offsets, never process or
 * kernel pointers. A non-negative result is the response size. A negative
 * result is a negated dolly_process_error.
 */
int64_t dolly_process_call(uint32_t operation,
                           const void *request, uint64_t request_size,
                           void *response, uint64_t response_capacity);

/* The error numbers of every operation, host modules' included. A libc maps
 * them to its errno; the build refuses a bootstrap libc whose numbers differ. */
enum dolly_process_error {
  DOLLY_PROCESS_E2BIG = 1,
  DOLLY_PROCESS_EACCES = 2,
  DOLLY_PROCESS_EADDRINUSE = 3,
  DOLLY_PROCESS_EADDRNOTAVAIL = 4,
  DOLLY_PROCESS_EAFNOSUPPORT = 5,
  DOLLY_PROCESS_EAGAIN = 6,
  DOLLY_PROCESS_EALREADY = 7,
  DOLLY_PROCESS_EBADF = 8,
  DOLLY_PROCESS_EBADMSG = 9,
  DOLLY_PROCESS_EBUSY = 10,
  DOLLY_PROCESS_ECANCELED = 11,
  DOLLY_PROCESS_ECHILD = 12,
  DOLLY_PROCESS_ECONNABORTED = 13,
  DOLLY_PROCESS_ECONNREFUSED = 14,
  DOLLY_PROCESS_ECONNRESET = 15,
  DOLLY_PROCESS_EDEADLK = 16,
  DOLLY_PROCESS_EDESTADDRREQ = 17,
  DOLLY_PROCESS_EDOM = 18,
  DOLLY_PROCESS_EDQUOT = 19,
  DOLLY_PROCESS_EEXIST = 20,
  DOLLY_PROCESS_EFAULT = 21,
  DOLLY_PROCESS_EFBIG = 22,
  DOLLY_PROCESS_EHOSTUNREACH = 23,
  DOLLY_PROCESS_EIDRM = 24,
  DOLLY_PROCESS_EILSEQ = 25,
  DOLLY_PROCESS_EINPROGRESS = 26,
  DOLLY_PROCESS_EINTR = 27,
  DOLLY_PROCESS_EINVAL = 28,
  DOLLY_PROCESS_EIO = 29,
  DOLLY_PROCESS_EISCONN = 30,
  DOLLY_PROCESS_EISDIR = 31,
  DOLLY_PROCESS_ELOOP = 32,
  DOLLY_PROCESS_EMFILE = 33,
  DOLLY_PROCESS_EMLINK = 34,
  DOLLY_PROCESS_EMSGSIZE = 35,
  DOLLY_PROCESS_EMULTIHOP = 36,
  DOLLY_PROCESS_ENAMETOOLONG = 37,
  DOLLY_PROCESS_ENETDOWN = 38,
  DOLLY_PROCESS_ENETRESET = 39,
  DOLLY_PROCESS_ENETUNREACH = 40,
  DOLLY_PROCESS_ENFILE = 41,
  DOLLY_PROCESS_ENOBUFS = 42,
  DOLLY_PROCESS_ENODEV = 43,
  DOLLY_PROCESS_ENOENT = 44,
  DOLLY_PROCESS_ENOEXEC = 45,
  DOLLY_PROCESS_ENOLCK = 46,
  DOLLY_PROCESS_ENOLINK = 47,
  DOLLY_PROCESS_ENOMEM = 48,
  DOLLY_PROCESS_ENOMSG = 49,
  DOLLY_PROCESS_ENOPROTOOPT = 50,
  DOLLY_PROCESS_ENOSPC = 51,
  DOLLY_PROCESS_ENOSYS = 52,
  DOLLY_PROCESS_ENOTCONN = 53,
  DOLLY_PROCESS_ENOTDIR = 54,
  DOLLY_PROCESS_ENOTEMPTY = 55,
  DOLLY_PROCESS_ENOTRECOVERABLE = 56,
  DOLLY_PROCESS_ENOTSOCK = 57,
  DOLLY_PROCESS_ENOTTY = 59,
  DOLLY_PROCESS_ENXIO = 60,
  DOLLY_PROCESS_EOVERFLOW = 61,
  DOLLY_PROCESS_EOWNERDEAD = 62,
  DOLLY_PROCESS_EPERM = 63,
  DOLLY_PROCESS_EPIPE = 64,
  DOLLY_PROCESS_EPROTO = 65,
  DOLLY_PROCESS_EPROTONOSUPPORT = 66,
  DOLLY_PROCESS_EPROTOTYPE = 67,
  DOLLY_PROCESS_ERANGE = 68,
  DOLLY_PROCESS_EROFS = 69,
  DOLLY_PROCESS_ESPIPE = 70,
  DOLLY_PROCESS_ESRCH = 71,
  DOLLY_PROCESS_ESTALE = 72,
  DOLLY_PROCESS_ETIMEDOUT = 73,
  DOLLY_PROCESS_ETXTBSY = 74,
  DOLLY_PROCESS_EXDEV = 75,
  DOLLY_PROCESS_ENODATA = 116,
  DOLLY_PROCESS_ENOTSUP = 138,
};

/* Host modules number their operations in their own contracts
 * (host/NAME/dolly-NAME-0.wat), never reusing a number below. */
enum dolly_process_operation {
  DOLLY_PROCESS_ARGUMENT_SIZES = 1,
  DOLLY_PROCESS_ARGUMENTS = 2,
  DOLLY_PROCESS_ENVIRONMENT_SIZES = 3,
  DOLLY_PROCESS_ENVIRONMENT = 4,
  DOLLY_PROCESS_EXIT = 5,

  DOLLY_PROCESS_FD_READ = 16,
  DOLLY_PROCESS_FD_WRITE = 17,
  DOLLY_PROCESS_FD_CLOSE = 18,
  DOLLY_PROCESS_FD_SEEK = 19,
  DOLLY_PROCESS_FD_STAT = 20,
  DOLLY_PROCESS_FD_SYNC = 21,
  DOLLY_PROCESS_FD_DUP = 22,
  DOLLY_PROCESS_FD_PIPE = 23,
  DOLLY_PROCESS_FD_READ_DIRECTORY = 24,
  DOLLY_PROCESS_FD_PREAD = 25,
  DOLLY_PROCESS_FD_TRUNCATE = 26,
  DOLLY_PROCESS_FD_STAT_FILESYSTEM = 27,
  DOLLY_PROCESS_FD_SET_TIMES = 28,
  DOLLY_PROCESS_FD_PWRITE = 29,
  DOLLY_PROCESS_FD_GET_FLAGS = 30,
  DOLLY_PROCESS_FD_SET_FLAGS = 31,

  DOLLY_PROCESS_PATH_OPEN = 32,
  DOLLY_PROCESS_PATH_STAT = 33,
  DOLLY_PROCESS_PATH_CREATE_DIRECTORY = 34,
  DOLLY_PROCESS_PATH_REMOVE = 35,
  DOLLY_PROCESS_PATH_RENAME = 36,
  DOLLY_PROCESS_PATH_LINK = 37,
  DOLLY_PROCESS_PATH_SYMLINK = 38,
  DOLLY_PROCESS_PATH_READLINK = 39,
  DOLLY_PROCESS_PATH_GET_CURRENT_DIRECTORY = 40,
  DOLLY_PROCESS_PATH_SET_CURRENT_DIRECTORY = 41,
  DOLLY_PROCESS_PATH_STAT_FILESYSTEM = 42,
  DOLLY_PROCESS_PATH_SET_TIMES = 43,

  DOLLY_PROCESS_CLOCK_TIME = 48,
  DOLLY_PROCESS_RANDOM = 49,
  DOLLY_PROCESS_TERMINAL = 50,
  DOLLY_PROCESS_CLOCK_RESOLUTION = 52,
  DOLLY_PROCESS_CLOCK_SLEEP = 53,
  DOLLY_PROCESS_FD_POLL = 54,
  DOLLY_PROCESS_FD_GET_DESCRIPTOR_FLAGS = 55,
  DOLLY_PROCESS_FD_SET_DESCRIPTOR_FLAGS = 56,

  DOLLY_PROCESS_SPAWN = 64,
  DOLLY_PROCESS_WAIT = 65,
  /* Empty -> i32 signal to handle now, or zero. A nonzero result must be
   * acknowledged; until then no further signal is reported. */
  DOLLY_PROCESS_INTERRUPT_POLL = 66,
  DOLLY_PROCESS_INFO = 67,
  DOLLY_PROCESS_SIGNAL = 68,
  /* Complete delivery after the userspace handler returns. i32 signal -> i32 pending. */
  DOLLY_PROCESS_SIGNAL_ACKNOWLEDGE = 69,
  /* dolly_process_alarm -> the previous dolly_process_alarm; an empty request
   * only reads the timer. */
  DOLLY_PROCESS_ALARM = 70,
  /* i32 1 while userspace handles or ignores SIGALRM, else 0 -> no response.
   * A due SIGALRM's default action ends even a process making no system call. */
  DOLLY_PROCESS_ALARM_HANDLED = 71,
};

enum dolly_process_spawn_flags {
  DOLLY_PROCESS_SPAWN_INHERIT_ENVIRONMENT = 1u << 0,
  DOLLY_PROCESS_SPAWN_FOREGROUND = 1u << 1,
  /* While the owner has active descendants, Ctrl-C sends SIGINT to them only. */
  DOLLY_PROCESS_SPAWN_INTERACTIVE = 1u << 2,
};

enum dolly_process_descriptor_inheritance {
  DOLLY_PROCESS_INHERIT_FDS_NONE = 0,
  DOLLY_PROCESS_INHERIT_FDS_STDIO = 1,
  DOLLY_PROCESS_INHERIT_FDS_ALL = 2,
};

enum dolly_process_descriptor_flags {
  DOLLY_PROCESS_FD_CLOEXEC = 1u << 0,
};

enum dolly_process_wait_flags {
  /* Return -EAGAIN until the child exits and its Worker is retired. */
  DOLLY_PROCESS_WAIT_NONBLOCK = 1u << 0,
};

/*
 * Signal numbers of EXIT, WAIT, SIGNAL and INTERRUPT_POLL packets; zero means
 * none. SIGNAL and signal termination accept DOLLY_PROCESS_SIGNAL_MASK.
 * INTERRUPT_POLL also reports the kernel-generated SIGCHLD.
 */
enum dolly_process_signal {
  DOLLY_PROCESS_SIGHUP = 1,
  DOLLY_PROCESS_SIGINT = 2,
  DOLLY_PROCESS_SIGQUIT = 3,
  DOLLY_PROCESS_SIGABRT = 6,
  DOLLY_PROCESS_SIGKILL = 9,
  DOLLY_PROCESS_SIGPIPE = 13,
  DOLLY_PROCESS_SIGALRM = 14,
  DOLLY_PROCESS_SIGTERM = 15,
  DOLLY_PROCESS_SIGCHLD = 17,
  DOLLY_PROCESS_SIGWINCH = 28,
};
#define DOLLY_PROCESS_SIGNAL_MASK                                          \
  (1u << DOLLY_PROCESS_SIGHUP | 1u << DOLLY_PROCESS_SIGINT |              \
   1u << DOLLY_PROCESS_SIGQUIT | 1u << DOLLY_PROCESS_SIGABRT |            \
   1u << DOLLY_PROCESS_SIGKILL | 1u << DOLLY_PROCESS_SIGPIPE |            \
   1u << DOLLY_PROCESS_SIGALRM | 1u << DOLLY_PROCESS_SIGTERM |            \
   1u << DOLLY_PROCESS_SIGWINCH)

enum dolly_process_fd_dup_flags {
  /* target_descriptor is an inclusive lower bound instead of an exact fd. */
  DOLLY_PROCESS_FD_DUP_MINIMUM = 1u << 0,
  DOLLY_PROCESS_FD_DUP_CLOEXEC = 1u << 1,
};

/* FD_GET_FLAGS reports these open-description status bits. FD_SET_FLAGS
 * replaces APPEND and NONBLOCK; the access-mode bits are read-only. */
enum dolly_process_fd_status_flags {
  DOLLY_PROCESS_FD_STATUS_READ = 1u << 0,
  DOLLY_PROCESS_FD_STATUS_WRITE = 1u << 1,
  DOLLY_PROCESS_FD_STATUS_APPEND = 1u << 2,
  DOLLY_PROCESS_FD_STATUS_NONBLOCK = 1u << 3,
};

enum dolly_process_seek_whence {
  DOLLY_PROCESS_SEEK_SET = 0,
  DOLLY_PROCESS_SEEK_CURRENT = 1,
  DOLLY_PROCESS_SEEK_END = 2,
};

/* Clock identifiers of CLOCK_TIME, CLOCK_RESOLUTION and CLOCK_SLEEP. */
enum dolly_process_clock {
  DOLLY_PROCESS_CLOCK_REALTIME = 0,
  DOLLY_PROCESS_CLOCK_MONOTONIC = 1,
};

enum dolly_process_open_flags {
  DOLLY_PROCESS_OPEN_READ = 1u << 0,
  DOLLY_PROCESS_OPEN_WRITE = 1u << 1,
  DOLLY_PROCESS_OPEN_CREATE = 1u << 2,
  DOLLY_PROCESS_OPEN_EXCLUSIVE = 1u << 3,
  DOLLY_PROCESS_OPEN_TRUNCATE = 1u << 4,
  DOLLY_PROCESS_OPEN_APPEND = 1u << 5,
  DOLLY_PROCESS_OPEN_DIRECTORY = 1u << 6,
  DOLLY_PROCESS_OPEN_NOFOLLOW = 1u << 7,
  DOLLY_PROCESS_OPEN_CLOEXEC = 1u << 8,
};

enum dolly_process_path_flags {
  DOLLY_PROCESS_PATH_DIRECTORY = 1u << 0,
  DOLLY_PROCESS_PATH_NOFOLLOW = 1u << 1,
};

enum dolly_process_timestamp_flags {
  DOLLY_PROCESS_TIME_NOW = 1u << 0,
  DOLLY_PROCESS_TIME_OMIT = 1u << 1,
};

enum dolly_process_file_type {
  DOLLY_PROCESS_FILE_UNKNOWN = 0,
  DOLLY_PROCESS_FILE_REGULAR = 1,
  DOLLY_PROCESS_FILE_DIRECTORY = 2,
  DOLLY_PROCESS_FILE_SYMBOLIC_LINK = 3,
  DOLLY_PROCESS_FILE_CHARACTER_DEVICE = 4,
  DOLLY_PROCESS_FILE_BLOCK_DEVICE = 5,
  DOLLY_PROCESS_FILE_FIFO = 6,
  DOLLY_PROCESS_FILE_SOCKET = 7,
};

enum dolly_process_poll_event {
  DOLLY_PROCESS_POLL_READ = 1u << 0,
  DOLLY_PROCESS_POLL_WRITE = 1u << 1,
  DOLLY_PROCESS_POLL_PRIORITY = 1u << 2,
  DOLLY_PROCESS_POLL_ERROR = 1u << 3,
  DOLLY_PROCESS_POLL_HANGUP = 1u << 4,
  DOLLY_PROCESS_POLL_INVALID = 1u << 5,
};

#define DOLLY_PROCESS_POLL_IGNORED_DESCRIPTOR UINT32_MAX

enum dolly_process_terminal_operation {
  DOLLY_PROCESS_TERMINAL_READ = 1,
  DOLLY_PROCESS_TERMINAL_ISATTY = 2,
  DOLLY_PROCESS_TERMINAL_MODE_GET = 3,
  DOLLY_PROCESS_TERMINAL_MODE_SET = 4,
  DOLLY_PROCESS_TERMINAL_SIZE = 5,
  DOLLY_PROCESS_TERMINAL_PUBLISH_RESULT = 6,
};

typedef struct {
  uint32_t count;
  uint32_t reserved;
  uint64_t bytes;
} dolly_process_vector_sizes;

typedef struct {
  uint32_t status;
  /* Zero for normal exit, otherwise a DOLLY_PROCESS_SIG* value. A signalled
   * exit has status=128+signal_number, never inferred from status. */
  uint32_t signal_number;
} dolly_process_exit_request;

typedef struct {
  uint32_t descriptor;
  uint32_t reserved;
  uint64_t size;
} dolly_process_fd_io_request;

typedef struct {
  uint32_t descriptor;
  uint32_t reserved;
  uint64_t offset;
  uint64_t size;
} dolly_process_fd_pread_request;

typedef struct {
  uint32_t descriptor;
  uint32_t reserved;
  uint64_t size;
} dolly_process_fd_truncate_request;

typedef struct {
  uint32_t descriptor;
  uint32_t reserved;
} dolly_process_fd_request;

typedef struct {
  int64_t seconds;
  uint32_t nanoseconds;
  uint32_t flags;
} dolly_process_timestamp;

typedef struct {
  uint32_t descriptor;
  uint32_t reserved;
  dolly_process_timestamp access;
  dolly_process_timestamp modification;
} dolly_process_fd_times_request;

typedef struct {
  uint64_t size;
} dolly_process_io_result;

typedef struct {
  uint32_t source_descriptor;
  uint32_t target_descriptor;
  uint32_t flags;
  uint32_t reserved;
} dolly_process_fd_dup_request;

typedef struct {
  uint32_t descriptor;
  uint32_t reserved;
} dolly_process_fd_dup_response;

typedef struct {
  uint32_t descriptor;
  uint32_t flags;
} dolly_process_fd_flags;

typedef struct {
  uint32_t flags;
  uint32_t reserved;
} dolly_process_pipe_request;

typedef struct {
  uint32_t read_descriptor;
  uint32_t write_descriptor;
} dolly_process_pipe_response;

/*
 * The request header is followed by `count` query records. The response
 * header is followed by the same number of result records in the same order.
 * A zero deadline is nonblocking; UINT64_MAX waits without a time limit.
 * Negative POSIX poll descriptors are encoded as the ignored descriptor.
 */
typedef struct {
  uint64_t deadline_nanoseconds;
  uint32_t count;
  uint32_t reserved;
} dolly_process_poll_request;

typedef struct {
  uint32_t descriptor;
  uint16_t events;
  uint16_t reserved;
} dolly_process_poll_query;

typedef struct {
  uint32_t ready;
  uint32_t count;
  uint64_t reserved;
} dolly_process_poll_response;

typedef struct {
  uint16_t events;
  uint16_t reserved;
  uint32_t reserved2;
} dolly_process_poll_result;

typedef struct {
  uint32_t descriptor;
  uint32_t maximum_entries;
  uint64_t cookie;
  uint64_t reserved;
} dolly_process_directory_request;

typedef struct {
  uint64_t inode;
  uint64_t next_cookie;
  uint32_t file_type;
  uint32_t name_size;
  /* name bytes follow; they are not NUL terminated */
} dolly_process_directory_entry;

typedef struct {
  uint32_t descriptor;
  uint32_t whence;
  int64_t offset;
} dolly_process_fd_seek_request;

typedef struct {
  uint64_t offset;
} dolly_process_fd_seek_response;

typedef struct {
  uint32_t clock_id;
  uint32_t reserved;
  uint64_t precision_nanoseconds;
} dolly_process_clock_request;

typedef struct {
  uint64_t nanoseconds;
} dolly_process_clock_response;

typedef struct {
  uint32_t clock_id;
  uint32_t flags;
  uint64_t deadline_nanoseconds;
} dolly_process_clock_sleep_request;

/*
 * The header is followed by path_size raw path bytes, argument_bytes bytes
 * containing exactly argument_count NUL-terminated strings, then
 * environment_bytes bytes containing environment_count NUL-terminated
 * NAME=value strings, then cwd_size raw bytes for an absolute working directory,
 * then mapping_count dolly_process_fd_mapping records (possibly unaligned).
 * Zero cwd_size inherits the parent's cwd without mutating it. An inherited
 * environment has zero count/bytes. Descriptor inheritance copies only open
 * non-CLOEXEC descriptors. Explicit mappings override inherited targets and
 * clear child CLOEXEC; all sources refer to the parent, even for swaps.
 * Mapping targets must be unique. Root spawns use NONE and explicit mappings.
 */
typedef struct {
  uint32_t source_descriptor;
  uint32_t target_descriptor;
} dolly_process_fd_mapping;

typedef struct {
  uint32_t flags;
  uint32_t argument_count;
  uint32_t environment_count;
  uint32_t cwd_size;
  uint32_t mapping_count;
  uint32_t descriptor_inheritance;
  uint32_t reserved;
  uint32_t path_size;
  uint64_t argument_bytes;
  uint64_t environment_bytes;
  /* Absolute monotonic time at most 24 hours after the SPAWN call (EINVAL
   * otherwise), or UINT64_MAX when no deadline is active. */
  uint64_t deadline_nanoseconds;
} dolly_process_spawn_request;

typedef struct {
  uint32_t pid;
  uint32_t reserved;
} dolly_process_spawn_response;

/* A positive child PID, or zero for any child. */
typedef struct {
  uint32_t pid;
  uint32_t flags;
} dolly_process_wait_request;

/* The reaped child and its status; see dolly_process_exit_request. */
typedef struct {
  uint32_t pid;
  uint32_t status;
  uint32_t signal_number;
  uint32_t reserved;
} dolly_process_wait_response;

typedef struct {
  uint32_t pid;
  uint32_t parent_pid;
} dolly_process_info_response;

/* Positive PID only; signal 0 checks existence, otherwise a DOLLY_PROCESS_SIG*
 * value. On success the kernel echoes this packet for supervisor delivery. */
typedef struct {
  uint32_t pid;
  uint32_t signal_number;
} dolly_process_signal_request;

/* The ITIMER_REAL timer: SIGALRM after value_nanoseconds of monotonic time
 * (zero disarms), then every interval_nanoseconds unless that is zero. */
typedef struct {
  uint64_t value_nanoseconds;
  uint64_t interval_nanoseconds;
} dolly_process_alarm;

typedef struct {
  uint32_t operation;
  uint32_t descriptor;
  uint32_t flags;
  uint32_t reserved;
  uint64_t deadline_nanoseconds;
} dolly_process_terminal_request;

typedef struct {
  int64_t value;
  uint32_t columns;
  uint32_t rows;
} dolly_process_terminal_response;

typedef struct {
  uint32_t directory_descriptor;
  uint32_t flags;
  uint32_t reserved;
  uint32_t path_size;
  /* path bytes follow; they are not NUL terminated */
} dolly_process_path_request;

typedef struct {
  uint32_t directory_descriptor;
  uint32_t flags;
  uint32_t reserved;
  uint32_t path_size;
  dolly_process_timestamp access;
  dolly_process_timestamp modification;
  /* path bytes follow; they are not NUL terminated */
} dolly_process_path_times_request;

typedef struct {
  uint32_t descriptor;
  uint32_t reserved;
} dolly_process_path_open_response;

typedef struct {
  uint64_t device;
  uint64_t inode;
  uint64_t size;
  uint64_t access_nanoseconds;
  uint64_t modification_nanoseconds;
  uint64_t change_nanoseconds;
  uint64_t blocks;
  /* Fixed compatibility bits (at most 07777) that nothing changes: one user,
   * no permission model. file_type carries the file type. */
  uint32_t mode;
  uint32_t link_count;
  uint32_t user;
  uint32_t group;
  uint32_t block_size;
  uint32_t file_type;
  uint32_t reserved[2];
} dolly_process_stat_response;

/*
 * Filesystem capacity is deliberately descriptive rather than a permission
 * surface. Version 0 reports coherent virtual filesystem values; it does not
 * expose browser storage, quota, mount, or device information.
 */
typedef struct {
  uint64_t type;
  uint64_t block_size;
  uint64_t blocks;
  uint64_t blocks_free;
  uint64_t blocks_available;
  uint64_t files;
  uint64_t files_free;
  uint64_t maximum_name_length;
  uint64_t fragment_size;
  uint64_t flags;
  uint32_t filesystem_id[2];
  uint64_t reserved;
} dolly_process_filesystem_stat_response;

typedef struct {
  uint32_t old_directory_descriptor;
  uint32_t new_directory_descriptor;
  uint32_t old_path_size;
  uint32_t new_path_size;
  /* old path bytes, then new path bytes */
} dolly_process_two_path_request;

#ifdef __cplusplus
#define DOLLY_PROCESS_LAYOUT(type, size) static_assert(sizeof(type) == size, #type)
#else
#define DOLLY_PROCESS_LAYOUT(type, size) _Static_assert(sizeof(type) == size, #type)
#endif
DOLLY_PROCESS_LAYOUT(dolly_process_vector_sizes, 16);
DOLLY_PROCESS_LAYOUT(dolly_process_fd_io_request, 16);
DOLLY_PROCESS_LAYOUT(dolly_process_fd_pread_request, 24);
DOLLY_PROCESS_LAYOUT(dolly_process_fd_truncate_request, 16);
DOLLY_PROCESS_LAYOUT(dolly_process_fd_request, 8);
DOLLY_PROCESS_LAYOUT(dolly_process_timestamp, 16);
DOLLY_PROCESS_LAYOUT(dolly_process_fd_times_request, 40);
DOLLY_PROCESS_LAYOUT(dolly_process_fd_dup_request, 16);
DOLLY_PROCESS_LAYOUT(dolly_process_fd_flags, 8);
DOLLY_PROCESS_LAYOUT(dolly_process_poll_request, 16);
DOLLY_PROCESS_LAYOUT(dolly_process_poll_query, 8);
DOLLY_PROCESS_LAYOUT(dolly_process_poll_response, 16);
DOLLY_PROCESS_LAYOUT(dolly_process_poll_result, 8);
DOLLY_PROCESS_LAYOUT(dolly_process_directory_entry, 24);
DOLLY_PROCESS_LAYOUT(dolly_process_directory_request, 24);
DOLLY_PROCESS_LAYOUT(dolly_process_stat_response, 88);
DOLLY_PROCESS_LAYOUT(dolly_process_filesystem_stat_response, 96);
DOLLY_PROCESS_LAYOUT(dolly_process_spawn_request, 56);
DOLLY_PROCESS_LAYOUT(dolly_process_fd_mapping, 8);
DOLLY_PROCESS_LAYOUT(dolly_process_pipe_request, 8);
DOLLY_PROCESS_LAYOUT(dolly_process_two_path_request, 16);
DOLLY_PROCESS_LAYOUT(dolly_process_path_times_request, 48);
DOLLY_PROCESS_LAYOUT(dolly_process_terminal_request, 24);
DOLLY_PROCESS_LAYOUT(dolly_process_terminal_response, 16);
DOLLY_PROCESS_LAYOUT(dolly_process_clock_sleep_request, 16);
DOLLY_PROCESS_LAYOUT(dolly_process_exit_request, 8);
DOLLY_PROCESS_LAYOUT(dolly_process_wait_request, 8);
DOLLY_PROCESS_LAYOUT(dolly_process_wait_response, 16);
DOLLY_PROCESS_LAYOUT(dolly_process_signal_request, 8);
DOLLY_PROCESS_LAYOUT(dolly_process_alarm, 16);
DOLLY_PROCESS_LAYOUT(dolly_process_fd_seek_request, 16);
DOLLY_PROCESS_LAYOUT(dolly_process_clock_request, 16);
DOLLY_PROCESS_LAYOUT(dolly_process_path_request, 16);
#undef DOLLY_PROCESS_LAYOUT

#ifdef __cplusplus
}
#endif

#endif
