// Generated from include/dolly/process.h.
export const DOLLY_PROCESS_PACKET_LIMIT = 1048576;
export const DOLLY_PROCESS_ARGUMENT_SIZES = 1;
export const DOLLY_PROCESS_ARGUMENTS = 2;
export const DOLLY_PROCESS_ENVIRONMENT_SIZES = 3;
export const DOLLY_PROCESS_ENVIRONMENT = 4;
export const DOLLY_PROCESS_EXIT = 5;
export const DOLLY_PROCESS_FD_READ = 16;
export const DOLLY_PROCESS_FD_WRITE = 17;
export const DOLLY_PROCESS_FD_CLOSE = 18;
export const DOLLY_PROCESS_FD_SEEK = 19;
export const DOLLY_PROCESS_FD_STAT = 20;
export const DOLLY_PROCESS_FD_SYNC = 21;
export const DOLLY_PROCESS_FD_DUP = 22;
export const DOLLY_PROCESS_FD_PIPE = 23;
export const DOLLY_PROCESS_FD_READ_DIRECTORY = 24;
export const DOLLY_PROCESS_FD_PREAD = 25;
export const DOLLY_PROCESS_FD_TRUNCATE = 26;
export const DOLLY_PROCESS_FD_STAT_FILESYSTEM = 27;
export const DOLLY_PROCESS_FD_SET_TIMES = 28;
export const DOLLY_PROCESS_FD_PWRITE = 29;
export const DOLLY_PROCESS_FD_GET_FLAGS = 30;
export const DOLLY_PROCESS_FD_SET_FLAGS = 31;
export const DOLLY_PROCESS_PATH_OPEN = 32;
export const DOLLY_PROCESS_PATH_STAT = 33;
export const DOLLY_PROCESS_PATH_CREATE_DIRECTORY = 34;
export const DOLLY_PROCESS_PATH_REMOVE = 35;
export const DOLLY_PROCESS_PATH_RENAME = 36;
export const DOLLY_PROCESS_PATH_LINK = 37;
export const DOLLY_PROCESS_PATH_SYMLINK = 38;
export const DOLLY_PROCESS_PATH_READLINK = 39;
export const DOLLY_PROCESS_PATH_GET_CURRENT_DIRECTORY = 40;
export const DOLLY_PROCESS_PATH_SET_CURRENT_DIRECTORY = 41;
export const DOLLY_PROCESS_PATH_STAT_FILESYSTEM = 42;
export const DOLLY_PROCESS_PATH_SET_TIMES = 43;
export const DOLLY_PROCESS_CLOCK_TIME = 48;
export const DOLLY_PROCESS_RANDOM = 49;
export const DOLLY_PROCESS_TERMINAL = 50;
export const DOLLY_PROCESS_CLOCK_RESOLUTION = 52;
export const DOLLY_PROCESS_CLOCK_SLEEP = 53;
export const DOLLY_PROCESS_FD_POLL = 54;
export const DOLLY_PROCESS_FD_GET_DESCRIPTOR_FLAGS = 55;
export const DOLLY_PROCESS_FD_SET_DESCRIPTOR_FLAGS = 56;
export const DOLLY_PROCESS_FD_LOCK = 59;
export const DOLLY_PROCESS_SPAWN = 64;
export const DOLLY_PROCESS_WAIT = 65;
export const DOLLY_PROCESS_INTERRUPT_POLL = 66;
export const DOLLY_PROCESS_INFO = 67;
export const DOLLY_PROCESS_SIGNAL = 68;
export const DOLLY_PROCESS_SIGNAL_ACKNOWLEDGE = 69;
export const DOLLY_PROCESS_ALARM = 70;
export const DOLLY_PROCESS_ALARM_HANDLED = 71;
export const DOLLY_PROCESS_SPAWN_INHERIT_ENVIRONMENT = 1;
export const DOLLY_PROCESS_SPAWN_FOREGROUND = 2;
export const DOLLY_PROCESS_SPAWN_INTERACTIVE = 4;
export const DOLLY_PROCESS_INHERIT_FDS_NONE = 0;
export const DOLLY_PROCESS_INHERIT_FDS_STDIO = 1;
export const DOLLY_PROCESS_INHERIT_FDS_ALL = 2;
export const DOLLY_PROCESS_FD_CLOEXEC = 1;
export const DOLLY_PROCESS_FD_KEEP_LOCKS = 2;
export const DOLLY_PROCESS_WAIT_NONBLOCK = 1;
export const DOLLY_PROCESS_SIGHUP = 1;
export const DOLLY_PROCESS_SIGINT = 2;
export const DOLLY_PROCESS_SIGQUIT = 3;
export const DOLLY_PROCESS_SIGABRT = 6;
export const DOLLY_PROCESS_SIGKILL = 9;
export const DOLLY_PROCESS_SIGPIPE = 13;
export const DOLLY_PROCESS_SIGALRM = 14;
export const DOLLY_PROCESS_SIGTERM = 15;
export const DOLLY_PROCESS_SIGCHLD = 17;
export const DOLLY_PROCESS_SIGWINCH = 28;
export const DOLLY_PROCESS_SIGNAL_MASK = 268493390;
export const DOLLY_PROCESS_FD_DUP_MINIMUM = 1;
export const DOLLY_PROCESS_FD_DUP_CLOEXEC = 2;
export const DOLLY_PROCESS_FD_STATUS_READ = 1;
export const DOLLY_PROCESS_FD_STATUS_WRITE = 2;
export const DOLLY_PROCESS_FD_STATUS_APPEND = 4;
export const DOLLY_PROCESS_FD_STATUS_NONBLOCK = 8;
export const DOLLY_PROCESS_SEEK_SET = 0;
export const DOLLY_PROCESS_SEEK_CURRENT = 1;
export const DOLLY_PROCESS_SEEK_END = 2;
export const DOLLY_PROCESS_CLOCK_REALTIME = 0;
export const DOLLY_PROCESS_CLOCK_MONOTONIC = 1;
export const DOLLY_PROCESS_OPEN_READ = 1;
export const DOLLY_PROCESS_OPEN_WRITE = 2;
export const DOLLY_PROCESS_OPEN_CREATE = 4;
export const DOLLY_PROCESS_OPEN_EXCLUSIVE = 8;
export const DOLLY_PROCESS_OPEN_TRUNCATE = 16;
export const DOLLY_PROCESS_OPEN_APPEND = 32;
export const DOLLY_PROCESS_OPEN_DIRECTORY = 64;
export const DOLLY_PROCESS_OPEN_NOFOLLOW = 128;
export const DOLLY_PROCESS_OPEN_CLOEXEC = 256;
export const DOLLY_PROCESS_PATH_DIRECTORY = 1;
export const DOLLY_PROCESS_PATH_NOFOLLOW = 2;
export const DOLLY_PROCESS_TIME_NOW = 1;
export const DOLLY_PROCESS_TIME_OMIT = 2;
export const DOLLY_PROCESS_FILE_UNKNOWN = 0;
export const DOLLY_PROCESS_FILE_REGULAR = 1;
export const DOLLY_PROCESS_FILE_DIRECTORY = 2;
export const DOLLY_PROCESS_FILE_SYMBOLIC_LINK = 3;
export const DOLLY_PROCESS_FILE_CHARACTER_DEVICE = 4;
export const DOLLY_PROCESS_FILE_BLOCK_DEVICE = 5;
export const DOLLY_PROCESS_FILE_FIFO = 6;
export const DOLLY_PROCESS_FILE_SOCKET = 7;
export const DOLLY_PROCESS_POLL_READ = 1;
export const DOLLY_PROCESS_POLL_WRITE = 2;
export const DOLLY_PROCESS_POLL_PRIORITY = 4;
export const DOLLY_PROCESS_POLL_ERROR = 8;
export const DOLLY_PROCESS_POLL_HANGUP = 16;
export const DOLLY_PROCESS_POLL_INVALID = 32;
export const DOLLY_PROCESS_POLL_IGNORED_DESCRIPTOR = 4294967295;
export const DOLLY_PROCESS_TERMINAL_READ = 1;
export const DOLLY_PROCESS_TERMINAL_ISATTY = 2;
export const DOLLY_PROCESS_TERMINAL_MODE_GET = 3;
export const DOLLY_PROCESS_TERMINAL_MODE_SET = 4;
export const DOLLY_PROCESS_TERMINAL_SIZE = 5;
export const DOLLY_PROCESS_TERMINAL_PUBLISH_RESULT = 6;
export const DOLLY_PROCESS_LOCK_SHARED = 0;
export const DOLLY_PROCESS_LOCK_EXCLUSIVE = 1;
export const DOLLY_PROCESS_LOCK_UNLOCK = 2;
export const DOLLY_PROCESS_LOCK_DESCRIPTION = 1;
export const DOLLY_PROCESS_LOCK_WAIT = 2;
export const DOLLY_PROCESS_LOCK_TEST = 4;
export const DOLLY_ERRNO = Object.freeze({
  E2BIG: 1,
  EACCES: 2,
  EADDRINUSE: 3,
  EADDRNOTAVAIL: 4,
  EAFNOSUPPORT: 5,
  EAGAIN: 6,
  EALREADY: 7,
  EBADF: 8,
  EBADMSG: 9,
  EBUSY: 10,
  ECANCELED: 11,
  ECHILD: 12,
  ECONNABORTED: 13,
  ECONNREFUSED: 14,
  ECONNRESET: 15,
  EDEADLK: 16,
  EDESTADDRREQ: 17,
  EDOM: 18,
  EDQUOT: 19,
  EEXIST: 20,
  EFAULT: 21,
  EFBIG: 22,
  EHOSTUNREACH: 23,
  EIDRM: 24,
  EILSEQ: 25,
  EINPROGRESS: 26,
  EINTR: 27,
  EINVAL: 28,
  EIO: 29,
  EISCONN: 30,
  EISDIR: 31,
  ELOOP: 32,
  EMFILE: 33,
  EMLINK: 34,
  EMSGSIZE: 35,
  EMULTIHOP: 36,
  ENAMETOOLONG: 37,
  ENETDOWN: 38,
  ENETRESET: 39,
  ENETUNREACH: 40,
  ENFILE: 41,
  ENOBUFS: 42,
  ENODEV: 43,
  ENOENT: 44,
  ENOEXEC: 45,
  ENOLCK: 46,
  ENOLINK: 47,
  ENOMEM: 48,
  ENOMSG: 49,
  ENOPROTOOPT: 50,
  ENOSPC: 51,
  ENOSYS: 52,
  ENOTCONN: 53,
  ENOTDIR: 54,
  ENOTEMPTY: 55,
  ENOTRECOVERABLE: 56,
  ENOTSOCK: 57,
  ENOTTY: 59,
  ENXIO: 60,
  EOVERFLOW: 61,
  EOWNERDEAD: 62,
  EPERM: 63,
  EPIPE: 64,
  EPROTO: 65,
  EPROTONOSUPPORT: 66,
  EPROTOTYPE: 67,
  ERANGE: 68,
  EROFS: 69,
  ESPIPE: 70,
  ESRCH: 71,
  ESTALE: 72,
  ETIMEDOUT: 73,
  ETXTBSY: 74,
  EXDEV: 75,
  ENODATA: 116,
  ENOTSUP: 138,
});
export const DOLLY_PROCESS_SIZEOF = Object.freeze({
  dolly_process_vector_sizes: 16,
  dolly_process_fd_io_request: 16,
  dolly_process_fd_pread_request: 24,
  dolly_process_fd_truncate_request: 16,
  dolly_process_fd_request: 8,
  dolly_process_timestamp: 16,
  dolly_process_fd_times_request: 40,
  dolly_process_fd_dup_request: 16,
  dolly_process_fd_flags: 8,
  dolly_process_fd_lock_request: 32,
  dolly_process_fd_lock_response: 24,
  dolly_process_poll_request: 16,
  dolly_process_poll_query: 8,
  dolly_process_poll_response: 16,
  dolly_process_poll_result: 8,
  dolly_process_directory_entry: 24,
  dolly_process_directory_request: 24,
  dolly_process_stat_response: 88,
  dolly_process_filesystem_stat_response: 96,
  dolly_process_spawn_request: 56,
  dolly_process_fd_mapping: 8,
  dolly_process_pipe_request: 8,
  dolly_process_two_path_request: 16,
  dolly_process_path_times_request: 48,
  dolly_process_terminal_request: 24,
  dolly_process_terminal_response: 16,
  dolly_process_clock_sleep_request: 16,
  dolly_process_exit_request: 8,
  dolly_process_wait_request: 8,
  dolly_process_wait_response: 16,
  dolly_process_signal_request: 8,
  dolly_process_alarm: 16,
  dolly_process_fd_seek_request: 16,
  dolly_process_clock_request: 16,
  dolly_process_path_request: 16,
});
