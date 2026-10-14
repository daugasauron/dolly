// A parent that ends without a say while its child and grandchild run: by a
// trap, by a call through a null pointer, or, in a loop that never enters the
// kernel, by its Worker's forced end after a SIGINT that they ignore. The
// child and grandchild outlive it and end once /tmp/process-tree-release
// exists. Usage: process-tree trap|null|spin
#include <dolly/runtime.h>
#include <signal.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>

int main(int argc, char **argv) {
  if (argc != 2) return 2;
  const char *mode = argv[1];
  if (!strcmp(mode, "child") || !strcmp(mode, "grandchild")) {
    signal(SIGINT, SIG_IGN);
    char *grandchild[] = {argv[0], "grandchild", NULL};
    // The grandchild's byte on the parent's pipe says that all three run.
    if (!strcmp(mode, "child") ? dolly_spawn(argv[0], 2, grandchild, 0, 1, 2) <= 0 : write(1, "G", 1) != 1) return 2;
    for (int tenth = 0; tenth < 300 && access("/tmp/process-tree-release", F_OK) != 0; ++tenth) usleep(100000);
    return 3;
  }
  int ready[2];
  char *child[] = {argv[0], "child", NULL};
  char byte;
  if (pipe(ready) || dolly_spawn(argv[0], 2, child, 0, ready[1], 2) <= 0 || close(ready[1]) ||
      read(ready[0], &byte, 1) != 1) return 2;
  puts("TREE-READY");
  fflush(stdout);
  void (*volatile null)(void) = NULL;
  if (!strcmp(mode, "trap")) __builtin_trap();
  if (!strcmp(mode, "null")) null();
  for (;;) __asm__ volatile("");
}
