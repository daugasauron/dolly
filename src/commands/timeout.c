#define _XOPEN_SOURCE 700

#include <math.h>

#include "run-program.h"

static void usage(FILE *stream) {
  fputs("usage: timeout DURATION COMMAND [ARG ...]\n"
        "DURATION accepts s, m, h, or d; 0 disables the timeout. Dolly "
        "terminates the process with status 124.\n", stream);
}

static int parse_duration(const char *text, double *milliseconds) {
  errno = 0;
  char *end = NULL;
  const double value = strtod(text, &end);
  if (end == text || errno == ERANGE || !isfinite(value) || value < 0) return -1;

  double multiplier = 1000.0;
  if (*end != '\0') {
    if (end[1] != '\0') return -1;
    switch (*end) {
      case 's': multiplier = 1000.0; break;
      case 'm': multiplier = 60.0 * 1000.0; break;
      case 'h': multiplier = 60.0 * 60.0 * 1000.0; break;
      case 'd': multiplier = 24.0 * 60.0 * 60.0 * 1000.0; break;
      default: return -1;
    }
  }
  if (value > 86400000.0 / multiplier) return -1;
  *milliseconds = value == 0 ? -1 : value * multiplier;
  return 0;
}

int main(int argc, char **argv) {
  int argument = 1;
  if (argument < argc && strcmp(argv[argument], "--help") == 0) {
    usage(stdout);
    return 0;
  }
  if (argument < argc && strcmp(argv[argument], "--") == 0) argument++;
  if (argument + 1 >= argc) {
    usage(stderr);
    return 125;
  }
  double milliseconds;
  if (parse_duration(argv[argument], &milliseconds) != 0) {
    fprintf(stderr, "timeout: invalid duration: %s\n", argv[argument]);
    return 125;
  }
  argument++;
  return run_program("timeout", argc - argument, argv + argument,
                     getenv("PATH"), milliseconds);
}
