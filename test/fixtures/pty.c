#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <poll.h>
#include <signal.h>
#include <spawn.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/stat.h>
#include <sys/wait.h>
#include <termios.h>
#include <unistd.h>
#include <dolly/process.h>
#include "dolly-pty.h"

#define CHECK(condition) do { if (!(condition)) { \
  fprintf(stderr, "PTY FAIL line %d: %s (errno %d)\n", __LINE__, #condition, errno); \
  exit(1); \
} } while (0)

extern char **environ;
static char *self;

static int64_t pty_call(uint32_t operation, int descriptor, uint32_t flags, uint32_t rows,
                        uint32_t columns, dolly_pty_descriptors *opened) {
  const dolly_pty_request request = {(uint32_t)descriptor, flags, rows, columns};
  return dolly_process_call(operation, &request, sizeof(request), opened, opened ? sizeof(*opened) : 0);
}

/* ends[0] is the master, ends[1] the slave: 24 rows of 80 columns. */
static int64_t pty_open(uint32_t flags, int ends[2]) {
  dolly_pty_descriptors opened;
  const int64_t result = pty_call(DOLLY_PTY_OPEN, 0, flags, 24, 80, &opened);
  if (result != sizeof(opened)) return result;
  ends[0] = (int)opened.master;
  ends[1] = (int)opened.slave;
  return 0;
}

/* Starts this program in `mode` with `slave` as its terminal. */
static pid_t spawn_on(int slave, char *mode) {
  posix_spawn_file_actions_t actions;
  char *arguments[] = {self, mode, NULL};
  pid_t child;
  CHECK(posix_spawn_file_actions_init(&actions) == 0);
  for (int descriptor = 0; descriptor < 3; ++descriptor) {
    CHECK(posix_spawn_file_actions_adddup2(&actions, slave, descriptor) == 0);
  }
  CHECK(posix_spawn(&child, self, &actions, NULL, arguments, environ) == 0);
  posix_spawn_file_actions_destroy(&actions);
  return child;
}

/* The next bytes read are exactly `text`, within five seconds. */
static void expect(int descriptor, const char *text) {
  char bytes[128];
  const size_t wanted = strlen(text);
  for (size_t size = 0; size < wanted;) {
    struct pollfd query = {descriptor, POLLIN, 0};
    CHECK(poll(&query, 1, 5000) == 1);
    const ssize_t count = read(descriptor, bytes + size, wanted - size);
    CHECK(count > 0);
    size += (size_t)count;
  }
  CHECK(memcmp(bytes, text, wanted) == 0);
}

/* One process holding both ends: bytes cross, the slave is a terminal with a
 * mode and a size of its own, and the master is neither. */
static int pair(void) {
  int ends[2];
  struct stat status;
  struct winsize size;
  struct termios mode;
  char byte;
  CHECK(pty_open(DOLLY_PTY_CLOEXEC | DOLLY_PTY_NONBLOCK, ends) == 0);
  CHECK(!isatty(ends[0]) && isatty(ends[1]));
  CHECK(fstat(ends[0], &status) == 0 && S_ISCHR(status.st_mode));
  CHECK(fstat(ends[1], &status) == 0 && S_ISCHR(status.st_mode));
  CHECK(ioctl(ends[1], TIOCGWINSZ, &size) == 0 && size.ws_row == 24 && size.ws_col == 80);
  CHECK(ioctl(ends[0], TIOCGWINSZ, &size) == -1 && errno == ENOTTY);
  CHECK(read(ends[0], &byte, 1) == -1 && errno == EAGAIN);
  CHECK(write(ends[0], "in", 2) == 2);
  expect(ends[1], "in");
  CHECK(write(ends[1], "out\n", 4) == 4);
  expect(ends[0], "out\r\n");
  CHECK(tcgetattr(ends[1], &mode) == 0 && (mode.c_oflag & OPOST) && (mode.c_lflag & ISIG));
  mode.c_oflag &= ~(tcflag_t)OPOST;
  CHECK(tcsetattr(ends[1], TCSANOW, &mode) == 0);
  CHECK(write(ends[1], "raw\n", 4) == 4);
  expect(ends[0], "raw\n");

  CHECK(pty_call(DOLLY_PTY_RESIZE, ends[0], 0, 30, 100, NULL) == 0);
  CHECK(ioctl(ends[1], TIOCGWINSZ, &size) == 0 && size.ws_row == 30 && size.ws_col == 100);
  CHECK(pty_call(DOLLY_PTY_RESIZE, ends[1], 0, 30, 100, NULL) == -ENOTTY);
  CHECK(pty_call(DOLLY_PTY_RESIZE, STDIN_FILENO, 0, 30, 100, NULL) == -ENOTTY);
  CHECK(pty_call(DOLLY_PTY_RESIZE, 200, 0, 30, 100, NULL) == -EBADF);
  CHECK(pty_call(DOLLY_PTY_RESIZE, ends[0], 0, 0, 100, NULL) == -EINVAL);
  CHECK(pty_call(DOLLY_PTY_RESIZE, ends[0], 0, 30, 65536, NULL) == -EINVAL);
  dolly_pty_descriptors opened;
  CHECK(pty_call(DOLLY_PTY_OPEN, 0, 4, 24, 80, &opened) == -EINVAL);
  CHECK(pty_call(DOLLY_PTY_OPEN, 0, 0, 0, 80, &opened) == -EINVAL);

  /* The slave closed: what it wrote is read, then end of file; a write fails. */
  CHECK(write(ends[1], "last", 4) == 4 && close(ends[1]) == 0);
  expect(ends[0], "last");
  struct pollfd query = {ends[0], POLLIN | POLLOUT, 0};
  CHECK(poll(&query, 1, 0) == 1 && (query.revents & POLLHUP));
  CHECK(read(ends[0], &byte, 1) == 0);
  CHECK(write(ends[0], "x", 1) == -1 && errno == EIO);
  return 0;
}

