#define _GNU_SOURCE
#include <dolly/runtime.h>
#include <dolly/process.h>
#include <errno.h>
#include <fcntl.h>
#include <poll.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <grp.h>
#include <pthread.h>
#include <pwd.h>
#include <sys/mman.h>
#include <sys/resource.h>
#include <sys/times.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

static int failures;
#define CHECK(condition) do { if (!(condition)) { \
  fprintf(stderr, "LIFECYCLE FAIL line %d: %s (errno %d)\n", __LINE__, #condition, errno); \
  ++failures; } } while (0)

static double now(void) {
  struct timespec value;
  clock_gettime(CLOCK_MONOTONIC, &value);
  return value.tv_sec + value.tv_nsec / 1e9;
}

/* SIGCHLD: a child has exited and its Worker is retired. */
static volatile sig_atomic_t retired;
static void child_retired(int number) { retired += number == SIGCHLD; }

static void abort_exits(int number) { _exit(number == SIGABRT ? 77 : 1); }
static void abort_returns(int number) { (void)number; }

static int child(const char *path, const char *mode) {
  int output[2];
  if (pipe(output) != 0) return -1;
  char *arguments[] = {(char *)path, (char *)mode, NULL};
  const int pid = dolly_spawn(path, 2, arguments, 0, output[1], 2);
  close(output[1]);
  if (pid >= 0) {
    FILE *stream = fdopen(output[0], "r");
    int reported_pid = -1, parent = -1;
    CHECK(fscanf(stream, "%d %d", &reported_pid, &parent) == 2);
    CHECK(reported_pid == pid);
    CHECK(parent == getpid());
    fclose(stream);
  } else close(output[0]);
  return pid;
}

/* The lines of /proc/processes that contain `text`, every line for "". */
static int listed(const char *text) {
  FILE *list = fopen("/proc/processes", "r");
  if (list == NULL) return -1;
  int count = 0;
  for (char line[4096]; fgets(line, sizeof(line), list) != NULL;) count += strstr(line, text) != NULL;
  fclose(list);
  return count;
}

static int read_byte(int descriptor, char expected) {
  struct pollfd ready = {descriptor, POLLIN, 0};
  if (poll(&ready, 1, 5000) != 1) return 0;
  char byte;
  return read(descriptor, &byte, 1) == 1 && byte == expected;
}

static int foreground_child(const char *path, const char *mode) {
  if (strcmp(mode, "foreground-exit") == 0) return 0;
  char directory[4096];
  CHECK(getcwd(directory, sizeof(directory)) != NULL && strcmp(directory, "/tmp") == 0);
  const char *value = getenv("DOLLY_LIFECYCLE_FOREGROUND");
  CHECK(value != NULL && strcmp(value, "inherited") == 0);
  if (strcmp(mode, "foreground-leaf") == 0) {
    CHECK(read_byte(0, 'y'));
    CHECK(write(1, "L", 1) == 1 && write(2, "E", 1) == 1);
    return failures ? 1 : 23;
  }
  CHECK(strcmp(mode, "foreground-root") == 0);
  CHECK(write(1, "R", 1) == 1);
  CHECK(read_byte(0, 'x'));
  for (int index = 0; index < 2; ++index) {
    char *arguments[] = {(char *)path, "foreground-leaf", NULL};
    const int pid = dolly_spawn_foreground(path, 2, arguments, 0);
    CHECK(pid > 0);
    if (pid <= 0) return 1;
    int status = -1;
    CHECK(waitpid(pid, &status, 0) == pid);
    CHECK(WIFEXITED(status) && WEXITSTATUS(status) == 23);
  }
  CHECK(write(1, "F", 1) == 1);
  return failures ? 1 : 37;
}

