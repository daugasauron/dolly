#include <stdio.h>

// How many jobs to run at once, for `make -j$(nproc)`: the width Dolly's own
// recipes give Make. Processes run in parallel Workers whatever a program's
// thread count is, and the browser's core count is never exposed. libc's
// sysconf counts threads instead: 1 without -pthread, this number with it
// (src/process/threads.c).
int main(void) {
  return puts("4") == EOF;
}