static volatile sig_atomic_t resized, interrupted;
static void note(int number) {
  if (number == SIGWINCH) resized = 1;
  else interrupted = 1;
}

/* The program of `program`, on a slave: says what its terminal tells it. */
static int terminal(void) {
  struct sigaction action = {.sa_handler = note};
  struct winsize size;
  struct termios mode;
  char bytes[64];
  if (!isatty(0) || !isatty(1) || !isatty(2)) return 3;
  sigaction(SIGWINCH, &action, NULL);
  sigaction(SIGINT, &action, NULL);
  write(1, "ready\n", 6);
  for (;;) {
    const ssize_t count = read(0, bytes, sizeof(bytes));
    if (count < 0 && errno == EINTR) {
      if (resized && ioctl(0, TIOCGWINSZ, &size) == 0) dprintf(1, "size %dx%d\n", size.ws_col, size.ws_row);
      if (interrupted) write(1, "interrupt\n", 10);
      resized = interrupted = 0;
    } else if (count <= 0 || bytes[0] == 'q') {
      return count <= 0 ? 4 : 0;
    } else if (bytes[0] == 't') {
      const int own = open("/dev/tty", O_RDWR);
      if (own < 0 || !isatty(own) || write(own, "own\n", 4) != 4 || close(own) != 0) return 7;
    } else if (bytes[0] == 'r') {
      if (tcgetattr(0, &mode) != 0) return 5;
      mode.c_lflag &= ~(tcflag_t)ISIG;
      if (tcsetattr(0, TCSANOW, &mode) != 0) return 6;
      write(1, "raw\n", 4);
    } else {
      write(1, bytes[0] == 3 ? "byte 3\n" : "pong\n", bytes[0] == 3 ? 7 : 5);
    }
  }
}

/* A program on the slave reads what the master writes, opens the slave as
 * /dev/tty, hears a resize as SIGWINCH and byte 3 as SIGINT until it clears
 * ISIG, and ends with SIGHUP when the master closes. One that exits is end
 * of file to the master. */
static int program(void) {
  int ends[2], status;
  char byte;
  CHECK(pty_open(DOLLY_PTY_CLOEXEC, ends) == 0);
  pid_t child = spawn_on(ends[1], "terminal");
  CHECK(close(ends[1]) == 0);
  expect(ends[0], "ready\r\n");
  CHECK(write(ends[0], "ping", 4) == 4);
  expect(ends[0], "pong\r\n");
  CHECK(write(ends[0], "t", 1) == 1);
  expect(ends[0], "own\r\n");
  CHECK(pty_call(DOLLY_PTY_RESIZE, ends[0], 0, 40, 132, NULL) == 0);
  expect(ends[0], "size 132x40\r\n");
  CHECK(write(ends[0], "\3", 1) == 1);
  expect(ends[0], "interrupt\r\n");
  CHECK(write(ends[0], "r", 1) == 1);
  expect(ends[0], "raw\r\n");
  CHECK(write(ends[0], "\3", 1) == 1);
  expect(ends[0], "byte 3\r\n");
  CHECK(close(ends[0]) == 0);
  CHECK(waitpid(child, &status, 0) == child && WIFSIGNALED(status) && WTERMSIG(status) == SIGHUP);

  CHECK(pty_open(DOLLY_PTY_CLOEXEC, ends) == 0);
  child = spawn_on(ends[1], "terminal");
  CHECK(close(ends[1]) == 0);
  expect(ends[0], "ready\r\n");
  CHECK(write(ends[0], "q", 1) == 1);
  CHECK(waitpid(child, &status, 0) == child && WIFEXITED(status) && WEXITSTATUS(status) == 0);
  CHECK(read(ends[0], &byte, 1) == 0);
  return 0;
}

/* On a slave: waits for a program it starts there, as a shell does, and as
 * the script does that the shell runs. */
