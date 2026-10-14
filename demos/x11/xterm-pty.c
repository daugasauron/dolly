/* xterm on Dolly, which has no fork: xterm runs in its own slave mode (-S)
 * on the master of a pseudo-terminal this program opens, and the shell, or
 * the command after -e, on its slave. Usage: xterm [xterm option...] [-e
 * command [argument...]]. SPDX-License-Identifier: MIT */
#include <pty.h>
#include <spawn.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/wait.h>
#include <termios.h>
#include <unistd.h>

extern char **environ;

static pid_t spawn(const char *path, char *argv[], int from, int to, int last) {
  posix_spawn_file_actions_t actions;
  posix_spawn_file_actions_init(&actions);
  for (int descriptor = to; descriptor <= last; descriptor++)
    posix_spawn_file_actions_adddup2(&actions, from, descriptor);
  pid_t pid;
  int error = posix_spawnp(&pid, path, &actions, NULL, argv, environ);
  posix_spawn_file_actions_destroy(&actions);
  if (error) {
    fprintf(stderr, "xterm: cannot start %s: %s\n", path, strerror(error));
    return -1;
  }
  return pid;
}

int main(int argc, char *argv[]) {
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
  while (length + 1 < sizeof(window) && read(slave, window + length, 1) == 1 && window[length] != '\n')
    length++;
  window[length] = 0;
  tcsetattr(slave, TCSANOW, &modes);
  char id[48];
  snprintf(id, sizeof(id), "%lu", strtoul(window, NULL, 16));
  setenv("WINDOWID", id, 1);
  setenv("TERM", "xterm-256color", 1);

  char *shell[] = {getenv("SHELL") ? getenv("SHELL") : "/bin/slop", NULL};
  char **command = options < argc - 1 ? argv + options + 1 : shell;
  pid_t program = spawn(command[0], command, slave, 0, 2);
  close(slave);
  int status = 1;
  if (program > 0) waitpid(program, &status, 0);
  /* The master reads EIO once the slave is gone, and xterm exits. */
  waitpid(emulator, NULL, 0);
  return WIFEXITED(status) ? WEXITSTATUS(status) : 1;
}
