#include <errno.h>
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

#include <dolly/runtime.h>

#include "dolly-kernel-contracts.h"
#include "fs-record.h"
#include "process-kernel.h"
#include "pty-kernel.h"
#include "system-snapshot.h"

// The page's terminal mailbox (abi/dolly-supervisor-0.wat), with or without a
// display. The process kernel owns foreground policy: the page only reads it
// and asks to interrupt the foreground command it read.
typedef struct {
  _Atomic uint32_t result_sequence;
  _Atomic uint32_t result_status;
  _Atomic uint32_t foreground_pid;
  _Atomic uint32_t foreground_interrupt;
  _Atomic uint32_t interrupt_sequence;
  _Atomic uint32_t interrupt_target_pid;
} dolly_terminal_mailbox;
_Static_assert(
    offsetof(dolly_terminal_mailbox, result_sequence) == 4 * DOLLY_TERMINAL_WORD_RESULT_SEQUENCE &&
    offsetof(dolly_terminal_mailbox, result_status) == 4 * DOLLY_TERMINAL_WORD_RESULT_STATUS &&
    offsetof(dolly_terminal_mailbox, foreground_pid) == 4 * DOLLY_TERMINAL_WORD_FOREGROUND_PID &&
    offsetof(dolly_terminal_mailbox, foreground_interrupt) == 4 * DOLLY_TERMINAL_WORD_FOREGROUND_INTERRUPTIBLE &&
    offsetof(dolly_terminal_mailbox, interrupt_sequence) == 4 * DOLLY_TERMINAL_WORD_INTERRUPT_SEQUENCE &&
    offsetof(dolly_terminal_mailbox, interrupt_target_pid) == 4 * DOLLY_TERMINAL_WORD_INTERRUPT_TARGET_PID,
    "terminal mailbox layout differs from dolly-supervisor-0.wat");

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

void dolly_kernel_foreground_publish(int pid, unsigned interrupt) {
  atomic_store_explicit(&terminal_mailbox.foreground_pid, (uint32_t)pid,
                        memory_order_release);
  atomic_store_explicit(&terminal_mailbox.foreground_interrupt, interrupt,
                        memory_order_release);
}

int dolly_kernel_foreground(void) {
  return (int)atomic_load_explicit(&terminal_mailbox.foreground_pid,
                                   memory_order_acquire);
}

int dolly_kernel_take_interrupt(void) {
  const uint32_t sequence = atomic_load_explicit(
      &terminal_mailbox.interrupt_sequence, memory_order_acquire);
  if (sequence == consumed_interrupt_sequence) return 0;
  consumed_interrupt_sequence = sequence;
  const int target = (int)atomic_load_explicit(
      &terminal_mailbox.interrupt_target_pid, memory_order_relaxed);
  return target != 0 && target == dolly_kernel_foreground() &&
      atomic_load_explicit(&terminal_mailbox.foreground_interrupt,
                           memory_order_acquire) != 0 ? target : 0;
}

/* The boot terminal: a pseudo-terminal (kernel/pty.c) the kernel opens with its
 * first write and holds the master of. The page's root processes start on its
 * slave, and /dev/tty names it for a process on no other terminal. What its
 * programs write reaches the display's terminal (host/display/kernel.c) or,
 * while no display is attached, the bootstrap log; what the input module
 * decodes (host/input/kernel.c) is typed into it when a reader asks, so a
 * program reading records under the input lease races no terminal reader.
 * Its interrupt key interrupts the foreground as the page's Ctrl+C does. */
static dolly_pty *boot_terminal;

static void boot_output(dolly_pty *pty) {
  const dolly_terminal_output *output = dolly_kernel_terminal_output_device();
  const int attached = output != NULL && output->attached();
  unsigned char bytes[4096];
  for (size_t count; (count = dolly_pty_take_output(pty, bytes, sizeof(bytes))) != 0;) {
    if (attached) output->render(bytes, count);
    else (void)dolly_bootstrap_write_bytes(bytes, count);
  }
}

static void boot_input(dolly_pty *pty) {
  const dolly_terminal_input *input = dolly_kernel_terminal_input_device();
  for (int byte; input != NULL && dolly_pty_input_room(pty) != 0 && (byte = input->read()) >= 0;) {
    const unsigned char typed = (unsigned char)byte;
    dolly_pty_type(pty, &typed, 1);
  }
}

static void boot_interrupt(dolly_pty *pty) {
  (void)pty;
  const int foreground = dolly_kernel_foreground();
  if (foreground > 0) dolly_kernel_interrupt_tree(foreground);
}

static const dolly_pty_holder boot_holder = {boot_output, boot_input, boot_interrupt};

static dolly_pty *boot(void) {
  if (boot_terminal == NULL) boot_terminal = dolly_pty_held(&boot_holder);
  return boot_terminal;
}

dolly_kernel_socket *dolly_kernel_boot_terminal(void) {
  dolly_pty *pty = boot();
  return pty != NULL ? dolly_pty_slave(pty) : NULL;
}

uint32_t dolly_kernel_terminal_mode(void) {
  dolly_pty *pty = boot();
  return pty != NULL ? dolly_pty_mode(pty) : 0;
}

void dolly_kernel_terminal_resized(uint32_t columns, uint32_t rows) {
  dolly_pty *pty = boot();
  if (pty != NULL) (void)dolly_pty_resize(pty, rows, columns);
}

void dolly_kernel_terminal_discard(void) {
  const dolly_terminal_input *input = dolly_kernel_terminal_input_device();
  if (input != NULL) input->discard();
  if (boot_terminal != NULL) dolly_pty_discard_input(boot_terminal);
}

/* The supervisor's words (abi/dolly-supervisor-0.wat): about the executable it
 * prepares, for the terminal of the process that waits for it, a console's as
 * much as the display's. Without one, and before a display is attached, they
 * are boot text. */
