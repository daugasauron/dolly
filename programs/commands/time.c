#define _XOPEN_SOURCE 700

#include <time.h>

#include "run-program.h"

static double seconds(void) {
  struct timespec now;
  clock_gettime(CLOCK_MONOTONIC, &now);
  return (double)now.tv_sec + (double)now.tv_nsec / 1e9;
}

int main(int argc, char **argv) {
  int argument = 1;
  if (argument < argc && strcmp(argv[argument], "--help") == 0) {
    fputs("usage: time [-p] COMMAND [ARG ...]\n", stdout);
    return 0;
  }
  if (argument < argc && strcmp(argv[argument], "-p") == 0) argument++;
  if (argument < argc && strcmp(argv[argument], "--") == 0) argument++;
  if (argument == argc) {
    fputs("usage: time [-p] COMMAND [ARG ...]\n", stderr);
    return 125;
  }
  const double start = seconds();
  const int status = run_program("time", argc - argument, argv + argument,
                                 getenv("PATH"), -1);
  fprintf(stderr, "real %.3f\n", seconds() - start);
  return status;
}
