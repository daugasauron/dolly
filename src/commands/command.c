#define _POSIX_C_SOURCE 200809L

#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>

#include <dolly/runtime.h>

static void usage(FILE *stream) {
  fputs("usage: command [-p] COMMAND [ARG ...]\n"
        "       command [-p] -v NAME ...\n", stream);
}

static int regular_file(const char *path) {
  struct stat metadata;
  return stat(path, &metadata) == 0 && S_ISREG(metadata.st_mode);
}

static char *resolve_command(const char *name, int default_path) {
  if (strchr(name, '/') != NULL) {
    if (regular_file(name)) return strdup(name);
    errno = ENOENT;
    return NULL;
  }
  const char *search = default_path ? "/bin:/usr/bin" : getenv("PATH");
  if (search == NULL) search = "";
  const size_t name_length = strlen(name);
  const char *entry = search;
  do {
    const char *separator = strchr(entry, ':');
    const size_t entry_length = separator == NULL
                                    ? strlen(entry)
                                    : (size_t)(separator - entry);
    const char *directory = entry_length == 0 ? "." : entry;
    const size_t directory_length = entry_length == 0 ? 1 : entry_length;
    if (directory_length > SIZE_MAX - name_length - 2) {
      errno = ENAMETOOLONG;
      return NULL;
    }
    char *candidate = malloc(directory_length + name_length + 2);
    if (candidate == NULL) return NULL;
    memcpy(candidate, directory, directory_length);
    size_t offset = directory_length;
    if (candidate[offset - 1] != '/') candidate[offset++] = '/';
    memcpy(candidate + offset, name, name_length + 1);
    if (regular_file(candidate)) return candidate;
    free(candidate);
    if (separator == NULL) break;
    entry = separator + 1;
  } while (1);
  errno = ENOENT;
  return NULL;
}

int main(int argc, char **argv) {
  int argument = 1;
  int default_path = 0;
  int describe = 0;
  while (argument < argc) {
    if (strcmp(argv[argument], "--help") == 0) {
      usage(stdout);
      return 0;
    }
    if (strcmp(argv[argument], "--") == 0) {
      argument++;
      break;
    }
    if (strcmp(argv[argument], "-p") == 0) default_path = 1;
    else if (strcmp(argv[argument], "-v") == 0) describe = 1;
    else if (argv[argument][0] == '-') {
      fprintf(stderr, "command: unsupported option: %s\n", argv[argument]);
      return 2;
    } else {
      break;
    }
    argument++;
  }
  if (argument == argc) {
    usage(stderr);
    return 2;
  }

  if (describe) {
    int status = 0;
    for (; argument < argc; argument++) {
      char *path = resolve_command(argv[argument], default_path);
      if (path == NULL) {
        status = 1;
        continue;
      }
      puts(path);
      free(path);
    }
    return status;
  }

  char *path = resolve_command(argv[argument], default_path);
  if (path == NULL) {
    fprintf(stderr, "command: %s: %s\n", argv[argument], strerror(errno));
    return errno == ENOENT ? 127 : 126;
  }
  const int pid = dolly_spawn(path, argc - argument, argv + argument, 0, 1, 2);
  free(path);
  if (pid < 0) {
    fprintf(stderr, "command: spawn failed: %s\n", strerror(-pid));
    return 126;
  }
  int status;
  const int waited = dolly_wait(pid, &status);
  if (waited < 0) {
    fprintf(stderr, "command: wait failed: %s\n", strerror(-waited));
    return 126;
  }
  return status;
}