static void foreground(const char *path) {
  char *arguments[] = {(char *)path, "foreground-exit", NULL};
  CHECK(dolly_spawn_foreground(path, 2, arguments, 2) == -EINVAL);
  CHECK(dolly_spawn_foreground("/no-such-lifecycle-command", 2, arguments, 0) == -ENOENT);
  const size_t path_size = strlen(path), mode_size = strlen(arguments[1]) + 1;
  dolly_process_spawn_request request = {
    .argument_count = 2, .path_size = path_size,
    .argument_bytes = path_size + 1 + mode_size, .deadline_nanoseconds = UINT64_MAX,
  };
  const size_t packet_size = sizeof(request) + path_size + request.argument_bytes;
  unsigned char *packet = malloc(packet_size);
  CHECK(packet != NULL);
  if (packet == NULL) return;
  memcpy(packet + sizeof(request), path, path_size);
  memcpy(packet + sizeof(request) + path_size, path, path_size + 1);
  memcpy(packet + sizeof(request) + 2 * path_size + 1, arguments[1], mode_size);
  const uint32_t invalid_flags[] = {DOLLY_PROCESS_SPAWN_INTERACTIVE, 1u << 31};
  for (unsigned index = 0; index < sizeof(invalid_flags) / sizeof(invalid_flags[0]); ++index) {
    request.flags = DOLLY_PROCESS_SPAWN_INHERIT_ENVIRONMENT | invalid_flags[index];
    memcpy(packet, &request, sizeof(request));
    dolly_process_spawn_response response;
    CHECK(dolly_process_call(DOLLY_PROCESS_SPAWN, packet, packet_size,
                            &response, sizeof(response)) == -EINVAL);
  }
  free(packet);

  int input[2], output[2], errors[2], saved[3];
  CHECK(pipe(input) == 0 && pipe(output) == 0 && pipe(errors) == 0);
  if (failures) return;
  for (int index = 0; index < 3; ++index) {
    saved[index] = dup(index);
    CHECK(saved[index] >= 0);
  }
  char directory[4096];
  CHECK(getcwd(directory, sizeof(directory)) != NULL);
  const char *value = getenv("DOLLY_LIFECYCLE_FOREGROUND");
  char *previous = value == NULL ? NULL : strdup(value);
  CHECK(value == NULL || previous != NULL);
  if (failures) return;
  CHECK(setenv("DOLLY_LIFECYCLE_FOREGROUND", "inherited", 1) == 0);
  CHECK(chdir("/tmp") == 0);
  CHECK(dup2(input[0], 0) == 0 && dup2(output[1], 1) == 1 && dup2(errors[1], 2) == 2);
  arguments[1] = "foreground-root";
  const int pid = dolly_spawn_foreground(path, 2, arguments, 1);
  for (int index = 0; index < 3; ++index) {
    CHECK(dup2(saved[index], index) == index && close(saved[index]) == 0);
  }
  CHECK(chdir(directory) == 0);
  CHECK(previous == NULL ? unsetenv("DOLLY_LIFECYCLE_FOREGROUND") == 0 :
        setenv("DOLLY_LIFECYCLE_FOREGROUND", previous, 1) == 0);
  free(previous);
  CHECK(close(input[0]) == 0 && close(output[1]) == 0 && close(errors[1]) == 0);
  CHECK(pid > 0);
  if (pid > 0) {
    CHECK(read_byte(output[0], 'R'));
    arguments[1] = "foreground-exit";
    CHECK(dolly_spawn_foreground(path, 2, arguments, 0) == -EBUSY);
    CHECK(write(input[1], "xyy", 3) == 3);
    int status = -1;
    CHECK(waitpid(pid, &status, 0) == pid);
    CHECK(WIFEXITED(status) && WEXITSTATUS(status) == 37);
    CHECK(read_byte(output[0], 'L') && read_byte(output[0], 'L') && read_byte(output[0], 'F'));
    CHECK(read_byte(errors[0], 'E') && read_byte(errors[0], 'E'));
  }
  CHECK(close(input[1]) == 0 && close(output[0]) == 0 && close(errors[0]) == 0);
  arguments[1] = "foreground-exit";
  const int restored = dolly_spawn_foreground(path, 2, arguments, 0);
  CHECK(restored > 0);
  if (restored > 0) {
    int status = -1;
    CHECK(waitpid(restored, &status, 0) == restored);
    CHECK(WIFEXITED(status) && WEXITSTATUS(status) == 0);
  }
}

