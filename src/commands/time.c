#define _POSIX_C_SOURCE 200809L

#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <time.h>

#include <dolly/runtime.h>

static void usage(FILE *stream) {
  fputs("usage: time [-p] COMMAND [ARG ...]\n", stream);
}

static int regular_file(const char *path) {
  struct stat metadata;
  return stat(path, &metadata) == 0 && S_ISREG(metadata.st_mode);
}

static char *resolve_command(const char *name) {
  if (strchr(name, '/') != NULL) return regular_file(name) ? strdup(name) : NULL;
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

static double milliseconds(const struct timespec *value) {
  return (double)value->tv_sec * 1000.0 + (double)value->tv_nsec / 1000000.0;
}

int main(int argc, char **argv) {
  int argument = 1;
  if (argument < argc && strcmp(argv[argument], "--help") == 0) {
    usage(stdout);
    return 0;
  }
  if (argument < argc && strcmp(argv[argument], "-p") == 0) argument++;
  if (argument < argc && strcmp(argv[argument], "--") == 0) argument++;
  if (argument == argc) {
    usage(stderr);
    return 125;
  }

  char *path = resolve_command(argv[argument]);
  if (path == NULL) {
    fprintf(stderr, "time: %s: %s\n", argv[argument], strerror(errno));
    return errno == ENOENT ? 127 : 125;
  }

  struct timespec start;
  struct timespec end;
  if (clock_gettime(CLOCK_MONOTONIC, &start) != 0) {
    fprintf(stderr, "time: clock: %s\n", strerror(errno));
    free(path);
    return 125;
  }
  const int pid = dolly_spawn(path, argc - argument, argv + argument, 0, 1, 2);
  free(path);
  if (pid < 0) {
    fprintf(stderr, "time: spawn failed: %s\n", strerror(-pid));
    return 125;
  }
  int status;
  const int waited = dolly_wait(pid, &status);
  if (clock_gettime(CLOCK_MONOTONIC, &end) != 0) {
    fprintf(stderr, "time: clock: %s\n", strerror(errno));
    return 125;
  }
  if (waited < 0) {
    fprintf(stderr, "time: wait failed: %s\n", strerror(-waited));
    return 125;
  }
  fprintf(stderr, "real %.3f\n", (milliseconds(&end) - milliseconds(&start)) / 1000.0);
  return status;
}
