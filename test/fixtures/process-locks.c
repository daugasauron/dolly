#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <poll.h>
#include <signal.h>
#include <spawn.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/file.h>
#include <sys/time.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

#define CHECK(condition) do { if (!(condition)) { \
  fprintf(stderr, "LOCKS FAIL line %d: %s (errno %d)\n", __LINE__, #condition, errno); \
  exit(1); \
} } while (0)

/* Every process inherits these pipe ends: a child reports on REPORT and waits
 * for GO; the test reads NEWS and writes ORDER. */
enum { NEWS = 20, REPORT = 21, GO = 22, ORDER = 23 };

extern char **environ;
static const char *program, *path;

static pid_t start(const char *role, const char *first, const char *second, const char *third) {
  char *arguments[] = {(char *)program, (char *)path, (char *)role,
                       (char *)first, (char *)second, (char *)third, NULL};
  pid_t pid;
  CHECK(posix_spawn(&pid, program, NULL, NULL, arguments, environ) == 0);
  return pid;
}

static int ended(pid_t pid) {
  int status;
  CHECK(waitpid(pid, &status, 0) == pid);
  return status;
}

static void tell(int descriptor, char byte) { CHECK(write(descriptor, &byte, 1) == 1); }

static void hear(int descriptor, char expected) {
  char byte;
  CHECK(read(descriptor, &byte, 1) == 1 && byte == expected);
}

static int record(int fd, int command, int type, off_t start, off_t length) {
  struct flock lock = {.l_type = (short)type, .l_whence = SEEK_SET, .l_start = start, .l_len = length};
  return fcntl(fd, command, &lock);
}

/* The whole file, as a flock ('f') or as a record lock ('r'). */
static int take(char kind, int fd, int exclusive, int wait) {
  if (kind == 'f') return flock(fd, (exclusive ? LOCK_EX : LOCK_SH) | (wait ? 0 : LOCK_NB));
  return record(fd, wait ? F_SETLKW : F_SETLK, exclusive ? F_WRLCK : F_RDLCK, 0, 0);
}

static int drop(char kind, int fd) {
  return kind == 'f' ? flock(fd, LOCK_UN) : record(fd, F_SETLK, F_UNLCK, 0, 0);
}

/* A child sees the test's record locks: byte by byte 'W', 'R' or '.', and the
 * lock over byte `at` as [start, start + length), a zero length having no end. */
static int see(const char *map, int at, off_t start, off_t length) {
  const int fd = open(path, O_RDWR);
  CHECK(fd >= 0);
  for (int byte = 0; map[byte]; ++byte) {
    struct flock lock = {.l_type = F_WRLCK, .l_whence = SEEK_CUR, .l_start = byte, .l_len = 1};
    CHECK(fcntl(fd, F_GETLK, &lock) == 0);
    const char seen = lock.l_type == F_UNLCK ? '.' : lock.l_type == F_WRLCK ? 'W' : 'R';
    if (seen != map[byte]) {
      fprintf(stderr, "LOCKS FAIL byte %d is %c, expected %s\n", byte, seen, map);
      return 1;
    }
    if (byte == at) {
      CHECK(lock.l_pid == getppid() && lock.l_whence == SEEK_SET);
      CHECK(lock.l_start == start && lock.l_len == length);
    }
  }
  return 0;
}

static void expect(const char *map, int at, int start, int length) {
  char numbers[3][16];
  snprintf(numbers[0], sizeof(numbers[0]), "%d", at);
  snprintf(numbers[1], sizeof(numbers[1]), "%d", start);
  snprintf(numbers[2], sizeof(numbers[2]), "%d", length);
  char *arguments[] = {(char *)program, (char *)path, "see", (char *)map,
                       numbers[0], numbers[1], numbers[2], NULL};
  pid_t pid;
  CHECK(posix_spawn(&pid, program, NULL, NULL, arguments, environ) == 0);
  CHECK(ended(pid) == 0);
}

/* The lock is given up 100 ms after the test asks, so the test is waiting for
 * it by then; the report precedes the release. */
