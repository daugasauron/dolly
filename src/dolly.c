#include <errno.h>
#include <dirent.h>
#include <fcntl.h>
#include <limits.h>
#include <stdatomic.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

#include <emscripten/atomic.h>
#include <emscripten/emscripten.h>

#include <dolly/runtime.h>

#include "fs-record.h"
#include "process-kernel.h"
#include "system-snapshot.h"

static uint32_t terminal_mode_flags =
    DOLLY_TERMINAL_CANONICAL | DOLLY_TERMINAL_ECHO |
    DOLLY_TERMINAL_OPOST | DOLLY_TERMINAL_ONLCR | DOLLY_TERMINAL_ISIG;

// The page's terminal mailbox (abi/dolly-supervisor-0.wat), with or without a
// display. The process kernel owns foreground policy: the page only reads it
// and asks to interrupt the foreground command it read.
typedef struct {
  _Atomic uint32_t result_sequence;
  _Atomic uint32_t result_status;
  _Atomic uint32_t foreground_pid;
  _Atomic uint32_t foreground_interruptible;
  _Atomic uint32_t interrupt_sequence;
  _Atomic uint32_t interrupt_target_pid;
} dolly_terminal_mailbox;

_Alignas(64) static dolly_terminal_mailbox terminal_mailbox;
static uint32_t consumed_interrupt_sequence;

uintptr_t dolly_terminal_mailbox_address(void) {
  return (uintptr_t)&terminal_mailbox;
}

void dolly_terminal_publish_result(int status) {
  atomic_store_explicit(&terminal_mailbox.result_status, (uint32_t)status,
                        memory_order_release);
  atomic_fetch_add_explicit(&terminal_mailbox.result_sequence, 1,
                            memory_order_acq_rel);
  emscripten_atomic_notify((void *)&terminal_mailbox.result_sequence,
                           EMSCRIPTEN_NOTIFY_ALL_WAITERS);
}

void dolly_kernel_foreground_publish(int pid, int interruptible) {
  atomic_store_explicit(&terminal_mailbox.foreground_pid, (uint32_t)pid,
                        memory_order_release);
  atomic_store_explicit(&terminal_mailbox.foreground_interruptible,
                        interruptible != 0, memory_order_release);
}

int dolly_kernel_foreground(void) {
  return (int)atomic_load_explicit(&terminal_mailbox.foreground_pid,
                                   memory_order_acquire);
}

int dolly_process_take_interrupt(void) {
  const uint32_t sequence = atomic_load_explicit(
      &terminal_mailbox.interrupt_sequence, memory_order_acquire);
  if (sequence == consumed_interrupt_sequence) return 0;
  consumed_interrupt_sequence = sequence;
  const int target = (int)atomic_load_explicit(
      &terminal_mailbox.interrupt_target_pid, memory_order_relaxed);
  return target != 0 && target == dolly_kernel_foreground() &&
      atomic_load_explicit(&terminal_mailbox.foreground_interruptible,
                           memory_order_acquire) ? target : 0;
}

EM_JS(void, dolly_bootstrap_write_bytes,
      (const unsigned char *bytes, uintptr_t length), {
  const start = Number(bytes);
  Module["bootstrapWriteBytes"]?.(HEAPU8.slice(start, start + Number(length)));
});

uint32_t dolly_kernel_terminal_mode(void) {
  return terminal_mode_flags;
}

int dolly_kernel_terminal_set_mode(uint32_t flags) {
  const uint32_t valid = DOLLY_TERMINAL_CANONICAL | DOLLY_TERMINAL_ECHO |
      DOLLY_TERMINAL_OPOST | DOLLY_TERMINAL_ONLCR | DOLLY_TERMINAL_ISIG;
  if ((flags & ~valid) != 0) return -EINVAL;
  terminal_mode_flags = flags;
  return 0;
}

