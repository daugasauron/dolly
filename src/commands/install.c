#define _POSIX_C_SOURCE 200809L

#include <errno.h>
#include <fcntl.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

static int verbose;

static void usage(FILE *stream) {
  fputs("usage: install [-cDpv] [-m MODE] [-o OWNER] [-g GROUP] SOURCE... DEST\n"
        "       install [-cDpv] [-m MODE] [-o OWNER] [-g GROUP] -t DIR SOURCE...\n"
        "       install [-dv] [-m MODE] DIRECTORY...\n"
        "Dolly has no permission or identity model; -m, -o, and -g are syntax-only.\n",
        stream);
}

static int directory(const char *path) {
  struct stat metadata;
  return stat(path, &metadata) == 0 && S_ISDIR(metadata.st_mode);
}

static int ensure_directory(const char *path) {
  if (mkdir(path, 0777) == 0) return 0;
  if (errno != EEXIST || !directory(path)) return -1;
  return 0;
}

static int create_parents(const char *path, int include_leaf) {
  const size_t length = strlen(path);
  if (length == 0) {
    errno = EINVAL;
    return -1;
  }
  char *copy = strdup(path);
  if (copy == NULL) return -1;
  size_t limit = length;
  if (!include_leaf) {
    char *slash = strrchr(copy, '/');
    if (slash == NULL) {
      free(copy);
      return 0;
    }
    while (slash > copy && slash[-1] == '/') slash--;
    if (slash == copy) {
      free(copy);
      return 0;
    }
    *slash = '\0';
    limit = (size_t)(slash - copy);
  }
  int status = 0;
  for (size_t index = 1; index < limit; index++) {
    if (copy[index] != '/') continue;
    copy[index] = '\0';
    if (copy[0] != '\0' && ensure_directory(copy) != 0) {
      status = -1;
      break;
    }
    copy[index] = '/';
  }
  if (status == 0 && ensure_directory(copy) != 0) status = -1;
  free(copy);
  return status;
}

static const char *base_name(const char *path) {
  const char *end = path + strlen(path);
  while (end > path + 1 && end[-1] == '/') end--;
  const char *base = end;
  while (base > path && base[-1] != '/') base--;
  return base;
}

static char *join_path(const char *directory_path, const char *name) {
  const size_t directory_length = strlen(directory_path);
  const size_t name_length = strlen(name);
  const int slash = directory_length != 0 && directory_path[directory_length - 1] != '/';
  if (directory_length > SIZE_MAX - name_length - (size_t)slash - 1) return NULL;
  char *path = malloc(directory_length + name_length + (size_t)slash + 1);
  if (path == NULL) return NULL;
  memcpy(path, directory_path, directory_length);
  size_t offset = directory_length;
  if (slash) path[offset++] = '/';
  memcpy(path + offset, name, name_length + 1);
  return path;
}

static int copy_file(const char *source, const char *destination,
                     int create_leading) {
  struct stat source_metadata;
  if (stat(source, &source_metadata) != 0) {
    fprintf(stderr, "install: %s: %s\n", source, strerror(errno));
    return 1;
  }
  if (!S_ISREG(source_metadata.st_mode)) {
    fprintf(stderr, "install: %s: not a regular file\n", source);
    return 1;
  }
  struct stat destination_metadata;
  if (stat(destination, &destination_metadata) == 0 &&
      source_metadata.st_dev == destination_metadata.st_dev &&
      source_metadata.st_ino == destination_metadata.st_ino) {
    fprintf(stderr, "install: %s and %s are the same file\n", source, destination);
    return 1;
  }
  if (create_leading && create_parents(destination, 0) != 0) {
    fprintf(stderr, "install: %s: %s\n", destination, strerror(errno));
    return 1;
  }

  const int input = open(source, O_RDONLY);
  if (input < 0) {
    fprintf(stderr, "install: %s: %s\n", source, strerror(errno));
    return 1;
  }
  const int output = open(destination, O_WRONLY | O_CREAT | O_TRUNC, 0666);
  if (output < 0) {
    fprintf(stderr, "install: %s: %s\n", destination, strerror(errno));
    close(input);
    return 1;
  }
  int status = 0;
  unsigned char bytes[16384];
  for (;;) {
    ssize_t count = read(input, bytes, sizeof(bytes));
    if (count < 0 && errno == EINTR) continue;
    if (count < 0) {
      fprintf(stderr, "install: %s: %s\n", source, strerror(errno));
      status = 1;
      break;
    }
    if (count == 0) break;
    size_t offset = 0;
    while (offset < (size_t)count) {
      const ssize_t written = write(output, bytes + offset, (size_t)count - offset);
      if (written < 0 && errno == EINTR) continue;
      if (written <= 0) {
        fprintf(stderr, "install: %s: %s\n", destination,
                written == 0 ? "short write" : strerror(errno));
        status = 1;
        break;
      }
      offset += (size_t)written;
    }
    if (status != 0) break;
  }
  if (close(input) != 0 && status == 0) status = 1;
  if (close(output) != 0 && status == 0) status = 1;
  if (status == 0 && verbose) printf("%s -> %s\n", source, destination);
  return status;
}