static void release_when_told(void) {
  tell(REPORT, 'R');
  hear(GO, 'G');
  usleep(100000);
  tell(REPORT, 'U');
}

static int hold(char kind, int exclusive, const char *ending) {
  int fd = open(path, O_RDWR);
  CHECK(fd >= 0 && take(kind, fd, exclusive, 0) == 0);
  if (strcmp(ending, "spin") == 0) {
    tell(REPORT, 'R');
    for (volatile unsigned long count = 0;; ++count) {}
  }
  release_when_told();
  if (strcmp(ending, "trap") == 0) {
#ifdef __dolly__
    __builtin_trap();
#else
    _exit(126);
#endif
  }
  if (strcmp(ending, "unlock") == 0) CHECK(drop(kind, fd) == 0);
  else if (strcmp(ending, "close") == 0) CHECK(close(fd) == 0);
  else return 0;
  hear(GO, 'G');
  return 0;
}

static int inherit(int fd, const char *action) {
  if (strcmp(action, "lock") == 0) return flock(fd, LOCK_EX | LOCK_NB) != 0;
  if (strcmp(action, "keep") == 0) {
    release_when_told();
    return 0;
  }
  const int own = open(path, O_RDWR);
  CHECK(own >= 0 && flock(own, LOCK_EX | LOCK_NB) == -1 && errno == EWOULDBLOCK);
  CHECK(flock(fd, LOCK_EX | LOCK_NB) == 0 && flock(fd, LOCK_UN) == 0);
  CHECK(flock(own, LOCK_EX | LOCK_NB) == 0);
  return 0;
}

/* Two processes that each hold one of three locks and take the next before
 * dropping their own can only advance in turn: every step waits for the other
 * process's release. */
static void rotate(char kind, int held, int rounds) {
  const int first = held == 0;
  char names[3][80];
  int fds[3];
  for (int index = 0; index < 3; ++index) {
    snprintf(names[index], sizeof(names[index]), "%s.%d", path, index);
    fds[index] = open(names[index], O_RDWR | O_CREAT | O_CLOEXEC, 0600);
    CHECK(fds[index] >= 0);
  }
  CHECK(take(kind, fds[held], 1, 0) == 0);
  struct timespec started = {0}, finished = {0};
  if (first) {
    const char name[] = {kind, 0};
    const pid_t peer = start("rotate", name, NULL, NULL);
    hear(NEWS, 'R');
    CHECK(clock_gettime(CLOCK_MONOTONIC, &started) == 0);
    for (int round = 0; round < rounds; ++round, held = (held + 1) % 3) {
      CHECK(take(kind, fds[(held + 1) % 3], 1, 1) == 0 && drop(kind, fds[held]) == 0);
    }
    CHECK(clock_gettime(CLOCK_MONOTONIC, &finished) == 0);
    CHECK(drop(kind, fds[held]) == 0 && ended(peer) == 0);
  } else {
    tell(REPORT, 'R');
    for (int round = 0; round < rounds; ++round, held = (held + 1) % 3) {
      CHECK(take(kind, fds[(held + 1) % 3], 1, 1) == 0 && drop(kind, fds[held]) == 0);
    }
  }
  /* A release wakes its waiter at once, not at a scheduler tick. */
  CHECK((finished.tv_sec - started.tv_sec) * 1000 + (finished.tv_nsec - started.tv_nsec) / 1000000 < 500);
  for (int index = 0; index < 3; ++index) {
    CHECK(close(fds[index]) == 0 && (!first || unlink(names[index]) == 0));
  }
}

static int child(int argc, char **argv) {
  const char *role = argv[2];
  if (strcmp(role, "see") == 0) {
    CHECK(argc == 7);
    return see(argv[3], atoi(argv[4]), atoi(argv[5]), atoi(argv[6]));
  }
  if (strcmp(role, "hold") == 0) return hold(argv[3][0], argv[4][0] == 'x', argv[5]);
  if (strcmp(role, "inherit") == 0) return inherit(atoi(argv[3]), argv[4]);
  if (strcmp(role, "rotate") == 0) {
    rotate(argv[3][0], 1, 100);
    return 0;
  }
  CHECK(strcmp(role, "kill") == 0);
  usleep(300000);
  return kill(atoi(argv[3]), SIGKILL) != 0;
}