void dolly_terminal_write_bytes(const unsigned char *bytes, uintptr_t length) {
  if (bytes == NULL || length == 0) return;
  if (!dolly_kernel_terminal_attached()) {
    dolly_bootstrap_write_bytes(bytes, length);
    return;
  }
  const uint32_t newline = DOLLY_TERMINAL_OPOST | DOLLY_TERMINAL_ONLCR;
  if ((terminal_mode_flags & newline) == newline) {
    uintptr_t start = 0;
    for (uintptr_t index = 0; index < length; ++index) {
      if (bytes[index] != '\n') continue;
      if (index > start) dolly_kernel_terminal_render(bytes + start, index - start);
      dolly_kernel_terminal_render((const unsigned char *)"\r\n", 2);
      start = index + 1;
    }
    bytes += start;
    length -= start;
  }
  dolly_kernel_terminal_render(bytes, (size_t)length);
}

// Processes reach the terminal through their own descriptors, and /dev/stdin
// resolves to descriptor 0, so the kernel never reads WasmFS stdin. Defining
// this device callback keeps Emscripten's JavaScript fallback out of the
// kernel's imports.
int _wasmfs_stdin_get_char(void) { return -1; }

_Noreturn void dolly_assert_fail(const char *condition, const char *file,
                                 unsigned line, const char *function) {
  fprintf(stderr, "%s:%u: %s: assertion failed: %s\n",
          file, line, function, condition);
  abort();
}

int dolly_write_file(const char *path, const void *bytes, size_t length) {
  if (path == NULL || (bytes == NULL && length != 0)) return -EINVAL;
  int fd = open(path, O_WRONLY | O_CREAT | O_TRUNC, 0666);
  if (fd < 0) return -errno;

  const unsigned char *cursor = bytes;
  size_t remaining = length;
  int status = 0;
  while (remaining != 0) {
    const ssize_t written = write(fd, cursor, remaining);
    if (written < 0) {
      status = -errno;
      break;
    }
    if (written == 0) {
      status = -EIO;
      break;
    }
    cursor += (size_t)written;
    remaining -= (size_t)written;
  }
  if (close(fd) != 0 && status == 0) status = -errno;
  return status;
}

static int copy_seed_file(const char *source, const char *destination) {
  int input = open(source, O_RDONLY);
  if (input < 0) return -1;
  int output = open(destination, O_WRONLY | O_CREAT | O_TRUNC, 0666);
  if (output < 0) {
    close(input);
    return -1;
  }
  unsigned char bytes[64 * 1024];
  int status = 0;
  for (;;) {
    const ssize_t count = read(input, bytes, sizeof(bytes));
    if (count <= 0 || dolly_fs_write_exact(output, bytes, (uintptr_t)count) != 0) {
      status = count == 0 ? 0 : -1;
      break;
    }
  }
  int saved_error = status == 0 ? 0 : errno;
  if (close(output) != 0 && status == 0) {
    status = -1;
    saved_error = errno;
  }
  if (close(input) != 0 && status == 0) {
    status = -1;
    saved_error = errno;
  }
  if (status != 0) errno = saved_error == 0 ? EIO : saved_error;
  return status;
}

static int install_seed_tree(const char *source, const char *destination) {
  struct stat metadata;
  if (stat(source, &metadata) != 0) return -1;
  if (S_ISREG(metadata.st_mode)) return copy_seed_file(source, destination);
  if (!S_ISDIR(metadata.st_mode)) {
    errno = ENOTSUP;
    return -1;
  }

  struct stat destination_metadata;
  if (stat(destination, &destination_metadata) != 0) {
    if (mkdir(destination, 0755) != 0) return -1;
  } else if (!S_ISDIR(destination_metadata.st_mode)) {
    errno = ENOTDIR;
    return -1;
  }

  DIR *directory = opendir(source);
  if (directory == NULL) return -1;
  int status = 0;
  for (;;) {
    errno = 0;
    struct dirent *entry = readdir(directory);
    if (entry == NULL) {
      if (errno != 0) status = -1;
      break;
    }
    if (strcmp(entry->d_name, ".") == 0 || strcmp(entry->d_name, "..") == 0) {
      continue;
    }
    char child_source[PATH_MAX];
    char child_destination[PATH_MAX];
    if (snprintf(child_source, sizeof(child_source), "%s/%s", source,
                 entry->d_name) >= (int)sizeof(child_source) ||
        snprintf(child_destination, sizeof(child_destination), "%s/%s",
                 destination, entry->d_name) >= (int)sizeof(child_destination)) {
      errno = ENAMETOOLONG;
      status = -1;
      break;
    }
    if (install_seed_tree(child_source, child_destination) != 0) {
      status = -1;
      break;
    }
  }
  int saved_error = status == 0 ? 0 : errno;
  if (closedir(directory) != 0 && status == 0) {
    status = -1;
    saved_error = errno;
  }
  if (status != 0) errno = saved_error == 0 ? EIO : saved_error;
  return status;
}