int main(int argc, char **argv) {
  int directories = 0;
  int create_leading = 0;
  int no_target_directory = 0;
  const char *target_directory = NULL;
  int first = 1;
  for (; first < argc; first++) {
    const char *option = argv[first];
    if (strcmp(option, "--") == 0) {
      first++;
      break;
    }
    if (strcmp(option, "--help") == 0) {
      usage(stdout);
      return 0;
    }
    if (strcmp(option, "-d") == 0 || strcmp(option, "--directory") == 0) {
      directories = 1;
    } else if (strcmp(option, "-D") == 0) {
      create_leading = 1;
    } else if (strcmp(option, "-T") == 0 ||
               strcmp(option, "--no-target-directory") == 0) {
      no_target_directory = 1;
    } else if (strcmp(option, "-v") == 0 || strcmp(option, "--verbose") == 0) {
      verbose = 1;
    } else if (strcmp(option, "-c") == 0 || strcmp(option, "-p") == 0) {
      // `-c` is historical. Dolly has no timestamps worth preserving with `-p`.
    } else if (strcmp(option, "-m") == 0 || strcmp(option, "-o") == 0 ||
               strcmp(option, "-g") == 0) {
      if (++first == argc) goto usage_error;
      // Accepted for unchanged Make install recipes; no metadata is created.
    } else if (strcmp(option, "-t") == 0 ||
               strcmp(option, "--target-directory") == 0) {
      if (++first == argc || target_directory != NULL) goto usage_error;
      target_directory = argv[first];
    } else if (strncmp(option, "--target-directory=", 19) == 0) {
      if (target_directory != NULL || option[19] == '\0') goto usage_error;
      target_directory = option + 19;
    } else if (option[0] == '-') {
      fprintf(stderr, "install: unsupported option: %s\n", option);
      return 2;
    } else {
      break;
    }
  }
  if (first == argc || (directories && (create_leading || target_directory != NULL ||
                                        no_target_directory))) goto usage_error;

  if (directories) {
    int status = 0;
    for (int index = first; index < argc; index++) {
      if (create_parents(argv[index], 1) != 0) {
        fprintf(stderr, "install: %s: %s\n", argv[index], strerror(errno));
        status = 1;
      } else if (verbose) {
        printf("created directory %s\n", argv[index]);
      }
    }
    return status;
  }

  const char *destination;
  int last_source;
  if (target_directory != NULL) {
    destination = target_directory;
    last_source = argc;
    if (!directory(destination)) {
      fprintf(stderr, "install: %s: not a directory\n", destination);
      return 1;
    }
  } else {
    if (argc - first < 2) goto usage_error;
    destination = argv[argc - 1];
    last_source = argc - 1;
  }

  const int destination_is_directory = !no_target_directory && directory(destination);
  if (last_source - first > 1 && !destination_is_directory) {
    fprintf(stderr, "install: %s: not a directory\n", destination);
    return 1;
  }
  int status = 0;
  for (int index = first; index < last_source; index++) {
    char *joined = destination_is_directory
                       ? join_path(destination, base_name(argv[index]))
                       : NULL;
    if (destination_is_directory && joined == NULL) {
      fputs("install: out of memory\n", stderr);
      return 1;
    }
    const char *target = joined == NULL ? destination : joined;
    if (copy_file(argv[index], target, create_leading) != 0) status = 1;
    free(joined);
  }
  return status;

usage_error:
  usage(stderr);
  return 2;
}