static void invalid_requests(void) {
  int fd = open(path, O_RDWR), reader = open(path, O_RDONLY), writer = open(path, O_WRONLY);
  int closed = dup(fd);
  CHECK(fd >= 0 && reader >= 0 && writer >= 0 && closed >= 0 && close(closed) == 0);
  errno = 0;
  CHECK(flock(-1, LOCK_EX) == -1 && errno == EBADF);
  CHECK(flock(closed, LOCK_EX) == -1 && errno == EBADF);
  CHECK(flock(fd, LOCK_SH | LOCK_EX) == -1 && errno == EINVAL);
  CHECK(flock(fd, LOCK_UN) == 0 && flock(reader, LOCK_EX | LOCK_NB) == 0 && flock(reader, LOCK_UN) == 0);
  const int commands[] = {F_GETLK, F_SETLK, F_SETLKW};
  for (unsigned index = 0; index < sizeof(commands) / sizeof(commands[0]); ++index) {
    CHECK(record(-1, commands[index], F_WRLCK, 0, 1) == -1 && errno == EBADF);
    CHECK(record(closed, commands[index], F_WRLCK, 0, 1) == -1 && errno == EBADF);
    CHECK(record(fd, commands[index], F_WRLCK, -1, 1) == -1 && errno == EINVAL);
    CHECK(record(fd, commands[index], F_WRLCK, 2, -3) == -1 && errno == EINVAL);
    CHECK(record(fd, commands[index], 7, 0, 1) == -1 && errno == EINVAL);
    struct flock lock = {.l_type = F_WRLCK, .l_whence = 7, .l_len = 1};
    CHECK(fcntl(fd, commands[index], &lock) == -1 && errno == EINVAL);
  }
  CHECK(record(fd, F_GETLK, F_UNLCK, 0, 1) == -1 && errno == EINVAL);
  /* A read lock needs a descriptor open for reading, a write lock one open
   * for writing; unlocking and asking need neither. */
  CHECK(record(reader, F_SETLK, F_WRLCK, 0, 1) == -1 && errno == EBADF);
  CHECK(record(writer, F_SETLK, F_RDLCK, 0, 1) == -1 && errno == EBADF);
  CHECK(record(reader, F_SETLK, F_RDLCK, 0, 1) == 0 && record(writer, F_SETLK, F_WRLCK, 1, 1) == 0);
  CHECK(record(reader, F_GETLK, F_WRLCK, 0, 1) == 0 && record(writer, F_SETLK, F_UNLCK, 0, 0) == 0);
#ifdef __dolly__
  /* A pipe has no file to lock, and locks owned by a description through
   * fcntl do not exist here. */
  CHECK(flock(NEWS, LOCK_EX) == -1 && errno == ENOTSUP);
  CHECK(record(ORDER, F_SETLK, F_WRLCK, 0, 0) == -1 && errno == ENOTSUP);
  CHECK(record(fd, F_OFD_SETLK, F_WRLCK, 0, 0) == -1 && errno == EINVAL);
#endif
  CHECK(close(fd) == 0 && close(reader) == 0 && close(writer) == 0);
}

/* flock in one process: `b` is another description of the file, `d` a
 * duplicate of `a`. */