static int initialize_boot_environment(void) {
  int output = open("/dev/dolly-stdout", O_WRONLY);
  int error = open("/dev/dolly-stderr", O_WRONLY);
  if (output < 0 || error < 0 || dup2(output, STDOUT_FILENO) < 0 ||
      dup2(error, STDERR_FILENO) < 0) {
    if (output >= 0) close(output);
    if (error >= 0) close(error);
    return 1;
  }
  close(output);
  close(error);

  if (mkdir("/bin", 0755) != 0 && errno != EEXIST) {
    fprintf(stderr, "dolly: mkdir /bin failed: %s\n", strerror(errno));
    return 1;
  }
  if (mkdir("/tmp", 0755) != 0 && errno != EEXIST) {
    fprintf(stderr, "dolly: mkdir /tmp failed: %s\n", strerror(errno));
    return 1;
  }
  if (mkdir("/workspace", 0755) != 0 && errno != EEXIST) {
    fprintf(stderr, "dolly: mkdir /workspace failed: %s\n", strerror(errno));
    return 1;
  }
  if (setenv("HOME", "/home/dolly", 1) != 0) {
    fprintf(stderr, "dolly: HOME initialization failed: %s\n", strerror(errno));
    return 1;
  }
  if (setenv("PATH", "/bin:/usr/bin", 1) != 0) {
    fprintf(stderr, "dolly: PATH initialization failed: %s\n", strerror(errno));
    return 1;
  }
  if (setenv("SHELL", "/bin/slop", 1) != 0) {
    fprintf(stderr, "dolly: SHELL initialization failed: %s\n", strerror(errno));
    return 1;
  }
  if (setenv("TERM", "xterm-256color", 1) != 0 ||
      setenv("COLORTERM", "truecolor", 1) != 0) {
    fprintf(stderr, "dolly: terminal environment initialization failed: %s\n",
            strerror(errno));
    return 1;
  }
  // Emscripten's defaults name a user no passwd lookup knows ("web_user").
  // Dolly has no user database, so programs find HOME instead.
  if (unsetenv("USER") != 0 || unsetenv("LOGNAME") != 0 || unsetenv("_") != 0) {
    fprintf(stderr, "dolly: user environment initialization failed: %s\n", strerror(errno));
    return 1;
  }
  return 0;
}

static int load_image_environment(void);

int dolly_process_bootstrap_prepare(void) {
  if (initialize_boot_environment() != 0) return 1;
  if (install_seed_tree("/seed/usr", "/usr") != 0) {
    fprintf(stderr, "dolly: could not install compiler seed: %s\n", strerror(errno));
    return 1;
  }
  return 0;
}

int dolly_process_bootstrap_resume_prepare(uintptr_t size,
                                           uint32_t resume_uses) {
  if (resume_uses != 1 || initialize_boot_environment() != 0) return 1;
  puts("dolly: restoring image builder");
  fflush(stdout);
  if (dolly_snapshot_restore_staged(size, "/bin/dollyfile") != 0) {
    fprintf(stderr, "dolly: invalid base image artifact: %s\n",
            strerror(errno));
    return 1;
  }
  return 0;
}

