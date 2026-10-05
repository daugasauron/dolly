// Dolly has no fork/exec: commands which start another program resolve it on
// PATH and run it through the kernel's spawn/wait contract.
#ifndef DOLLY_RUN_PROGRAM_H
#define DOLLY_RUN_PROGRAM_H

#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>

#include <dolly/runtime.h>

extern char **environ;

static int regular_file(const char *path) {
  struct stat metadata;
  if (stat(path, &metadata) != 0) return 0;
  if (S_ISREG(metadata.st_mode)) return 1;
  errno = EACCES;
  return 0;
}

// Returns a malloc'd path as found on the search path, or NULL with errno set.
static char *find_program(const char *name, const char *search) {
  if (strchr(name, '/') != NULL) return regular_file(name) ? strdup(name) : NULL;
  if (search == NULL) search = "/bin:/usr/bin";
  for (const char *entry = search;;) {
    const size_t length = strcspn(entry, ":");
    const size_t size = length + strlen(name) + 3;
    char *candidate = malloc(size);
    if (candidate == NULL) return NULL;
    snprintf(candidate, size, "%.*s/%s", length == 0 ? 1 : (int)length,
             length == 0 ? "." : entry, name);
    if (regular_file(candidate)) return candidate;
    free(candidate);
    if (entry[length] == '\0') break;
    entry += length + 1;
  }
  errno = ENOENT;
  return NULL;
}

// Starts argv with this process's environment and inherited descriptors, as
// Slop starts a command. A timeout of -1 disables the deadline. Returns the
// pid, or a negative errno.
static int start_program(int argc, char **argv, const char *search,
                         double timeout_milliseconds) {
  char *found = find_program(argv[0], search);
  char *path = found != NULL && found[0] != '/' ? realpath(found, NULL) : found;
  if (path != found) free(found);
  if (path == NULL) return -errno;
  char *empty[] = {NULL};
  const int pid = dolly_spawn_mapped(path, argc, argv,
                                     environ == NULL ? empty : environ, NULL,
                                     DOLLY_PROCESS_INHERIT_FDS_ALL, NULL, 0,
                                     timeout_milliseconds);
  free(path);
  return pid;
}

// Runs argv to completion. Returns the program's status, or reports why it
// could not run and returns 127 (not found) or 126.
static inline int run_program(const char *self, int argc, char **argv,
                              const char *search, double timeout_milliseconds) {
  const int pid = start_program(argc, argv, search, timeout_milliseconds);
  int status = 126;
  const int result = pid < 0 ? pid : dolly_wait(pid, &status);
  if (result < 0) fprintf(stderr, "%s: %s: %s\n", self, argv[0], strerror(-result));
  return result == -ENOENT ? 127 : result < 0 ? 126 : status;
}

#endif
