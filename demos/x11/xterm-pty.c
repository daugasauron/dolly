/* xterm on Dolly, which has no fork: xterm runs in its own slave mode (-S)
 * on the master of a pseudo-terminal this program opens, and the shell, or
 * the command after -e, on its slave. Usage: xterm [xterm option...] [-e
 * command [argument...]]. SPDX-License-Identifier: MIT */
#include <pty.h>
#include <signal.h>
#include <spawn.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/wait.h>
#include <termios.h>
#include <unistd.h>

extern char **environ;

/* The program starts with SIGHUP's default, which this one ignores. */
static pid_t spawn(const char *path, char *argv[], int from, int to, int last) {
  posix_spawn_file_actions_t actions;
  posix_spawn_file_actions_init(&actions);
  for (int descriptor = to; descriptor <= last; descriptor++)
    posix_spawn_file_actions_adddup2(&actions, from, descriptor);
  posix_spawnattr_t attributes;
  posix_spawnattr_init(&attributes);
  sigset_t hangup;
  sigemptyset(&hangup);
  sigaddset(&hangup, SIGHUP);
  posix_spawnattr_setsigdefault(&attributes, &hangup);
  posix_spawnattr_setflags(&attributes, POSIX_SPAWN_SETSIGDEF);
  pid_t pid;
  int error = posix_spawnp(&pid, path, &actions, &attributes, argv, environ);
  posix_spawnattr_destroy(&attributes);
  posix_spawn_file_actions_destroy(&actions);
  if (error) {
    fprintf(stderr, "xterm: cannot start %s: %s\n", path, strerror(error));
    return -1;
  }
  return pid;
}

static int exit_status(pid_t pid) {
  int status;
  if (waitpid(pid, &status, 0) != pid) return 1;
  return WIFEXITED(status) ? WEXITSTATUS(status) : 1;
}

int main(int argc, char *argv[]) {
  /* xterm's end closes the master, which hangs up whoever holds the slave: this program too,
   * until it has started the program there. */
  signal(SIGHUP, SIG_IGN);
  int master, slave;
  char name[64];
  if (openpty(&master, &slave, name, NULL, NULL) != 0) {
    perror("xterm: openpty");
    return 1;
  }
  /* xterm's own options, then -S naming the master as its descriptor 3. */
  int options = 1;
  while (options < argc && strcmp(argv[options], "-e") != 0) options++;
  char slave_option[96];
  snprintf(slave_option, sizeof(slave_option), "-S%s/3", name);
  char **xterm = calloc((size_t)options + 2, sizeof(char *));
  xterm[0] = "xterm";
  for (int i = 1; i < options; i++) xterm[i] = argv[i];
  xterm[options] = slave_option;
  pid_t emulator = spawn("/usr/libexec/xterm", xterm, master, 3, 3);
  if (emulator < 0) return 1;
  close(master);

  /* xterm writes its window's id to the terminal first: read it unechoed. */
  struct termios modes, quiet;
  tcgetattr(slave, &modes);
  quiet = modes;
  quiet.c_lflag &= ~ECHO;
  tcsetattr(slave, TCSANOW, &quiet);
  char window[32] = "";
  size_t length = 0;
  ssize_t got = 0;
  while (length + 1 < sizeof(window) && (got = read(slave, window + length, 1)) == 1 && window[length] != '\n')
    length++;
  window[length] = 0;
  tcsetattr(slave, TCSANOW, &modes);
  /* No id: xterm ended without a window (-version, -help, a bad option, no
   * display), so its status is this command's and no program starts. */
  if (got != 1) {
    close(slave);
    return exit_status(emulator);
  }
  char id[48];
  snprintf(id, sizeof(id), "%lu", strtoul(window, NULL, 16));
  setenv("WINDOWID", id, 1);
  setenv("TERM", "xterm-256color", 1);

  char *shell[] = {getenv("SHELL") ? getenv("SHELL") : "/bin/slop", NULL};
  char **command = options < argc - 1 ? argv + options + 1 : shell;
  pid_t program = spawn(command[0], command, slave, 0, 2);
  close(slave);
  int status = program > 0 ? exit_status(program) : 1;
  /* The master reads EIO once the slave is gone, and xterm exits. */
  waitpid(emulator, NULL, 0);
  return status;
}