static void descriptions(void) {
  int a = open(path, O_RDWR), b = open(path, O_RDONLY), d = dup(a);
  CHECK(a >= 0 && b >= 0 && d >= 0);
  CHECK(flock(a, LOCK_EX) == 0);
  CHECK(flock(b, LOCK_EX | LOCK_NB) == -1 && errno == EWOULDBLOCK);
  CHECK(flock(b, LOCK_SH | LOCK_NB) == -1 && errno == EWOULDBLOCK);
  CHECK(flock(d, LOCK_EX | LOCK_NB) == 0 && flock(d, LOCK_UN) == 0);
  CHECK(flock(b, LOCK_EX | LOCK_NB) == 0 && flock(b, LOCK_UN) == 0);
  /* Shared joins shared. A refused conversion leaves no lock, as on Linux. */
  CHECK(flock(a, LOCK_SH) == 0 && flock(b, LOCK_SH | LOCK_NB) == 0);
  CHECK(flock(a, LOCK_EX | LOCK_NB) == -1 && errno == EWOULDBLOCK);
  CHECK(flock(b, LOCK_EX | LOCK_NB) == 0);
  CHECK(flock(b, LOCK_SH) == 0 && flock(a, LOCK_SH | LOCK_NB) == 0);
  CHECK(flock(a, LOCK_UN) == 0 && flock(b, LOCK_UN) == 0);
  /* The lock goes with the description's last descriptor. */
  CHECK(flock(a, LOCK_EX) == 0 && close(a) == 0);
  CHECK(flock(b, LOCK_EX | LOCK_NB) == -1 && errno == EWOULDBLOCK);
  CHECK(close(d) == 0 && flock(b, LOCK_EX | LOCK_NB) == 0 && close(b) == 0);
}

/* Record locks of one process, as another process sees them. */
static void ranges(void) {
  int fd = open(path, O_RDWR);
  CHECK(fd >= 0 && record(fd, F_SETLK, F_WRLCK, 0, 10) == 0);
  expect("WWWWWWWWWW......", 9, 0, 10);
  CHECK(record(fd, F_SETLK, F_RDLCK, 4, 2) == 0); /* Retyping the middle splits. */
  expect("WWWWRRWWWW......", 5, 4, 2);
  CHECK(record(fd, F_SETLK, F_UNLCK, 1, 1) == 0);
  expect("W.WWRRWWWW......", 2, 2, 2);
  CHECK(record(fd, F_SETLK, F_WRLCK, 10, 2) == 0); /* Locks that abut are one. */
  expect("W.WWRRWWWWWW....", 11, 6, 6);
  CHECK(record(fd, F_SETLK, F_WRLCK, 3, 4) == 0); /* An overlap absorbs and merges. */
  expect("W.WWWWWWWWWW....", 3, 2, 10);
  CHECK(record(fd, F_SETLK, F_UNLCK, 0, 0) == 0);
  expect("................", -1, 0, 0);

  /* Ranges from the offset (3) and the size (8), one that ends at its start,
   * and one without an end. */
  CHECK(lseek(fd, 3, SEEK_SET) == 3);
  struct flock from_offset = {.l_type = F_RDLCK, .l_whence = SEEK_CUR, .l_start = 1, .l_len = 2};
  struct flock from_size = {.l_type = F_WRLCK, .l_whence = SEEK_END, .l_start = -2, .l_len = 2};
  CHECK(fcntl(fd, F_SETLK, &from_offset) == 0 && fcntl(fd, F_SETLKW, &from_size) == 0);
  CHECK(record(fd, F_SETLK, F_WRLCK, 12, -2) == 0 && record(fd, F_SETLK, F_RDLCK, 14, 0) == 0);
  expect("....RRWW..WW..RR", 15, 14, 0);
  /* lockf is fcntl from the offset. */
  CHECK(lockf(fd, F_TLOCK, 1) == 0 && lockf(fd, F_TEST, 1) == 0 && lockf(fd, F_LOCK, -3) == 0);
  expect("WWWWRRWW..WW..RR", 0, 0, 4);
  CHECK(lockf(fd, F_ULOCK, -2) == 0);
  expect("W..WRRWW..WW..RR", 3, 3, 1);

  /* POSIX: closing any descriptor of the file drops the process's locks on it. */
  int again = open(path, O_RDONLY);
  CHECK(again >= 0 && close(again) == 0);
  expect("................", -1, 0, 0);
  CHECK(close(fd) == 0);
}