int dolly_terminal_write_bytes(int pid, const unsigned char *bytes, uintptr_t length) {
  if (dolly_kernel_launch_diagnostic(pid, bytes, (size_t)length)) return 0;
  const dolly_terminal_output *output = dolly_kernel_terminal_output_device();
  if (output == NULL || !output->attached()) return dolly_kernel_terminal_write(bytes, length);
  return 0;
}

int dolly_kernel_terminal_write(const unsigned char *bytes, uintptr_t length) {
  if (bytes == NULL || length == 0) return 0;
  dolly_pty *pty = boot();
  if (pty == NULL) return dolly_bootstrap_write_bytes(bytes, length);
  dolly_kernel_socket *slave = dolly_pty_slave(pty);
  while (length != 0) {
    /* The kernel's holder takes what the slave writes as it comes: it never waits. */
    const int64_t sent = slave->kind->send(slave, bytes, (size_t)length, 0);
    if (sent <= 0) return sent < 0 ? (int)sent : -EIO;
    bytes += sent;
    length -= (uintptr_t)sent;
  }
  return 0;
}

_Noreturn void dolly_assert_fail(const char *condition, const char *file,
                                 unsigned line, const char *function) {
  fprintf(stderr, "%s:%u: %s: assertion failed: %s\n",
          file, line, function, condition);
  abort();
}

// The Worker's boot files (abi/dolly-image-0.wat, abi/dolly-supervisor-0.wat).
int dolly_write_file(const char *path, const void *bytes, size_t length) {
  if (path == NULL || !dolly_fs_valid_path(path) ||
      (bytes == NULL && length != 0)) return -EINVAL;
  if (dolly_fs_parents(path, 1) != 0) return -errno;
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

// A build's input image, whose bytes stay in the Worker (abi/dolly-image-0.wat).
int dolly_build_input(const char *path, uint32_t input, uint64_t size) {
  if (path == NULL || !dolly_fs_valid_path(path)) return -EINVAL;
  if (dolly_fs_parents(path, 1) != 0) return -errno;
  return dolly_fs_input_file(path, input, size);
}

int dolly_read_file(const char *path, void *bytes, size_t capacity) {
  if (path == NULL || bytes == NULL || capacity > INT_MAX) return -EINVAL;
  unsigned char *contents;
  uintptr_t size;
  if (dolly_fs_read_file(path, capacity, &contents, &size) != 0) return -errno;
  memcpy(bytes, contents, size);
  free(contents);
  return (int)size;
}

int dolly_remove_file(const char *path) {
  if (path == NULL) return -EINVAL;
  return unlink(path) == 0 ? 0 : -errno;
}

int dolly_kernel_boot_environment(void) {
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

  static const char *const directories[] = {"/bin", "/tmp", "/workspace", "/home", "/home/dolly", "/proc"};
  for (size_t index = 0; index < sizeof(directories) / sizeof(*directories); ++index) {
    if (mkdir(directories[index], 0755) != 0 && errno != EEXIST) {
      fprintf(stderr, "dolly: mkdir %s failed: %s\n", directories[index], strerror(errno));
      return 1;
    }
  }
  // The kernel answers an open of this empty file with its process list.
  const int processes = open("/proc/processes", O_WRONLY | O_CREAT, 0444);
  if (processes < 0 || close(processes) != 0) {
    fprintf(stderr, "dolly: /proc/processes: %s\n", strerror(errno));
    return 1;
  }
  // What every process starts from, before the image's own environment
  // (load_image_environment). The browser supplies none of it: LANG is the
  // value every image was built with, whatever language the browser reports.
  // The terminal is Ghostty's emulator (libghostty-vt), kitty graphics
  // included; programs that look for it by name find it in TERM_PROGRAM.
  static const char *const environment[][2] = {
      {"PATH", "/bin:/usr/bin"}, {"PWD", "/"}, {"HOME", "/home/dolly"},
      {"LANG", "en_US.UTF-8"},
      {"TERM", "xterm-256color"}, {"COLORTERM", "truecolor"},
      {"TERM_PROGRAM", "ghostty"}};
  for (size_t index = 0; index < sizeof(environment) / sizeof(*environment); ++index) {
    if (setenv(environment[index][0], environment[index][1], 1) != 0) {
      fprintf(stderr, "dolly: %s initialization failed: %s\n", environment[index][0], strerror(errno));
      return 1;
    }
  }
  return 0;
}

static int load_image_environment(void);

int dolly_process_bootstrap_prepare(uintptr_t size) {
  if (dolly_kernel_boot_environment() != 0) return 1;
  if (dolly_snapshot_restore_staged(size, NULL) != 0) {
    fprintf(stderr, "dolly: invalid compiler seed: %s\n", strerror(errno));
    return 1;
  }
  return 0;
}

int dolly_process_bootstrap_resume_prepare(uintptr_t size,
                                           uint32_t resume_uses) {
  if (resume_uses != 1 || dolly_kernel_boot_environment() != 0) return 1;
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
  if (dolly_kernel_boot_environment() != 0) return 1;
  return dolly_snapshot_stream_begin(size) != 0;
}

int dolly_bootstrap_snapshot(uintptr_t size) {
  if (dolly_kernel_boot_environment() != 0) return 1;
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
// The image's first process starts in /workspace, which holds what its recipe put there.
int dolly_bootstrap_environment(void) {
  if (load_image_environment() != 0) {
    fprintf(stderr, "dolly: invalid image environment: %s\n", strerror(errno));
    return 1;
  }
  if (chdir("/workspace") != 0 || setenv("PWD", "/workspace", 1) != 0) {
    fprintf(stderr, "dolly: /workspace: %s\n", strerror(errno));
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
