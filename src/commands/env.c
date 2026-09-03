#define _POSIX_C_SOURCE 200809L

#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>

#include <dolly/runtime.h>

extern char **environ;

typedef struct {
  char **items;
  size_t count;
  size_t capacity;
} environment;

static void usage(FILE *stream) {
  fputs("usage: env [-i] [-0] [-u NAME] [NAME=VALUE ...] [command [arg ...]]\n",
        stream);
}

static void dispose_environment(environment *values) {
  for (size_t index = 0; index < values->count; ++index) free(values->items[index]);
  free(values->items);
  *values = (environment){0};
}

static int reserve(environment *values, size_t count) {
  if (count + 1 <= values->capacity) return 0;
  size_t capacity = values->capacity == 0 ? 32 : values->capacity;
  while (capacity < count + 1) {
    if (capacity > SIZE_MAX / 2) {
      errno = ENOMEM;
      return -1;
    }
    capacity *= 2;
  }
  char **items = realloc(values->items, capacity * sizeof(*items));
  if (items == NULL) return -1;
  values->items = items;
  values->capacity = capacity;
  return 0;
}

static int append_copy(environment *values, const char *value) {
  if (reserve(values, values->count + 1) != 0) return -1;
  char *copy = strdup(value);
  if (copy == NULL) return -1;
  values->items[values->count++] = copy;
  values->items[values->count] = NULL;
  return 0;
}

static int name_matches(const char *entry, const char *name, size_t length) {
  return strncmp(entry, name, length) == 0 && entry[length] == '=';
}

static void unset_name(environment *values, const char *name) {
  const size_t length = strlen(name);
  for (size_t index = 0; index < values->count;) {
    if (!name_matches(values->items[index], name, length)) {
      index++;
      continue;
    }
    free(values->items[index]);
    memmove(values->items + index, values->items + index + 1,
            (values->count - index) * sizeof(*values->items));
    values->count--;
  }
}

static int valid_name(const char *name, size_t length) {
  if (length == 0) return 0;
  for (size_t index = 0; index < length; ++index) {
    if (name[index] == '=') return 0;
  }
  return 1;
}

static int set_assignment(environment *values, const char *assignment) {
  const char *equals = strchr(assignment, '=');
  if (equals == NULL) return 0;
  const size_t length = (size_t)(equals - assignment);
  if (!valid_name(assignment, length)) {
    fprintf(stderr, "env: invalid variable name: %s\n", assignment);
    return -1;
  }
  for (size_t index = 0; index < values->count; ++index) {
    if (!name_matches(values->items[index], assignment, length)) continue;
    char *copy = strdup(assignment);
    if (copy == NULL) return -1;
    free(values->items[index]);
    values->items[index] = copy;
    return 1;
  }
  return append_copy(values, assignment) == 0 ? 1 : -1;
}

static const char *get_value(const environment *values, const char *name) {
  const size_t length = strlen(name);
  for (size_t index = 0; index < values->count; ++index) {
    if (name_matches(values->items[index], name, length)) {
      return values->items[index] + length + 1;
    }
  }
  return NULL;
}

static int regular_file(const char *path) {
  struct stat metadata;
  return stat(path, &metadata) == 0 && S_ISREG(metadata.st_mode);
}

static char *resolve_command(const environment *values, const char *name) {
  if (strchr(name, '/') != NULL) return regular_file(name) ? strdup(name) : NULL;
  const char *search = get_value(values, "PATH");
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

int main(int argc, char **argv) {
  environment values = {0};
  for (size_t index = 0; environ[index] != NULL; ++index) {
    if (append_copy(&values, environ[index]) != 0) goto memory_error;
  }

  int nul = 0;
  int argument = 1;
  while (argument < argc) {
    const char *option = argv[argument];
    if (strcmp(option, "--") == 0) {
      argument++;
      break;
    }
    if (strcmp(option, "--help") == 0) {
      usage(stdout);
      dispose_environment(&values);
      return 0;
    }
    if (strcmp(option, "-") == 0 || strcmp(option, "-i") == 0 ||
        strcmp(option, "--ignore-environment") == 0) {
      dispose_environment(&values);
      argument++;
      continue;
    }
    if (strcmp(option, "-0") == 0 || strcmp(option, "--null") == 0) {
      nul = 1;
      argument++;
      continue;
    }
    const char *name = NULL;
    if (strcmp(option, "-u") == 0 || strcmp(option, "--unset") == 0) {
      if (++argument >= argc) {
        fputs("env: -u requires a variable name\n", stderr);
        dispose_environment(&values);
        return 2;
      }
      name = argv[argument];
    } else if (strncmp(option, "--unset=", 8) == 0) {
      name = option + 8;
    } else if (strncmp(option, "-u", 2) == 0 && option[2] != '\0') {
      name = option + 2;
    } else if (option[0] == '-' && strchr(option, '=') == NULL) {
      fprintf(stderr, "env: unsupported option: %s\n", option);
      usage(stderr);
      dispose_environment(&values);
      return 2;
    } else {
      break;
    }
    if (!valid_name(name, strlen(name))) {
      fprintf(stderr, "env: invalid variable name: %s\n", name);
      dispose_environment(&values);
      return 2;
    }
    unset_name(&values, name);
    argument++;
  }

  while (argument < argc && strchr(argv[argument], '=') != NULL) {
    if (set_assignment(&values, argv[argument]) < 0) goto memory_error;
    argument++;
  }

  if (argument == argc) {
    const int delimiter = nul ? '\0' : '\n';
    int failed = 0;
    for (size_t index = 0; index < values.count; ++index) {
      if (fputs(values.items[index], stdout) == EOF ||
          fputc(delimiter, stdout) == EOF) {
        failed = 1;
        break;
      }
    }
    if (fflush(stdout) == EOF) failed = 1;
    dispose_environment(&values);
    return failed;
  }

  char *path = resolve_command(&values, argv[argument]);
  if (path == NULL) {
    fprintf(stderr, "env: %s: command not found\n", argv[argument]);
    dispose_environment(&values);
    return 127;
  }
  char *empty_environment[] = {NULL};
  const int pid = dolly_spawn_env(path, argc - argument, argv + argument,
                                  values.items == NULL ? empty_environment
                                                       : values.items,
                                  0, 1, 2);
  free(path);
  if (pid < 0) {
    fprintf(stderr, "env: could not run %s: %s\n",
            argv[argument], strerror(-pid));
    dispose_environment(&values);
    return 126;
  }
  int status = 126;
  const int waited = dolly_wait(pid, &status);
  if (waited != 0) {
    fprintf(stderr, "env: could not wait for %s: %s\n",
            argv[argument], strerror(-waited));
    status = 126;
  }
  dispose_environment(&values);
  return status;

memory_error:
  fputs("env: out of memory\n", stderr);
  dispose_environment(&values);
  return 1;
}