static volatile sig_atomic_t noted;
static void note(int number) { noted = number; }

static void alarm_in_50_ms(int flags) {
  struct sigaction action = {.sa_handler = note, .sa_flags = flags};
  const struct itimerval timer = {.it_value = {.tv_usec = 50000}};
  noted = 0;
  CHECK(sigaction(SIGALRM, &action, NULL) == 0 && setitimer(ITIMER_REAL, &timer, NULL) == 0);
}

/* Another process holds the lock; this one is refused, waits, and gets it
 * however the holder ends. */
static void contend(char kind) {
  const char other_kind = kind == 'f' ? 'r' : 'f', name[] = {kind, 0};
  static const char *const endings[] = {"unlock", "close", "exit", "trap", "spin"};
  int fd = open(path, O_RDWR);
  CHECK(fd >= 0);
  for (unsigned index = 0; index < sizeof(endings) / sizeof(endings[0]); ++index) {
    const char *ending = endings[index];
    const pid_t holder = start("hold", name, "x", ending);
    hear(NEWS, 'R');
    CHECK(take(kind, fd, 1, 0) == -1 && errno == EWOULDBLOCK);
    CHECK(take(kind, fd, 0, 0) == -1 && errno == EWOULDBLOCK);
    /* The two kinds do not see each other. */
    CHECK(take(other_kind, fd, 1, 0) == 0 && drop(other_kind, fd) == 0);
    struct flock lock = {.l_type = F_RDLCK, .l_whence = SEEK_SET, .l_start = 5, .l_len = 1};
    CHECK(fcntl(fd, F_GETLK, &lock) == 0);
    if (kind == 'f') CHECK(lock.l_type == F_UNLCK && lock.l_start == 5 && lock.l_len == 1);
    else CHECK(lock.l_type == F_WRLCK && lock.l_pid == holder && lock.l_start == 0 && lock.l_len == 0);
    if (strcmp(ending, "spin") == 0) {
      /* A handler interrupts the wait; with SA_RESTART the wait goes on, here
       * until another process kills the holder, which never calls the kernel
       * again. */
      alarm_in_50_ms(0);
      CHECK(take(kind, fd, 1, 1) == -1 && errno == EINTR && noted == SIGALRM);
      char target[16];
      snprintf(target, sizeof(target), "%d", (int)holder);
      const pid_t killer = start("kill", target, NULL, NULL);
      alarm_in_50_ms(SA_RESTART);
      CHECK(take(kind, fd, 1, 1) == 0 && noted == SIGALRM);
      CHECK(ended(killer) == 0);
      const int status = ended(holder);
      CHECK(WIFSIGNALED(status) && WTERMSIG(status) == SIGKILL);
    } else {
      tell(ORDER, 'G');
      CHECK(take(kind, fd, 1, 1) == 0);
      /* The holder had reached its release: nothing was handed over early. */
      struct pollfd news = {NEWS, POLLIN, 0};
      CHECK(poll(&news, 1, 0) == 1);
      hear(NEWS, 'U');
      if (index < 2) {
        int status;
        CHECK(waitpid(holder, &status, WNOHANG) == 0);
        tell(ORDER, 'G');
      }
      const int status = ended(holder);
      CHECK(WIFEXITED(status) && WEXITSTATUS(status) == (strcmp(ending, "trap") == 0 ? 126 : 0));
    }
    CHECK(drop(kind, fd) == 0);
  }
  /* Shared joins shared, and exclusive is refused while another shares. A
   * refused record lock changes nothing; a refused flock conversion leaves
   * the description without a lock. */
  const pid_t holder = start("hold", name, "s", "exit");
  hear(NEWS, 'R');
  CHECK(take(kind, fd, 0, 0) == 0);
  CHECK(take(kind, fd, 1, 0) == -1 && errno == EWOULDBLOCK);
  tell(ORDER, 'G');
  hear(NEWS, 'U');
  CHECK(ended(holder) == 0);
  if (kind == 'r') {
    expect("RRRR", 3, 0, 0);
  } else {
    int other = open(path, O_RDWR);
    CHECK(other >= 0 && flock(other, LOCK_EX | LOCK_NB) == 0 && close(other) == 0);
  }
  CHECK(close(fd) == 0);
}

