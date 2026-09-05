#define _POSIX_C_SOURCE 200809L
#define _XOPEN_SOURCE 700

#include <errno.h>
#include <limits.h>
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>

#include <dolly/runtime.h>

static void usage(FILE *stream) {
  fputs("usage: timeout DURATION COMMAND [ARG ...]\n"
        "DURATION accepts s, m, h, or d; Dolly terminates the process "
        "with status 124.\n", stream);
}

static int regular_file(const char *path) {
  struct stat metadata;
  return stat(path, &metadata) == 0 && S_ISREG(metadata.st_mode);
}

static char *resolve_command(const char *name) {
  if (strchr(name, '/') != NULL) {
    if (!regular_file(name)) return NULL;
    char absolute[PATH_MAX];
    return realpath(name, absolute) == NULL ? NULL : strdup(absolute);
  }
  const char *search = getenv("PATH");
  if (search == NULL) search = "/bin:/usr/bin";
  const size_t name_length = strlen(name);
  const char *entry = search;
  do {
    const char *separator = strchr(entry, ':');
    const size_t length = separator == NULL ? strlen(entry)
                                             : (size_t)(separator - entry);
    const char *directory = length == 0 ? "." : entry;
    const size_t directory_length = length == 0 ? 1 : length;
    if (directory_length <= SIZE_MAX - name_length - 2) {
      char *candidate = malloc(directory_length + name_length + 2);
      if (candidate == NULL) return NULL;
      memcpy(candidate, directory, directory_length);
      size_t offset = directory_length;
      if (candidate[offset - 1] != '/') candidate[offset++] = '/';
      memcpy(candidate + offset, name, name_length + 1);
      if (regular_file(candidate)) return candidate;
      free(candidate);
    }
    if (separator == NULL) break;
    entry = separator + 1;
  } while (1);
  errno = ENOENT;
  return NULL;
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
  *milliseconds = value * multiplier;
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

  char *path = resolve_command(argv[argument]);
  if (path == NULL) {
    fprintf(stderr, "timeout: %s: %s\n", argv[argument], strerror(errno));
    return errno == ENOENT ? 127 : 125;
  }

  const int child_argc = argc - argument;
  char **child_argv = argv + argument;
  const int pid = dolly_spawn_timeout(path, child_argc, child_argv,
                                      0, 1, 2, milliseconds);
  free(path);
  if (pid < 0) {
    fprintf(stderr, "timeout: spawn failed: %s\n", strerror(-pid));
    return 125;
  }

  int status;
  const int waited = dolly_wait(pid, &status);
  if (waited < 0) {
    fprintf(stderr, "timeout: wait failed: %s\n", strerror(-waited));
    return 125;
  }
  return status;
}
