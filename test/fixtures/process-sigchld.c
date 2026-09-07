#define _GNU_SOURCE
#include <dolly/process.h>
#include <dolly/runtime.h>
#include <errno.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

#define CHECK(test) do { if (!(test)) { fprintf(stderr, "SIGCHLD FAIL %d: %s errno=%d\n", \
    __LINE__, #test, errno); exit(1); } } while (0)

__attribute__((import_module("dolly_process_0"), import_name("call")))
int64_t raw_process_call(uint32_t, const void *, uint64_t, void *, uint64_t);

static volatile sig_atomic_t received, child, waited, child_status;
static int wake_writer = -1;

static void child_ready(int number) {
  received += number == SIGCHLD;
  if (wake_writer >= 0) {
    int status = 0;
    waited = waitpid(child, &status, WNOHANG);
    child_status = status;
    (void)write(wake_writer, "R", 1);
  }
}

static int spawn_child(char *path, char *mode) {
  char *arguments[] = {path, mode, NULL};
  int pid = dolly_spawn(path, 2, arguments, 0, 1, 2);
  CHECK(pid > 0);
  return pid;
}

int main(int argc, char **argv) {
  if (argc == 2 && !strcmp(argv[1], "quiet")) { usleep(100000); return 7; }
  if (argc == 2 && !strcmp(argv[1], "pending-exit")) {
    spawn_child(argv[0], "quiet");
    struct timespec now;
    CHECK(clock_gettime(CLOCK_MONOTONIC, &now) == 0);
    dolly_process_clock_sleep_request sleep = {
        .clock_id = 1, .deadline_nanoseconds = (uint64_t)now.tv_sec * 1000000000u + now.tv_nsec + 2000000000u};
    CHECK(raw_process_call(DOLLY_PROCESS_CLOCK_SLEEP, &sleep, sizeof(sleep), NULL, 0) == -EINTR);
    /* Leave the kernel notification pending: it must not change normal exit. */
    dolly_exit(23);
  }
  CHECK(argc == 1);
  int status, pid = spawn_child(argv[0], "quiet");
  CHECK(waitpid(pid, &status, 0) == pid && WIFEXITED(status) && WEXITSTATUS(status) == 7);
  pid = spawn_child(argv[0], "pending-exit");
  CHECK(waitpid(pid, &status, 0) == pid && WIFEXITED(status) && WEXITSTATUS(status) == 23);

  int wake[2];
  CHECK(pipe(wake) == 0);
  wake_writer = wake[1];
  struct sigaction action = {.sa_handler = child_ready, .sa_flags = SA_RESTART}, previous;
  CHECK(sigaction(SIGCHLD, &action, &previous) == 0);
  child = spawn_child(argv[0], "quiet");
  char byte;
  CHECK(read(wake[0], &byte, 1) == 1 && byte == 'R');
  CHECK(received == 1 && waited == child && WIFEXITED(child_status) && WEXITSTATUS(child_status) == 7);
  CHECK(close(wake[0]) == 0 && close(wake[1]) == 0);
  wake_writer = -1;

  received = 0;
  sigset_t mask, old_mask, pending;
  sigemptyset(&mask);
  sigaddset(&mask, SIGCHLD);
  CHECK(sigprocmask(SIG_BLOCK, &mask, &old_mask) == 0);
  pid = spawn_child(argv[0], "quiet");
  CHECK(waitpid(pid, &status, 0) == pid && WIFEXITED(status) && WEXITSTATUS(status) == 7);
  CHECK(received == 0 && sigpending(&pending) == 0 && sigismember(&pending, SIGCHLD) == 1);
  CHECK(sigprocmask(SIG_SETMASK, &old_mask, NULL) == 0 && received == 1);
  CHECK(sigaction(SIGCHLD, &previous, NULL) == 0);
  puts("PROCESS-SIGCHLD-OK");
  return 0;
}
