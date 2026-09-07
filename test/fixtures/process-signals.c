#define _GNU_SOURCE
#include <dolly/runtime.h>
#include <dolly/process.h>
#include <errno.h>
#include <fcntl.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

#define CHECK(test) do { if (!(test)) { fprintf(stderr, "SIGNAL FAIL %d: %s errno=%d\n", \
    __LINE__, #test, errno); exit(1); } } while (0)
static char lock_path[4096], exit_path[4096];
static const char *mode;
static volatile sig_atomic_t received;
static volatile sig_atomic_t depth, maximum_depth;

static void normal_exit(void) {
  int fd = open(exit_path, O_WRONLY | O_CREAT, 0666);
  if (fd >= 0) close(fd);
}

static void handler(int number) {
  ++received;
  if (!strcmp(mode, "defer")) {
    ++depth;
    if (depth > maximum_depth) maximum_depth = depth;
    if (received == 1) raise(number);
    --depth;
    return;
  }
  if (!strcmp(mode, "spin")) for (;;) __asm__ volatile("");
  if (!strcmp(mode, "return") || !strcmp(mode, "restart")) return;
  if (!strcmp(mode, "leaf")) usleep(100000);
  unlink(lock_path);
  if (!strcmp(mode, "exit")) exit(37);
  signal(number, SIG_DFL);
  raise(number);
}

static void information_handler(int number, siginfo_t *information, void *context) {
  received = number == SIGTERM && information->si_signo == number && context == NULL;
}

static void resize_handler(int number) {
  usleep(650000); /* Resize must not inherit the interrupt termination deadline. */
  received = number == SIGWINCH;
}

static double now(void) {
  struct timespec value;
  CHECK(clock_gettime(CLOCK_MONOTONIC, &value) == 0);
  return value.tv_sec + value.tv_nsec / 1e9;
}

static void wait_for_file(const char *path) {
  const double deadline = now() + 3;
  while (access(path, F_OK) != 0 && now() < deadline) usleep(10000);
  CHECK(access(path, F_OK) == 0);
}

