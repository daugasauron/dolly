#ifndef DOLLY_PROCESS_H
#define DOLLY_PROCESS_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define DOLLY_PROCESS_ABI_VERSION 0u
#define DOLLY_PROCESS_PACKET_LIMIT (1024u * 1024u)
#define DOLLY_PROCESS_DSO_LIMIT (512u * 1024u * 1024u)
#define DOLLY_PROCESS_DSO_ERROR_CAPACITY 240u

/*
 * The only callable import of a Dolly process. Request and response packets
 * use fixed-width little-endian fields and contain offsets, never process or
 * kernel pointers. A non-negative result is the response size. A negative
 * result is a negated POSIX errno value.
 */
__attribute__((import_module("dolly_process_0"), import_name("call")))
int64_t dolly_process_call(uint32_t operation,
                           const void *request, uint64_t request_size,
                           void *response, uint64_t response_capacity);

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
  DOLLY_PROCESS_DOWNLOAD_FILE = 51,
  DOLLY_PROCESS_CLOCK_RESOLUTION = 52,
  DOLLY_PROCESS_CLOCK_SLEEP = 53,
  DOLLY_PROCESS_FD_POLL = 54,

  DOLLY_PROCESS_SPAWN = 64,
  DOLLY_PROCESS_WAIT = 65,
  DOLLY_PROCESS_INTERRUPT_POLL = 66,

  DOLLY_PROCESS_HTTP_START = 80,
  DOLLY_PROCESS_HTTP_POLL = 81,
  DOLLY_PROCESS_HTTP_CANCEL = 82,

  DOLLY_PROCESS_DISPLAY_ACQUIRE = 96,
  DOLLY_PROCESS_DISPLAY_SET_SIZE = 97,
  DOLLY_PROCESS_DISPLAY_BEGIN_FRAME = 98,
  DOLLY_PROCESS_DISPLAY_WRITE_FRAME = 99,
  DOLLY_PROCESS_DISPLAY_PRESENT = 100,
  DOLLY_PROCESS_DISPLAY_WAIT_FRAME = 101,
  DOLLY_PROCESS_DISPLAY_SET_CURSOR = 102,
  DOLLY_PROCESS_DISPLAY_NEXT_EVENT = 103,
  DOLLY_PROCESS_DISPLAY_RELEASE = 104,

  DOLLY_PROCESS_DSO_OPEN = 112,
  DOLLY_PROCESS_DSO_SYMBOL = 113,
  DOLLY_PROCESS_DSO_CLOSE = 114,

  /* Typed indirect calls and callbacks stay inside this process Worker. */
  DOLLY_PROCESS_FFI_CALL = 120,
  DOLLY_PROCESS_FFI_CLOSURE_ALLOC = 121,
  DOLLY_PROCESS_FFI_CLOSURE_FREE = 122,
  DOLLY_PROCESS_FFI_CLOSURE_PREP = 123,
};

enum dolly_process_spawn_flags {
  DOLLY_PROCESS_SPAWN_INHERIT_ENVIRONMENT = 1u << 0,
};

enum dolly_process_fd_dup_flags {
  /* target_descriptor is an inclusive lower bound instead of an exact fd. */
  DOLLY_PROCESS_FD_DUP_MINIMUM = 1u << 0,
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
};

enum dolly_process_path_flags {
  DOLLY_PROCESS_PATH_DIRECTORY = 1u << 0,
  DOLLY_PROCESS_PATH_NOFOLLOW = 1u << 1,
};

enum dolly_process_timestamp_flags {
  DOLLY_PROCESS_TIME_NOW = 1u << 0,
  DOLLY_PROCESS_TIME_OMIT = 1u << 1,
};

