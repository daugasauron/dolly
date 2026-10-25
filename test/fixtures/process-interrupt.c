// Handles SIGINT as event loops do: the handler only notes the signal in a
// pipe, and the program shuts down after its blocking call returns. With
// "key" the interrupt key is C-g, as Emacs sets it (VQUIT too): Ctrl+C is then
// read as its byte, and C-g interrupts.
// Usage: process-interrupt poll|read|wait|sleep|key MARKER
#define _GNU_SOURCE
#include <dolly/runtime.h>
#include <errno.h>
#include <fcntl.h>
#include <poll.h>
#include <signal.h>
#include <stdio.h>
#include <string.h>
#include <sys/wait.h>
#include <termios.h>
#include <time.h>
#include <unistd.h>

static int notes[2];

static void note(int number) {
  const char byte = (char)number;
  if (write(notes[1], &byte, 1) != 1) _exit(5);
}

static int checked_key(void) {
  struct termios keys;
  if (tcgetattr(STDIN_FILENO, &keys)) return 2;
  keys.c_lflag &= ~(tcflag_t)(ICANON | ECHO);
  keys.c_cc[VINTR] = keys.c_cc[VQUIT] = 7;
  if (tcsetattr(STDIN_FILENO, TCSANOW, &keys) || tcgetattr(STDIN_FILENO, &keys) || keys.c_cc[VINTR] != 7) return 8;
  puts("INTERRUPT-READY");
  fflush(stdout);
  char byte = 0;
  if (read(STDIN_FILENO, &byte, 1) != 1 || byte != 3) return 9;
  puts("CTRL-C-READ");
  fflush(stdout);
  struct pollfd ready = {notes[0], POLLIN, 0};
  while (poll(&ready, 1, -1) == -1 && errno == EINTR) {}
  return read(notes[0], &byte, 1) == 1 && byte == SIGINT ? 0 : 4;
}

/* As Emacs does, the terminal's own keys come back on the way out. */
static int at_key(void) {
  struct termios saved;
  if (tcgetattr(STDIN_FILENO, &saved)) return 2;
  const int status = checked_key();
  return tcsetattr(STDIN_FILENO, TCSANOW, &saved) ? 10 : status;
}

int main(int argc, char **argv) {
  if (argc != 3) return 2;
  const char *blocked = argv[1];
  if (!strcmp(blocked, "child")) return sleep(30), 3;
  // Only the restarted read returns the handler's byte without EINTR.
  const struct sigaction action = {.sa_handler = note, .sa_flags = !strcmp(blocked, "read") ? SA_RESTART : 0};
  if (pipe(notes) || sigaction(SIGINT, &action, NULL)) return 2;
  if (!strcmp(blocked, "key")) {
    const int status = at_key();
    const int marker = status ? -1 : open(argv[2], O_WRONLY | O_CREAT | O_EXCL, 0600);
    return status ? status : marker < 0 || close(marker) ? 7 : 0;
  }
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
  usleep(50000);
  const int marker = open(argv[2], O_WRONLY | O_CREAT | O_EXCL, 0600);
  return marker < 0 || close(marker) ? 7 : 0;
}