static int waiter(char *program) {
  int status;
  if (strcmp(program, "script") == 0) write(1, "waiting\n", 8);
  const pid_t child = spawn_on(0, program);
  if (waitpid(child, &status, 0) != child) return 3;
  dprintf(1, "%s ended %d\n", program, WIFSIGNALED(status) ? WTERMSIG(status) : -1);
  return 0;
}

/* The interrupt key is for the programs a shell waits for, the script and
 * what the script runs, not for the shell. */
static int spared(void) {
  int ends[2], status;
  CHECK(pty_open(DOLLY_PTY_CLOEXEC, ends) == 0);
  const pid_t child = spawn_on(ends[1], "shell");
  CHECK(close(ends[1]) == 0);
  expect(ends[0], "waiting\r\nsleeping\r\n");
  CHECK(write(ends[0], "\3", 1) == 1);
  char line[32];
  snprintf(line, sizeof(line), "script ended %d\r\n", SIGINT);
  expect(ends[0], line);
  CHECK(waitpid(child, &status, 0) == child && WIFEXITED(status) && WEXITSTATUS(status) == 0);
  return 0;
}

enum { FLOOD_BYTES = 4 * DOLLY_PTY_OUTPUT_BYTES + 5 };

/* On a slave: writes more than the master's side holds. */
static int flood(void) {
  char bytes[1000];
  for (size_t written = 0; written < FLOOD_BYTES;) {
    const size_t count = FLOOD_BYTES - written < sizeof(bytes) ? FLOOD_BYTES - written : sizeof(bytes);
    for (size_t index = 0; index < count; ++index) bytes[index] = (char)('a' + (written + index) % 26);
    if (write(1, bytes, count) != (ssize_t)count) return 3;
    written += count;
  }
  return 0;
}

/* Neither direction loses a byte: the slave's input takes what it holds and
 * refuses the rest of a master that does not wait, and a program that writes
 * more than the master's side holds waits for its reader. */
static int flow(void) {
  int ends[2], status;
  char block[DOLLY_PTY_INPUT_BYTES + 100];
  struct pollfd query;
  CHECK(pty_open(DOLLY_PTY_CLOEXEC | DOLLY_PTY_NONBLOCK, ends) == 0);
  memset(block, 'i', sizeof(block));
  CHECK(write(ends[0], block, sizeof(block)) == DOLLY_PTY_INPUT_BYTES);
  CHECK(write(ends[0], block, 1) == -1 && errno == EAGAIN);
  query = (struct pollfd){ends[0], POLLOUT, 0};
  CHECK(poll(&query, 1, 0) == 0);
  for (size_t size = 0; size < DOLLY_PTY_INPUT_BYTES;) {
    const ssize_t count = read(ends[1], block, sizeof(block));
    CHECK(count > 0 && block[0] == 'i');
    size += (size_t)count;
  }
  CHECK(poll(&query, 1, 0) == 1 && write(ends[0], block, 1) == 1);

  const pid_t child = spawn_on(ends[1], "flood");
  CHECK(close(ends[1]) == 0);
  size_t size = 0;
  for (;;) {
    query = (struct pollfd){ends[0], POLLIN, 0};
    CHECK(poll(&query, 1, 5000) == 1);
    const ssize_t count = read(ends[0], block, sizeof(block));
    CHECK(count >= 0);
    if (count == 0) break;
    for (ssize_t index = 0; index < count; ++index) CHECK(block[index] == (char)('a' + (size + (size_t)index) % 26));
    size += (size_t)count;
  }
  CHECK(size == FLOOD_BYTES);
  CHECK(waitpid(child, &status, 0) == child && WIFEXITED(status) && WEXITSTATUS(status) == 0);
  return 0;
}

/* Takes every pseudo-terminal the kernel holds; however this ends gives them back. */
static int quota(const char *end) {
  int ends[2], count = 0;
  int64_t result;
  while ((result = pty_open(0, ends)) == 0) ++count;
  CHECK(result == -ENFILE && count == DOLLY_PTY_LIMIT);
  if (strcmp(end, "abort") == 0) abort();
  while (strcmp(end, "spin") == 0) {}
  return 0;
}

int main(int argc, char **argv) {
  self = argv[0];
  const char *mode = argc > 1 ? argv[1] : "";
  if (strcmp(mode, "pair") == 0) return pair();
  if (strcmp(mode, "program") == 0) return program();
  if (strcmp(mode, "terminal") == 0) return terminal();
  if (strcmp(mode, "flow") == 0) return flow();
  if (strcmp(mode, "flood") == 0) return flood();
  if (strcmp(mode, "spared") == 0) return spared();
  if (strcmp(mode, "shell") == 0) return waiter("script");
  if (strcmp(mode, "script") == 0) return waiter("sleeper");
  if (strcmp(mode, "sleeper") == 0) return write(1, "sleeping\n", 9), sleep(30), 5;
  if (strcmp(mode, "quota") == 0 && argc > 2) return quota(argv[2]);
  return 2;
}