enum dolly_process_dso_flags {
  DOLLY_PROCESS_DSO_GLOBAL = 1u << 0,
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
  uint32_t reserved;
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
 * NAME=value strings. An inherited environment has zero count/bytes.
 */
typedef struct {
  uint32_t flags;
  uint32_t argument_count;
  uint32_t environment_count;
  uint32_t reserved;
  uint32_t stdin_descriptor;
  uint32_t stdout_descriptor;
  uint32_t stderr_descriptor;
  uint32_t path_size;
  uint64_t argument_bytes;
  uint64_t environment_bytes;
  /* Absolute monotonic time, or UINT64_MAX when no deadline is active. */
  uint64_t deadline_nanoseconds;
} dolly_process_spawn_request;

typedef struct {
  uint32_t pid;
  uint32_t reserved;
} dolly_process_spawn_response;

typedef struct {
  uint32_t pid;
  uint32_t flags;
} dolly_process_wait_request;

typedef struct {
  uint32_t status;
  uint32_t reserved;
} dolly_process_wait_response;

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

/*
 * HTTP requests remain byte-oriented at the process boundary. Strings are
 * UTF-8 byte sequences without trailing NULs in the packet; the kernel owns
 * conversion to the browser broker's existing NUL-terminated API. The body
 * follows the three strings.
 */
typedef struct {
  uint32_t flags;
  uint32_t method_size;
  uint32_t url_size;
  uint32_t headers_size;
  uint64_t body_size;
} dolly_process_http_start_request;

typedef struct {
  uint32_t sequence;
  uint32_t reserved;
} dolly_process_http_start_response;

typedef struct {
  uint32_t sequence;
  uint32_t reserved;
} dolly_process_http_poll_request;

/* `length` bytes immediately follow this header when ready is nonzero. */
typedef struct {
  uint32_t ready;
  uint32_t status;
  uint32_t kind;
  uint32_t error;
  uint32_t eof;
  uint32_t reserved;
  uint64_t length;
} dolly_process_http_poll_response;

typedef struct {
  uint32_t sequence;
  uint32_t reserved;
} dolly_process_http_cancel_request;

/*
 * A process never receives a pointer into the kernel framebuffer. BEGIN_FRAME
 * describes the inactive buffer, WRITE_FRAME copies bounded sequential chunks
 * into it, and PRESENT atomically publishes it after the complete frame has
 * arrived. This keeps both memories private while allowing frames larger than
 * DOLLY_PROCESS_PACKET_LIMIT.
 */
typedef struct {
  uint64_t generation;
  uint32_t width;
  uint32_t height;
} dolly_process_display_size_request;

typedef struct {
  uint64_t generation;
} dolly_process_display_generation_request;

typedef struct {
  uint64_t generation;
  uint64_t capacity;
  uint32_t buffer_index;
  uint32_t width;
  uint32_t height;
  uint32_t stride;
  uint32_t pixel_format;
  uint32_t reserved;
} dolly_process_display_surface_response;

/* `size` pixel bytes follow this header. `offset` must be the next unwritten
 * byte of the frame begun for buffer_index. */
typedef struct {
  uint64_t generation;
  uint64_t offset;
  uint64_t size;
  uint32_t buffer_index;
  uint32_t reserved;
} dolly_process_display_write_request;

typedef struct {
  uint64_t generation;
  uint32_t buffer_index;
  uint32_t reserved;
} dolly_process_display_present_request;

typedef struct {
  uint64_t generation;
  uint64_t deadline_nanoseconds;
  uint32_t sequence;
  uint32_t reserved;
} dolly_process_display_wait_request;

typedef struct {
  int32_t result;
  uint32_t sequence;
} dolly_process_display_wait_response;

typedef struct {
  uint64_t generation;
  uint32_t cursor;
  uint32_t reserved;
} dolly_process_display_cursor_request;

typedef struct {
  uint64_t generation;
  uint64_t deadline_nanoseconds;
} dolly_process_display_event_request;

typedef struct {
  int32_t result;
  uint32_t reserved;
  unsigned char event[128];
} dolly_process_display_event_response;

/* For DSO_OPEN, image_size bytes follow this header. A zero-sized image
 * selects the process executable itself. These three operations are serviced
 * inside the process Worker: they add no kernel or browser I/O capability. */
typedef struct {
  uint32_t flags;
  uint32_t reserved;
  uint64_t image_size;
} dolly_process_dso_open_request;

/* For DSO_SYMBOL, name_size UTF-8 bytes without a NUL follow this header. */
typedef struct {
  uint64_t handle;
  uint32_t name_size;
  uint32_t reserved;
} dolly_process_dso_symbol_request;

typedef struct {
  uint64_t handle;
} dolly_process_dso_close_request;

typedef struct {
  uint64_t value;
  int32_t error;
  uint32_t message_size;
  unsigned char message[DOLLY_PROCESS_DSO_ERROR_CAPACITY];
} dolly_process_dso_response;

/*
 * These packets contain offsets in the calling process's private memory and
 * function-table indices, not kernel or browser addresses. They are serviced
 * synchronously by the process Worker and never cross the process-memory gate.
 * The layouts follow libffi's wasm64 ABI; other FFI implementations may use
 * the same operations without acquiring an additional machine import.
 */
typedef struct {
  uint64_t cif;
  uint64_t function;
  uint64_t return_value;
  uint64_t argument_values;
} dolly_process_ffi_call_request;

typedef struct {
  uint64_t closure;
} dolly_process_ffi_closure_request;

typedef struct {
  uint64_t code;
} dolly_process_ffi_closure_response;

typedef struct {
  uint64_t closure;
  uint64_t cif;
  uint64_t function;
  uint64_t user_data;
  uint64_t code;
} dolly_process_ffi_closure_prep_request;

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

#if defined(__cplusplus)
static_assert(sizeof(dolly_process_vector_sizes) == 16);
static_assert(sizeof(dolly_process_fd_io_request) == 16);
static_assert(sizeof(dolly_process_fd_pread_request) == 24);
static_assert(sizeof(dolly_process_fd_truncate_request) == 16);
static_assert(sizeof(dolly_process_fd_request) == 8);
static_assert(sizeof(dolly_process_timestamp) == 16);
static_assert(sizeof(dolly_process_fd_times_request) == 40);
static_assert(sizeof(dolly_process_fd_dup_request) == 16);
static_assert(sizeof(dolly_process_fd_flags) == 8);
static_assert(sizeof(dolly_process_poll_request) == 16);
static_assert(sizeof(dolly_process_poll_query) == 8);
static_assert(sizeof(dolly_process_poll_response) == 16);
static_assert(sizeof(dolly_process_poll_result) == 8);
static_assert(sizeof(dolly_process_directory_entry) == 24);
static_assert(sizeof(dolly_process_directory_request) == 24);
static_assert(sizeof(dolly_process_stat_response) == 88);
static_assert(sizeof(dolly_process_filesystem_stat_response) == 96);
static_assert(sizeof(dolly_process_spawn_request) == 56);
static_assert(sizeof(dolly_process_two_path_request) == 16);
static_assert(sizeof(dolly_process_path_times_request) == 48);
static_assert(sizeof(dolly_process_terminal_request) == 24);
static_assert(sizeof(dolly_process_terminal_response) == 16);
static_assert(sizeof(dolly_process_http_start_request) == 24);
static_assert(sizeof(dolly_process_http_start_response) == 8);
static_assert(sizeof(dolly_process_http_poll_request) == 8);
static_assert(sizeof(dolly_process_http_poll_response) == 32);
static_assert(sizeof(dolly_process_http_cancel_request) == 8);
static_assert(sizeof(dolly_process_display_size_request) == 16);
static_assert(sizeof(dolly_process_display_generation_request) == 8);
static_assert(sizeof(dolly_process_display_surface_response) == 40);
static_assert(sizeof(dolly_process_display_write_request) == 32);
static_assert(sizeof(dolly_process_display_present_request) == 16);
static_assert(sizeof(dolly_process_display_wait_request) == 24);
static_assert(sizeof(dolly_process_display_wait_response) == 8);
static_assert(sizeof(dolly_process_display_cursor_request) == 16);
static_assert(sizeof(dolly_process_display_event_request) == 16);
static_assert(sizeof(dolly_process_display_event_response) == 136);
static_assert(sizeof(dolly_process_clock_sleep_request) == 16);
static_assert(sizeof(dolly_process_dso_open_request) == 16);
static_assert(sizeof(dolly_process_dso_symbol_request) == 16);
static_assert(sizeof(dolly_process_dso_close_request) == 8);
static_assert(sizeof(dolly_process_dso_response) == 256);
static_assert(sizeof(dolly_process_ffi_call_request) == 32);
static_assert(sizeof(dolly_process_ffi_closure_request) == 8);
static_assert(sizeof(dolly_process_ffi_closure_response) == 8);
static_assert(sizeof(dolly_process_ffi_closure_prep_request) == 40);
#else
_Static_assert(sizeof(dolly_process_vector_sizes) == 16, "process ABI layout");
_Static_assert(sizeof(dolly_process_fd_io_request) == 16, "process ABI layout");
_Static_assert(sizeof(dolly_process_fd_pread_request) == 24, "process ABI layout");
_Static_assert(sizeof(dolly_process_fd_truncate_request) == 16, "process ABI layout");
_Static_assert(sizeof(dolly_process_fd_request) == 8, "process ABI layout");
_Static_assert(sizeof(dolly_process_timestamp) == 16, "process ABI layout");
_Static_assert(sizeof(dolly_process_fd_times_request) == 40,
               "process ABI layout");
_Static_assert(sizeof(dolly_process_fd_dup_request) == 16, "process ABI layout");
_Static_assert(sizeof(dolly_process_fd_flags) == 8, "process ABI layout");
_Static_assert(sizeof(dolly_process_poll_request) == 16,
               "process ABI layout");
_Static_assert(sizeof(dolly_process_poll_query) == 8,
               "process ABI layout");
_Static_assert(sizeof(dolly_process_poll_response) == 16,
               "process ABI layout");
_Static_assert(sizeof(dolly_process_poll_result) == 8,
               "process ABI layout");
_Static_assert(sizeof(dolly_process_directory_entry) == 24, "process ABI layout");
_Static_assert(sizeof(dolly_process_directory_request) == 24, "process ABI layout");
_Static_assert(sizeof(dolly_process_stat_response) == 88, "process ABI layout");
_Static_assert(sizeof(dolly_process_filesystem_stat_response) == 96,
               "process ABI layout");
_Static_assert(sizeof(dolly_process_spawn_request) == 56, "process ABI layout");
_Static_assert(sizeof(dolly_process_two_path_request) == 16, "process ABI layout");
_Static_assert(sizeof(dolly_process_path_times_request) == 48,
               "process ABI layout");
_Static_assert(sizeof(dolly_process_terminal_request) == 24, "process ABI layout");
_Static_assert(sizeof(dolly_process_terminal_response) == 16, "process ABI layout");
_Static_assert(sizeof(dolly_process_http_start_request) == 24,
               "process ABI layout");
_Static_assert(sizeof(dolly_process_http_start_response) == 8,
               "process ABI layout");
_Static_assert(sizeof(dolly_process_http_poll_request) == 8,
               "process ABI layout");
_Static_assert(sizeof(dolly_process_http_poll_response) == 32,
               "process ABI layout");
_Static_assert(sizeof(dolly_process_http_cancel_request) == 8,
               "process ABI layout");
_Static_assert(sizeof(dolly_process_display_size_request) == 16,
               "process ABI layout");
_Static_assert(sizeof(dolly_process_display_generation_request) == 8,
               "process ABI layout");
_Static_assert(sizeof(dolly_process_display_surface_response) == 40,
               "process ABI layout");
_Static_assert(sizeof(dolly_process_display_write_request) == 32,
               "process ABI layout");
_Static_assert(sizeof(dolly_process_display_present_request) == 16,
               "process ABI layout");
_Static_assert(sizeof(dolly_process_display_wait_request) == 24,
               "process ABI layout");
_Static_assert(sizeof(dolly_process_display_wait_response) == 8,
               "process ABI layout");
_Static_assert(sizeof(dolly_process_display_cursor_request) == 16,
               "process ABI layout");
_Static_assert(sizeof(dolly_process_display_event_request) == 16,
               "process ABI layout");
_Static_assert(sizeof(dolly_process_display_event_response) == 136,
               "process ABI layout");
_Static_assert(sizeof(dolly_process_clock_sleep_request) == 16,
               "process ABI layout");
_Static_assert(sizeof(dolly_process_dso_open_request) == 16,
               "process ABI layout");
_Static_assert(sizeof(dolly_process_dso_symbol_request) == 16,
               "process ABI layout");
_Static_assert(sizeof(dolly_process_dso_close_request) == 8,
               "process ABI layout");
_Static_assert(sizeof(dolly_process_dso_response) == 256,
               "process ABI layout");
_Static_assert(sizeof(dolly_process_ffi_call_request) == 32,
               "process ABI layout");
_Static_assert(sizeof(dolly_process_ffi_closure_request) == 8,
               "process ABI layout");
_Static_assert(sizeof(dolly_process_ffi_closure_response) == 8,
               "process ABI layout");
_Static_assert(sizeof(dolly_process_ffi_closure_prep_request) == 40,
               "process ABI layout");
#endif

#ifdef __cplusplus
}
#endif

#endif