int dolly_bootstrap_snapshot_begin(uintptr_t size) {
  if (initialize_boot_environment() != 0) return 1;
  return dolly_snapshot_stream_begin(size) != 0;
}

int dolly_bootstrap_snapshot(uintptr_t size) {
  if (initialize_boot_environment() != 0) return 1;
  puts("dolly: restoring precompiled system snapshot");
  fflush(stdout);
  if (dolly_snapshot_restore_staged(size, NULL) != 0) {
    fprintf(stderr, "dolly: invalid system snapshot: %s\n", strerror(errno));
    return 1;
  }
  puts("dolly: precompiled system restored");
  fflush(stdout);
  return dolly_snapshot_prune() != 0;
}

int dolly_bootstrap_finish(void) {
  return dolly_snapshot_prune() != 0;
}

// Once the filesystem is final: after the image is restored and a saved
// session has replayed its files, so an installed environment survives a reload.
int dolly_bootstrap_environment(void) {
  if (load_image_environment() != 0) {
    fprintf(stderr, "dolly: invalid image environment: %s\n", strerror(errno));
    return 1;
  }
  return 0;
}

int dolly_bootstrap_snapshot_end(void) {
  if (dolly_snapshot_stream_finish() != 0) {
    fprintf(stderr, "dolly: invalid streamed system snapshot: %s\n", strerror(errno));
    return 1;
  }
  return dolly_bootstrap_finish();
}

static int valid_environment_name_bytes(const unsigned char *name,
                                        uint32_t length) {
  if (length == 0 || length > 128 ||
      !((name[0] >= 'A' && name[0] <= 'Z') ||
        (name[0] >= 'a' && name[0] <= 'z') || name[0] == '_')) return 0;
  for (uint32_t index = 1; index < length; ++index) {
    if (!((name[index] >= 'A' && name[index] <= 'Z') ||
          (name[index] >= 'a' && name[index] <= 'z') ||
          (name[index] >= '0' && name[index] <= '9') || name[index] == '_')) {
      return 0;
    }
  }
  return 1;
}

static int load_image_environment(void) {
  unsigned char *bytes;
  uintptr_t size;
  if (dolly_fs_read_file("/etc/dolly/environment", 128 * 1024, &bytes, &size) != 0) return -1;
  if (size < 16 || memcmp(bytes, "DOLLYENV", 8) != 0) {
    free(bytes);
    errno = EINVAL;
    return -1;
  }
  const unsigned char *cursor = bytes + 8;
  const unsigned char *end = bytes + size;
  uint32_t version = 0, count = 0;
  int error = dolly_fs_take_u32(&cursor, end, &version) != 0 ||
      dolly_fs_take_u32(&cursor, end, &count) != 0 || version != 1 || count > 256 ? EINVAL : 0;
  for (uint32_t index = 0; error == 0 && index < count; ++index) {
    uint32_t name_length, value_length;
    const unsigned char *name, *value;
    if (dolly_fs_take_u32(&cursor, end, &name_length) != 0 ||
        dolly_fs_take_u32(&cursor, end, &value_length) != 0 ||
        value_length > 64 * 1024 ||
        dolly_fs_take_bytes(&cursor, end, name_length, &name) != 0 ||
        dolly_fs_take_bytes(&cursor, end, value_length, &value) != 0 ||
        !valid_environment_name_bytes(name, name_length) ||
        memchr(value, '\0', value_length) != NULL) {
      error = EINVAL;
      break;
    }
    char *entry_name = strndup((const char *)name, name_length);
    char *entry_value = strndup((const char *)value, value_length);
    if (entry_name == NULL || entry_value == NULL) error = ENOMEM;
    else if (setenv(entry_name, entry_value, 1) != 0) error = errno;
    free(entry_name);
    free(entry_value);
  }
  free(bytes);
  if (error == 0 && cursor != end) error = EINVAL;
  if (error != 0) {
    errno = error;
    return -1;
  }
  return 0;
}
