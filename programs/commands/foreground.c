#include <errno.h>
#include <stdio.h>
#include <string.h>
#include <dolly/runtime.h>

int main(int argc, char **argv) {
  int first = 1;
  int interactive = 0;
  if (argc == 2 && strcmp(argv[1], "--help") == 0) {
    fputs("usage: foreground [-i] /absolute/program [ARG ...]\n", stdout);
    return 0;
  }
  if (first < argc && strcmp(argv[first], "-i") == 0) {
    interactive = 1;
    first++;
  }
  if (first == argc || argv[first][0] != '/') {
    fputs("usage: foreground [-i] /absolute/program [ARG ...]\n", stderr);
    return 2;
  }
  const int pid = dolly_spawn_foreground(argv[first], argc - first,
                                         argv + first, interactive);
  if (pid < 0) {
    fprintf(stderr, "foreground: %s: %s\n", argv[first], strerror(-pid));
    return pid == -ENOENT ? 127 : 126;
  }
  int status;
  const int waited = dolly_wait(pid, &status);
  if (waited < 0) {
    fprintf(stderr, "foreground: wait: %s\n", strerror(-waited));
    return 126;
  }
  return status;
}
