#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <poll.h>
#include <pty.h>
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
#include <dolly/pty.h>

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
  size_t size = 0;
  while (size < wanted) {
    struct pollfd query = {descriptor, POLLIN, 0};
    if (poll(&query, 1, 5000) != 1) break;
    const ssize_t count = read(descriptor, bytes + size, wanted - size);
    if (count <= 0) break;
    size += (size_t)count;
  }
  if (size != wanted || memcmp(bytes, text, wanted) != 0) {
    fprintf(stderr, "PTY FAIL: expected \"%s\", read %zu bytes \"%.*s\"\n", text, size, (int)size, bytes);
    exit(1);
  }
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
  /* A handler runs when a system call starts: one that ran during the last
   * write is seen here, before the read that would wait. */
  for (;;) {
    if (resized) {
      resized = 0;
      if (ioctl(0, TIOCGWINSZ, &size) == 0) dprintf(1, "size %dx%d\n", size.ws_col, size.ws_row);
      continue;
    }
    if (interrupted) {
      interrupted = 0;
      write(1, "interrupt\n", 10);
      continue;
    }
    const ssize_t count = read(0, bytes, sizeof(bytes));
    if (count < 0 && errno == EINTR) continue;
    if (count <= 0 || bytes[0] == 'q') return count <= 0 ? 4 : 0;
    if (bytes[0] == 't') {
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

/* A program that makes no system call hears no signal: the interrupt key
 * and the hang-up end it all the same, as they do at the display's terminal. */
static int deaf(void) {
  int ends[2], status;
  const int signals[] = {SIGINT, SIGHUP};
  for (int round = 0; round < 2; ++round) {
    CHECK(pty_open(DOLLY_PTY_CLOEXEC, ends) == 0);
    const pid_t child = spawn_on(ends[1], "spin");
    CHECK(close(ends[1]) == 0);
    expect(ends[0], "spinning\r\n");
    CHECK(round == 0 ? write(ends[0], "\3", 1) == 1 : close(ends[0]) == 0);
    CHECK(waitpid(child, &status, 0) == child && WIFSIGNALED(status) && WTERMSIG(status) == signals[round]);
    if (round == 0) CHECK(close(ends[0]) == 0);
  }
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

/* What the libc gives a program that asked: openpty, a master's size through
 * ioctl, the one name a terminal has, and waitpid asked for stopped children
 * too. */
static int libc(void) {
  int master, slave, status;
  char name[64];
  struct winsize size = {7, 9, 0, 0};
  CHECK(openpty(&master, &slave, name, NULL, &size) == 0 && strncmp(name, "/dev/pts/", 9) == 0);
  CHECK(ioctl(slave, TIOCGWINSZ, &size) == 0 && size.ws_row == 7 && size.ws_col == 9);
  size.ws_row = 11;
  size.ws_col = 13;
  CHECK(ioctl(master, TIOCSWINSZ, &size) == 0);
  CHECK(ioctl(slave, TIOCGWINSZ, &size) == 0 && size.ws_row == 11 && size.ws_col == 13);
  CHECK(ioctl(slave, TIOCSWINSZ, &size) == -1 && errno == EPERM);
  CHECK(ioctl(STDIN_FILENO, TIOCSWINSZ, &size) == -1 && errno == EPERM);
  /* A terminal has no name: a program that got one would open it for a
   * description of its own (libuv does, to set O_NONBLOCK), and a slave is
   * one open file. */
  CHECK(ttyname(slave) == NULL && ttyname(STDIN_FILENO) == NULL);
  const pid_t child = spawn_on(slave, "terminal");
  CHECK(close(slave) == 0);
  expect(master, "ready\r\n");
  CHECK(write(master, "q", 1) == 1);
  CHECK(waitpid(child, &status, WUNTRACED) == child && WIFEXITED(status) && WEXITSTATUS(status) == 0);
  return 0;
}

/* Without the client openpty is the libc's own, which finds no /dev/ptmx. */
static int unlinked(void) {
  int master, slave;
  CHECK(openpty(&master, &slave, NULL, NULL, NULL) == -1 && errno == ENOENT);
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
  if (strcmp(mode, "libc") == 0) return libc();
  if (strcmp(mode, "unlinked") == 0) return unlinked();
  if (strcmp(mode, "flow") == 0) return flow();
  if (strcmp(mode, "flood") == 0) return flood();
  if (strcmp(mode, "spared") == 0) return spared();
  if (strcmp(mode, "shell") == 0) return waiter("script");
  if (strcmp(mode, "script") == 0) return waiter("sleeper");
  if (strcmp(mode, "sleeper") == 0) return write(1, "sleeping\n", 9), sleep(30), 5;
  if (strcmp(mode, "deaf") == 0) return deaf();
  if (strcmp(mode, "spin") == 0) for (write(1, "spinning\n", 9);;) {}
  if (strcmp(mode, "quota") == 0 && argc > 2) return quota(argv[2]);
  return 2;
}