int main(int argc, char **argv) {
  if (argc > 1) {
    if (strncmp(argv[1], "foreground-", 11) == 0) return foreground_child(argv[0], argv[1]);
    printf("%d %d\n", getpid(), getppid());
    fflush(stdout);
    if (strcmp(argv[1], "exit130") == 0) return 130;
    if (strcmp(argv[1], "cwd") == 0) {
      char directory[4096];
      return getcwd(directory, sizeof(directory)) != NULL && strcmp(directory, "/tmp") == 0 &&
          getenv("LIFECYCLE_SET") != NULL ? 0 : 1;
    }
    if (strcmp(argv[1], "orphans") == 0) {
      char *arguments[] = {argv[0], "foreground-exit", NULL};
      if (dolly_spawn(argv[0], 2, arguments, 0, 1, 2) <= 0) return 1;
      struct timespec delay = {0, 100000000};
      nanosleep(&delay, NULL); /* Leave a retired but unreaped child. */
      for (int index = 0; index < 4; ++index) {
        if (dolly_spawn(argv[0], 2, arguments, 0, 1, 2) <= 0) return 1;
      }
      return 0; /* Also abandon children still queued for launch. */
    }
    // Its child reads its parent, has it end and reads again.
    if (strcmp(argv[1], "adopting") == 0) {
      int ready[2];
      char *arguments[] = {argv[0], "adopted", NULL}, byte;
      if (pipe(ready) != 0 || dolly_spawn(argv[0], 2, arguments, 0, 1, ready[1]) <= 0 ||
          read(ready[0], &byte, 1) != 1) return 1;
      return 0;
    }
    if (strcmp(argv[1], "adopted") == 0) {
      const pid_t parent = getppid();
      if (write(2, "r", 1) != 1) return 1;
      pid_t now = parent;
      for (int tenth = 0; tenth < 50 && (now = getppid()) == parent; ++tenth) usleep(100000);
      printf("%d %d\n", parent, now);
      return 0;
    }
    // abort ends the process by SIGABRT, its handler run first: one that
    // exits ends it so, one that returns does not save it.
    if (strncmp(argv[1], "abort", 5) == 0) {
      if (argv[1][5] != 0) signal(SIGABRT, argv[1][6] == 'e' ? abort_exits : abort_returns);
      abort();
    }
    if (strcmp(argv[1], "self") == 0) { kill(getpid(), SIGTERM); return 99; }
    if (strcmp(argv[1], "checkpoint") == 0) for (;;) access("/", F_OK);
    if (strcmp(argv[1], "spin") == 0) for (;;) __asm__ volatile("");
    struct timespec delay = {30, 0};
    nanosleep(&delay, NULL);
    return 42;
  }
  CHECK(gettid() == getpid());
  /* Each process is its own group and its own session, which it leads, and
   * no terminal is a session's: there is no other group to join or name. */
  const pid_t own = getpid();
  CHECK(getpgrp() == own && getpgid(0) == own && getpgid(own) == own && getsid(0) == own);
  CHECK(setpgid(0, 0) == 0 && setpgid(own, own) == 0 && kill(0, 0) == 0);
  errno = 0;
  CHECK(setpgid(0, own + 1) == -1 && errno == EPERM);
  errno = 0;
  CHECK(setsid() == -1 && errno == EPERM);
  errno = 0;
  CHECK(getpgid(INT32_MAX) == -1 && errno == ESRCH);
  errno = 0;
  CHECK(tcgetpgrp(0) == -1 && errno == ENOTTY);
  /* Memory is readable and writable and never executable: mprotect grants
   * that and nothing else, and a shared mapping granted write writes back. */
  char *page = aligned_alloc(65536, 65536);
  CHECK(page != NULL && mprotect(page, 65536, PROT_READ | PROT_WRITE) == 0);
  const int protections[] = {PROT_READ, PROT_NONE, PROT_READ | PROT_WRITE | PROT_EXEC};
  for (int index = 0; index < 3; ++index) {
    errno = 0;
    CHECK(mprotect(page, 65536, protections[index]) == -1 && errno == ENOTSUP);
  }
  free(page);
  const int mapped = open("/tmp/lifecycle-mapped", O_RDWR | O_CREAT | O_TRUNC, 0600);
  CHECK(mapped >= 0 && write(mapped, "a", 1) == 1);
  char *shared = mmap(NULL, 1, PROT_READ, MAP_SHARED, mapped, 0);
  CHECK(shared != MAP_FAILED && mprotect(shared, 1, PROT_READ | PROT_WRITE) == 0);
  shared[0] = 'b';
  char written = 0;
  CHECK(msync(shared, 1, MS_SYNC) == 0 && pread(mapped, &written, 1, 0) == 1 && written == 'b');
  const int readable = open("/tmp/lifecycle-mapped", O_RDONLY);
  char *read_only = mmap(NULL, 1, PROT_READ, MAP_SHARED, readable, 0);
  errno = 0;
  CHECK(read_only != MAP_FAILED && mprotect(read_only, 1, PROT_READ | PROT_WRITE) == -1 && errno == EACCES);
  CHECK(munmap(shared, 1) == 0 && munmap(read_only, 1) == 0 && close(mapped) == 0 && close(readable) == 0 &&
        unlink("/tmp/lifecycle-mapped") == 0);
  /* One user, id 0: a process sets the ids it has, and no other. */
  CHECK(setuid(0) == 0 && setgid(0) == 0 && seteuid(0) == 0 && setegid(0) == 0);
  CHECK(setresuid(-1, 0, -1) == 0 && setreuid(0, 0) == 0);
  CHECK(setuid(1) == -1 && errno == EPERM);
  FILE *file = tmpfile();
  CHECK(file != NULL);
  if (file == NULL) return 1;
  CHECK(fputs("abc", file) >= 0);
  rewind(file);
  flockfile(file);
  CHECK(fgetc(file) == 'a');
  CHECK(ftell(file) == 1);
  CHECK(ftrylockfile(file) == 0);
  funlockfile(file);
  funlockfile(file);
  CHECK(fclose(file) == 0);
  const int pid = child(argv[0], "sleep");
  CHECK(pid > 0);
  if (pid <= 0) return 1;
  int status = -1;
  dolly_process_wait_request invalid_wait = {(uint32_t)pid, 2};
  dolly_process_wait_response response;
  CHECK(dolly_process_call(DOLLY_PROCESS_WAIT, &invalid_wait, sizeof(invalid_wait),
                          &response, sizeof(response)) == -EINVAL);
  dolly_process_exit_request invalid_exit = {0, SIGTERM};
  CHECK(dolly_process_call(DOLLY_PROCESS_EXIT, &invalid_exit, sizeof(invalid_exit), NULL, 0) == -EINVAL);
  const double started = now();
  CHECK(waitpid(pid, &status, WNOHANG) == 0);
  CHECK(now() - started < 0.5);
  CHECK(status == -1);
  CHECK(kill(pid, 0) == 0);
  errno = 0;
  CHECK(kill(pid, SIGUSR1) == -1 && errno == ENOTSUP);
  errno = 0;
  CHECK(kill(-1, SIGTERM) == -1 && errno == ENOTSUP);
  // The child is its own group: the group's signal and wait are its own.
  CHECK(getpgid(pid) == pid && getsid(pid) == pid && kill(-pid, SIGTERM) == 0);
  if (failures) return 1; /* The invocation boundary owns any remaining children. */
  CHECK(waitpid(-pid, &status, 0) == pid);
  CHECK(WIFSIGNALED(status) && WTERMSIG(status) == SIGTERM);
  errno = 0;
  CHECK(waitpid(pid, &status, WNOHANG) == -1 && errno == ECHILD);
  errno = 0;
  CHECK(kill(pid, 0) == -1 && errno == ESRCH);

  const int exited = child(argv[0], "exit130");
  // Until it is waited for, a child that has exited is there to signal.
  usleep(300000);
  CHECK(kill(exited, 0) == 0 && kill(exited, SIGTERM) == 0);
  CHECK(waitpid(exited, &status, 0) == exited);
  CHECK(WIFEXITED(status) && WEXITSTATUS(status) == 130);
  const int any = child(argv[0], "exit130");
  CHECK(waitpid(-1, &status, 0) == any && WEXITSTATUS(status) == 130);
  struct rusage child_usage;
  memset(&child_usage, 0xff, sizeof(child_usage));
  const int timed = child(argv[0], "exit130");
  CHECK(wait4(timed, &status, 0, &child_usage) == timed && WEXITSTATUS(status) == 130 &&
        child_usage.ru_utime.tv_sec == 0 && child_usage.ru_stime.tv_usec == 0);
  status = system("exit 3");
  CHECK(WIFEXITED(status) && WEXITSTATUS(status) == 3);
  const int aborted = child(argv[0], "abort"), handled = child(argv[0], "abort-exits"),
      returned = child(argv[0], "abort-returns");
  CHECK(waitpid(aborted, &status, 0) == aborted && WIFSIGNALED(status) && WTERMSIG(status) == SIGABRT);
  CHECK(waitpid(handled, &status, 0) == handled && WIFEXITED(status) && WEXITSTATUS(status) == 77);
  CHECK(waitpid(returned, &status, 0) == returned && WIFSIGNALED(status) && WTERMSIG(status) == SIGABRT);
  CHECK(waitpid(-1, &status, 0x1000) == -1 && errno == EINVAL);
  // One priority, nice 0, and limits that are what they are.
  CHECK(getpriority(PRIO_PROCESS, 0) == 0 && nice(0) == 0 &&
        setpriority(PRIO_PROCESS, 0, 5) == -1 && errno == EPERM);
  struct rlimit files;
  CHECK(getrlimit(RLIMIT_NOFILE, &files) == 0 && setrlimit(RLIMIT_NOFILE, &files) == 0);
  files.rlim_cur = 64;
  CHECK(setrlimit(RLIMIT_NOFILE, &files) == -1 && errno == EPERM);
  // popen's "e" gives the caller's end FD_CLOEXEC.
  FILE *closing = popen("true", "re"), *kept = popen("true", "r");
  CHECK(closing != NULL && kept != NULL && fcntl(fileno(closing), F_GETFD) == FD_CLOEXEC &&
        fcntl(fileno(kept), F_GETFD) == 0 && pclose(closing) == 0 && pclose(kept) == 0);
  const int spinning = child(argv[0], "spin");
  CHECK(kill(spinning, SIGKILL) == 0);
  CHECK(waitpid(spinning, &status, 0) == spinning);
  CHECK(WIFSIGNALED(status) && WTERMSIG(status) == SIGKILL);
  char directory[4096], after[4096];
  CHECK(getcwd(directory, sizeof(directory)) != NULL);
  char *cwd_arguments[] = {argv[0], "cwd", NULL};
  // No environment is the one this process has now.
  CHECK(setenv("LIFECYCLE_SET", "1", 1) == 0);
  const int cwd_child = dolly_spawn_env_cwd(argv[0], 2, cwd_arguments, NULL, "/tmp", 0, 1, 2, -1);
  CHECK(cwd_child > 0);
  CHECK(getcwd(after, sizeof(after)) != NULL && strcmp(after, directory) == 0);
  CHECK(waitpid(cwd_child, &status, 0) == cwd_child && WIFEXITED(status) && WEXITSTATUS(status) == 0);
  CHECK(dolly_spawn_env_cwd(argv[0], 2, cwd_arguments, NULL, "/dev/null", 0, 1, 2, -1) == -ENOTDIR);
  for (int index = 0; index < 2; ++index) {
    const int interrupted = child(argv[0], index == 0 ? "sleep" : "checkpoint");
    CHECK(kill(interrupted, SIGINT) == 0);
    CHECK(waitpid(interrupted, &status, 0) == interrupted);
    CHECK(WIFSIGNALED(status) && WTERMSIG(status) == SIGINT);
  }
  const int self = child(argv[0], "self");
  CHECK(waitpid(self, &status, 0) == self);
  CHECK(WIFSIGNALED(status) && WTERMSIG(status) == SIGTERM);
  char *arguments[] = {argv[0], "spin", NULL};
  const int pending = dolly_spawn(argv[0], 2, arguments, 0, 1, 2);
  CHECK(pending > 0);
  CHECK(kill(pending, SIGKILL) == 0);
  CHECK(waitpid(pending, &status, 0) == pending);
  CHECK(WIFSIGNALED(status) && WTERMSIG(status) == SIGKILL);
  if (failures) return 1;
  foreground(argv[0]);
  if (failures) return 1;
  for (int index = 0; index < 8; ++index) {
    const int orphan_parent = child(argv[0], "orphans");
    CHECK(orphan_parent > 0);
    CHECK(waitpid(orphan_parent, &status, 0) == orphan_parent);
    CHECK(WIFEXITED(status) && WEXITSTATUS(status) == 0);
    if (failures) return 1;
  }
  // A child whose parent ends has none from then on.
  int adoption[2];
  CHECK(pipe(adoption) == 0);
  char *adopting[] = {argv[0], "adopting", NULL};
  const int parent = dolly_spawn(argv[0], 2, adopting, 0, adoption[1], 2);
  CHECK(parent > 0 && close(adoption[1]) == 0);
  FILE *adopted = fdopen(adoption[0], "r");
  int first_parent = -1, last_parent = -1;
  // Each prints its pid and parent first: the adopting child, the adopted one.
  CHECK(fscanf(adopted, "%*d %*d %*d %*d %d %d", &first_parent, &last_parent) == 2 &&
        first_parent == parent && last_parent == 0);
  CHECK(fclose(adopted) == 0 && waitpid(parent, &status, 0) == parent && WIFEXITED(status) && WEXITSTATUS(status) == 0);
  // The children they abandoned live on, and are reaped when they end.
  for (int tenth = 0; tenth < 100 && listed(" foreground-exit") != 0; ++tenth) usleep(100000);
  CHECK(listed(" foreground-exit") == 0);
  // No more than RLIMIT_NPROC processes exist: the ones /proc/processes lists
  // and the exited ones nobody has waited for. A spawn past them is EAGAIN,
  // from the kernel's table when the others have exited unwaited and from the
  // supervisor while they run; waiting for them makes the room again.
  struct rlimit limit;
  CHECK(getrlimit(RLIMIT_NPROC, &limit) == 0);
  const int room = (int)limit.rlim_cur - listed("");
  const int quiet = open("/dev/null", O_WRONLY);
  char *sleep_arguments[] = {argv[0], "sleep", NULL}, *exit_arguments[] = {argv[0], "exit130", NULL};
  CHECK(signal(SIGCHLD, child_retired) != SIG_ERR);
  for (int running = 0; running < 2; ++running) {
    int held[limit.rlim_cur], count = 0, spawned = 0;
    while (count < (int)limit.rlim_cur &&
           (spawned = dolly_spawn(argv[0], 2, running ? sleep_arguments : exit_arguments, 0, quiet, 2)) > 0) {
      held[count++] = spawned;
      // A handler runs inside a kernel call only, so none is missed before the pause.
      while (!running && retired < count) pause();
    }
    CHECK(spawned == -EAGAIN && count == room);
    for (int index = 0; index < count; ++index) {
      if (running) CHECK(kill(held[index], SIGKILL) == 0);
      CHECK(waitpid(held[index], &status, 0) == held[index]);
    }
  }
  CHECK(signal(SIGCHLD, SIG_DFL) != SIG_ERR);
  close(quiet);
  const int after_cap = child(argv[0], "exit130");
  CHECK(after_cap > 0 && waitpid(after_cap, &status, 0) == after_cap);
  // A process's CPU time is its time since it started, all of it user time.
  struct timespec cpu;
  struct rusage usage;
  CHECK(clock_gettime(CLOCK_PROCESS_CPUTIME_ID, &cpu) == 0 && getrusage(RUSAGE_SELF, &usage) == 0);
  CHECK(usage.ru_stime.tv_sec == 0 && usage.ru_stime.tv_usec == 0 &&
        usage.ru_utime.tv_sec * 1000000LL + usage.ru_utime.tv_usec >= cpu.tv_sec * 1000000LL + cpu.tv_nsec / 1000);
  // times counts in clock ticks what getrusage reports.
  struct tms ticks;
  const clock_t elapsed = times(&ticks);
  const long tick = sysconf(_SC_CLK_TCK);
  CHECK(elapsed > 0 && ticks.tms_stime == 0 && ticks.tms_cutime == 0 && ticks.tms_cstime == 0 &&
        ticks.tms_utime >= cpu.tv_sec * tick && ticks.tms_utime <= elapsed);
  // waitid reports a child's exit, and nothing of one that never stops.
  const int waited = child(argv[0], "exit130");
  siginfo_t information;
  CHECK(waited > 0 && waitid(P_PID, waited, &information, WEXITED) == 0 &&
        information.si_pid == waited && information.si_code == CLD_EXITED && information.si_status == 130);
  CHECK(waitid(P_ALL, 0, &information, WSTOPPED) == -1 && errno == EINVAL);
  // No load average, no user database, no root or groups to change.
  double load[3];
  errno = 0;
  CHECK(getloadavg(load, 3) == -1 && getpwent() == NULL && getgrent() == NULL && errno == 0);
  CHECK(chroot("/") == -1 && errno == EPERM);
  // getdate reads the templates DATEMSK names, and there are none.
  CHECK(getdate("2026-10-23") == NULL && getdate_err == 1);
  // Thread attributes exist for a program that prepares them before
  // pthread_create, which refuses it without -pthread.
  pthread_attr_t attributes;
  CHECK(pthread_attr_init(&attributes) == 0 && pthread_attr_setstacksize(&attributes, 1 << 20) == 0 &&
        pthread_attr_destroy(&attributes) == 0);
  // The one thread there is is not cancelled.
  CHECK(pthread_cancel(pthread_self()) == ENOTSUP);
  // The kernel refuses a spawn deadline more than a day away.
  CHECK(dolly_spawn_timeout(argv[0], 2, sleep_arguments, 0, 1, 2, 2 * 86400e3) == -EINVAL);
  if (failures) return 1;
  puts("PROCESS-LIFECYCLE-OK");
  return 0;
}