/* A flock belongs to the open file description a spawned child inherits. */
static void inheritance(void) {
  int fd = open(path, O_RDWR), other = open(path, O_RDWR);
  char number[16];
  CHECK(fd >= 0 && other >= 0);
  snprintf(number, sizeof(number), "%d", fd);
  /* The child holds its parent's lock, and unlocks it for both. */
  CHECK(flock(fd, LOCK_EX) == 0);
  CHECK(ended(start("inherit", number, "unlock", NULL)) == 0);
  CHECK(flock(other, LOCK_EX | LOCK_NB) == 0 && flock(other, LOCK_UN) == 0);
  /* The lock a child takes outlives it while the parent has the description. */
  CHECK(ended(start("inherit", number, "lock", NULL)) == 0);
  CHECK(flock(other, LOCK_EX | LOCK_NB) == -1 && errno == EWOULDBLOCK);
  /* And the parent's lock outlives its descriptor while a child has it. */
  const pid_t keeper = start("inherit", number, "keep", NULL);
  hear(NEWS, 'R');
  CHECK(close(fd) == 0);
  CHECK(flock(other, LOCK_EX | LOCK_NB) == -1 && errno == EWOULDBLOCK);
  tell(ORDER, 'G');
  CHECK(flock(other, LOCK_EX) == 0);
  struct pollfd news = {NEWS, POLLIN, 0};
  CHECK(poll(&news, 1, 0) == 1);
  hear(NEWS, 'U');
  CHECK(ended(keeper) == 0 && close(other) == 0);
}

#ifdef __dolly__
/* The kernel holds 1024 locks; a request that needs one more changes nothing. */
static void limit(void) {
  int fd = open(path, O_RDWR), count = 1;
  CHECK(fd >= 0 && record(fd, F_SETLK, F_WRLCK, 100000, 3) == 0);
  while (record(fd, F_SETLK, F_WRLCK, 2 * count, 1) == 0) ++count;
  CHECK(errno == ENOLCK && count == 1024);
  CHECK(record(fd, F_SETLK, F_UNLCK, 100001, 1) == -1 && errno == ENOLCK);
  CHECK(flock(fd, LOCK_SH | LOCK_NB) == -1 && errno == ENOLCK);
  CHECK(record(fd, F_SETLK, F_UNLCK, 100000, 3) == 0 && flock(fd, LOCK_SH | LOCK_NB) == 0);
  CHECK(close(fd) == 0);
}
#endif

int main(int argc, char **argv) {
  program = argv[0];
  if (argc > 1) {
    path = argv[1];
    return child(argc, argv);
  }
  char file[64];
  snprintf(file, sizeof(file), "/tmp/process-locks-%d", (int)getpid());
  path = file;
  int fd = open(path, O_RDWR | O_CREAT | O_TRUNC, 0600), news[2], orders[2];
  CHECK(fd >= 0 && write(fd, "12345678", 8) == 8 && close(fd) == 0);
  CHECK(pipe(news) == 0 && pipe(orders) == 0);
  CHECK(dup2(news[0], NEWS) == NEWS && dup2(news[1], REPORT) == REPORT);
  CHECK(dup2(orders[0], GO) == GO && dup2(orders[1], ORDER) == ORDER);
  CHECK(close(news[0]) == 0 && close(news[1]) == 0 && close(orders[0]) == 0 && close(orders[1]) == 0);
  invalid_requests();
  descriptions();
  ranges();
  for (const char *kind = "fr"; *kind; ++kind) {
    contend(*kind);
    rotate(*kind, 0, 100);
  }
  inheritance();
#ifdef __dolly__
  limit();
#endif
  CHECK(unlink(path) == 0);
  puts("PROCESS-LOCKS-OK");
  return 0;
}