int main(int argc, char **argv) {
  CHECK(argc >= 2);
  CHECK(snprintf(lock_path, sizeof(lock_path), "%s/signal.lock", argv[1]) < sizeof(lock_path));
  CHECK(snprintf(exit_path, sizeof(exit_path), "%s/atexit", argv[1]) < sizeof(exit_path));
  if (argc == 3 && (!strcmp(argv[2], "winch-exit") || !strcmp(argv[2], "winch-handler"))) {
    const int handled = !strcmp(argv[2], "winch-handler");
    if (handled) CHECK(signal(SIGWINCH, resize_handler) != SIG_ERR);
    CHECK(kill(getpid(), SIGWINCH) == 0);
    if (handled) {
      usleep(1);
      CHECK(received == 1);
    }
    dolly_exit(23);
  }
  if (argc == 3) {
    mode = argv[2];
    if (!strcmp(mode, "leaf")) snprintf(lock_path, sizeof(lock_path), "%s/leaf.lock", argv[1]);
    CHECK(atexit(normal_exit) == 0);
    struct sigaction action = {.sa_handler = handler,
      .sa_flags = !strcmp(mode, "restart") ? SA_RESTART : 0};
    if (!strcmp(mode, "ignore") || !strcmp(mode, "ignore-loop")) action.sa_handler = SIG_IGN;
    CHECK(sigaction(SIGINT, &action, NULL) == 0);
    CHECK(sigaction(SIGTERM, &action, NULL) == 0);
    int fd = open(lock_path, O_CREAT | O_WRONLY, 0666);
    CHECK(fd >= 0 && close(fd) == 0);
    if (!strcmp(mode, "tree")) {
      int output[2];
      CHECK(pipe(output) == 0);
      char *arguments[] = {argv[0], argv[1], "leaf", NULL};
      int pid = dolly_spawn(argv[0], 3, arguments, 0, output[1], 2);
      CHECK(pid > 0 && close(output[1]) == 0);
      char ready;
      CHECK(read(output[0], &ready, 1) == 1 && ready == 'R');
      CHECK(close(output[0]) == 0);
      printf("%d\n", pid);
      fflush(stdout);
    }
    CHECK(write(1, "R", 1) == 1);
    if (!strcmp(mode, "ignore-loop")) {
      puts("SIGNAL-IGNORE-READY");
      fflush(stdout);
      const double deadline = now() + 10;
      while (now() < deadline) usleep(10000);
      return 99;
    }
    if (!strcmp(mode, "restart")) {
      char byte;
      CHECK(read(0, &byte, 1) == 1 && byte == 'X' && received == 1);
    } else {
      struct timespec delay = {!strcmp(mode, "ignore") ? 0 : 10, 250000000}, remaining;
      const int result = nanosleep(&delay, &remaining);
      if (!strcmp(mode, "ignore")) CHECK(result == 0 && received == 0);
      else CHECK(result == -1 && errno == EINTR && received == 1 && remaining.tv_sec >= 9);
    }
    return 0;
  }

  for (int handled = 0; handled < 2; handled++) {
    char *resize_exit_arguments[] = {argv[0], argv[1], handled ? "winch-handler" : "winch-exit", NULL};
    int resize_exit_pid = dolly_spawn(argv[0], 3, resize_exit_arguments, 0, 1, 2);
    int resize_exit_status;
    CHECK(resize_exit_pid > 0 && waitpid(resize_exit_pid, &resize_exit_status, 0) == resize_exit_pid);
    CHECK(WIFEXITED(resize_exit_status) && WEXITSTATUS(resize_exit_status) == 23);
  }

  for (int number = SIGINT; number <= SIGTERM; number += SIGTERM - SIGINT) {
    const char *modes[] = {"reraise", "exit", "spin", "return", "restart", "ignore"};
    for (unsigned index = 0; index < sizeof(modes) / sizeof(modes[0]); ++index) {
      mode = modes[index];
      unlink(lock_path);
      unlink(exit_path);
      int input[2], output[2];
      CHECK(pipe(input) == 0 && pipe(output) == 0);
      char *arguments[] = {argv[0], argv[1], (char *)mode, NULL};
      const int pid = dolly_spawn(argv[0], 3, arguments, input[0], output[1], 2);
      CHECK(pid > 0 && close(input[0]) == 0 && close(output[1]) == 0);
      char ready;
      CHECK(read(output[0], &ready, 1) == 1 && ready == 'R');
      usleep(50000); /* Deliver while the child's read/sleep is blocked. */
      const double started = now();
      CHECK(kill(pid, number) == 0);
      if (!strcmp(mode, "restart")) {
        usleep(50000);
        CHECK(write(input[1], "X", 1) == 1);
      }
      int status;
      CHECK(waitpid(pid, &status, 0) == pid && now() - started < 3);
      if (!strcmp(mode, "reraise") || !strcmp(mode, "spin")) {
        CHECK(WIFSIGNALED(status) && WTERMSIG(status) == number);
        CHECK(access(exit_path, F_OK) == -1);
      } else {
        CHECK(WIFEXITED(status) && WEXITSTATUS(status) == (!strcmp(mode, "exit") ? 37 : 0));
        CHECK(access(exit_path, F_OK) == 0);
      }
      if (!strcmp(mode, "reraise") || !strcmp(mode, "exit")) CHECK(access(lock_path, F_OK) == -1);
      CHECK(close(input[1]) == 0 && close(output[0]) == 0);
    }
  }

  int output[2];
  CHECK(pipe(output) == 0);
  char *tree[] = {argv[0], argv[1], "tree", NULL};
  int parent = dolly_spawn(argv[0], 3, tree, 0, output[1], 2);
  CHECK(parent > 0 && close(output[1]) == 0);
  FILE *stream = fdopen(output[0], "r");
  int leaf, tree_status;
  CHECK(stream && fscanf(stream, "%d\n", &leaf) == 1 && fgetc(stream) == 'R');
  CHECK(fclose(stream) == 0);
  CHECK(kill(leaf, SIGINT) == 0 && kill(parent, SIGINT) == 0);
  CHECK(waitpid(parent, &tree_status, 0) == parent && WIFSIGNALED(tree_status) && WTERMSIG(tree_status) == SIGINT);
  char leaf_lock[4096];
  snprintf(leaf_lock, sizeof(leaf_lock), "%s/leaf.lock", argv[1]);
  CHECK(access(lock_path, F_OK) == -1 && access(leaf_lock, F_OK) == -1);

  mode = "return";
  received = 0;
  CHECK(signal(SIGTERM, handler) != SIG_ERR);
  sigset_t mask, previous;
  sigemptyset(&mask);
  sigaddset(&mask, SIGTERM);
  CHECK(sigprocmask(SIG_BLOCK, &mask, &previous) == 0);
  CHECK(raise(SIGTERM) == 0 && received == 0);
  sigset_t waiting;
  CHECK(sigpending(&waiting) == 0 && sigismember(&waiting, SIGTERM) == 1);
  CHECK(sigprocmask(SIG_SETMASK, &previous, NULL) == 0 && received == 1);
  CHECK(signal(SIGTERM, SIG_DFL) != SIG_ERR);
  CHECK(signal(SIGKILL, SIG_IGN) == SIG_ERR && errno == EINVAL);
  for (int flags = 0; flags <= 1; ++flags) {
    mode = "defer";
    received = depth = maximum_depth = 0;
    struct sigaction action = {.sa_handler = handler, .sa_flags = flags ? SA_NODEFER : 0};
    CHECK(sigaction(SIGTERM, &action, NULL) == 0 && raise(SIGTERM) == 0);
    CHECK(received == 2 && maximum_depth == (flags ? 2 : 1));
  }
  received = 0;
  struct sigaction action = {.sa_sigaction = information_handler, .sa_flags = SA_SIGINFO | SA_RESETHAND | SA_ONSTACK};
  CHECK(sigaction(SIGTERM, &action, NULL) == 0 && raise(SIGTERM) == 0 && received == 1);
  CHECK(sigaction(SIGTERM, NULL, &action) == 0 && action.sa_handler == SIG_DFL);
  CHECK(!(action.sa_flags & SA_SIGINFO));
  CHECK(sigaction(SIGKILL, NULL, &action) == 0 && action.sa_handler == SIG_DFL);
  action.sa_flags = SA_NOCLDWAIT;
  CHECK(sigaction(SIGTERM, &action, NULL) == -1 && errno == ENOTSUP);
  CHECK(sigtimedwait(&mask, NULL, NULL) == -1 && errno == ENOTSUP);
  int32_t number = SIGINT, waiting_signal;
  CHECK(dolly_process_call(DOLLY_PROCESS_SIGNAL_ACKNOWLEDGE, &number, sizeof(number),
      &waiting_signal, sizeof(waiting_signal)) == -EINVAL);

  char repository[4096], index_lock[4096];
  snprintf(repository, sizeof(repository), "%s/repo", argv[1]);
  snprintf(index_lock, sizeof(index_lock), "%s/.git/index.lock", repository);
  char *init[] = {"git", "init", "-q", repository, NULL};
  int pid = dolly_spawn("/usr/bin/git", 4, init, 0, 1, 2), status;
  CHECK(pid > 0 && waitpid(pid, &status, 0) == pid && status == 0);
  for (int number = SIGINT; number <= SIGTERM; number += SIGTERM - SIGINT) {
    int input[2];
    CHECK(pipe(input) == 0);
    char *arguments[] = {"git", "-C", repository, "update-index", "--index-info", NULL};
    pid = dolly_spawn("/usr/bin/git", 5, arguments, input[0], 1, 2);
    CHECK(pid > 0 && close(input[0]) == 0);
    wait_for_file(index_lock);
    CHECK(kill(pid, number) == 0);
    CHECK(waitpid(pid, &status, 0) == pid && WIFSIGNALED(status) && WTERMSIG(status) == number);
    CHECK(access(index_lock, F_OK) == -1 && close(input[1]) == 0);
  }
  unlink(lock_path);
  unlink(exit_path);
  puts("PROCESS-SIGNALS-OK");
  return 0;
}
