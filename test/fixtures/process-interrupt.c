// Handles SIGINT as event loops do: the handler only notes the signal in a
// pipe, and the program shuts down after its blocking call returns.
// Usage: process-interrupt poll|read|wait|sleep|linger MARKER
// linger takes longer to shut down than a signalled child is given.
#define _GNU_SOURCE
#include <dolly/runtime.h>
#include <errno.h>
#include <fcntl.h>
#include <poll.h>
#include <signal.h>
#include <stdio.h>
#include <string.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

static int notes[2];

static void note(int number) {
  const char byte = (char)number;
  if (write(notes[1], &byte, 1) != 1) _exit(5);
}

int main(int argc, char **argv) {
  if (argc != 3) return 2;
  const char *blocked = argv[1];
  if (!strcmp(blocked, "child")) return sleep(30), 3;
  // Only the restarted read returns the handler's byte without EINTR.
  const struct sigaction action = {.sa_handler = note, .sa_flags = !strcmp(blocked, "read") ? SA_RESTART : 0};
  if (pipe(notes) || sigaction(SIGINT, &action, NULL)) return 2;
  char *child[] = {argv[0], "child", argv[2], NULL};
  const int pid = strcmp(blocked, "wait") ? 0 : dolly_spawn(argv[0], 3, child, 0, 1, 2);
  if (pid < 0) return 2;
  puts("INTERRUPT-READY");
  fflush(stdout);

  char byte = 0;
  int interrupted;
  if (!strcmp(blocked, "read")) {
    interrupted = read(notes[0], &byte, 1) == 1;
  } else if (!strcmp(blocked, "wait")) {
    interrupted = waitpid(pid, NULL, 0) == -1 && errno == EINTR;
  } else if (!strcmp(blocked, "sleep")) {
    const struct timespec delay = {30, 0};
    interrupted = nanosleep(&delay, NULL) == -1 && errno == EINTR;
  } else {
    struct pollfd ready = {notes[0], POLLIN, 0};
    interrupted = poll(&ready, 1, -1) == -1 && errno == EINTR && poll(&ready, 1, -1) == 1;
  }
  if (!interrupted) return 4;
  if (!byte && read(notes[0], &byte, 1) != 1) return 6;
  if (byte != SIGINT) return 6;
  /* Shutdown work between the handler and the exit. */
  usleep(!strcmp(blocked, "linger") ? 2000000 : 50000);
  const int marker = open(argv[2], O_WRONLY | O_CREAT | O_EXCL, 0600);
  return marker < 0 || close(marker) ? 7 : 0;
}
