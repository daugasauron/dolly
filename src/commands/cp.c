#define _POSIX_C_SOURCE 200809L
#define _XOPEN_SOURCE 700

#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

static int recursive;
static int verbose;

static const char *base_name(const char *path) {
  size_t length = strlen(path);
  while (length > 1 && path[length - 1] == '/') length--;
  const char *base = path + length;
  while (base > path && base[-1] != '/') base--;
  return base;
}

static char *join_path(const char *directory, const char *name) {
  const size_t directory_length = strlen(directory);
  const size_t name_length = strlen(name);
  const int slash = directory_length != 0 && directory[directory_length - 1] != '/';
  char *joined = malloc(directory_length + (size_t)slash + name_length + 1);
  if (joined == NULL) return NULL;
  memcpy(joined, directory, directory_length);
  if (slash) joined[directory_length] = '/';
  memcpy(joined + directory_length + (size_t)slash, name, name_length + 1);
  return joined;
}

static int copy_path(const char *source, const char *destination);

static int copy_regular(const char *source, const char *destination) {
  int input = open(source, O_RDONLY);
  if (input < 0) {
    fprintf(stderr, "cp: %s: %s\n", source, strerror(errno));
    return 1;
  }
  int output = open(destination, O_WRONLY | O_CREAT | O_TRUNC, 0666);
  if (output < 0) {
    fprintf(stderr, "cp: %s: %s\n", destination, strerror(errno));
    close(input);
    return 1;
  }

  int status = 0;
  unsigned char buffer[16384];
  for (;;) {
    ssize_t count = read(input, buffer, sizeof(buffer));
    if (count < 0 && errno == EINTR) continue;
    if (count < 0) {
      fprintf(stderr, "cp: %s: %s\n", source, strerror(errno));
      status = 1;
      break;
    }
    if (count == 0) break;
    size_t offset = 0;
    while (offset < (size_t)count) {
      ssize_t written = write(output, buffer + offset, (size_t)count - offset);
      if (written < 0 && errno == EINTR) continue;
      if (written <= 0) {
        fprintf(stderr, "cp: %s: %s\n", destination,
                written == 0 ? "short write" : strerror(errno));
        status = 1;
        break;
      }
      offset += (size_t)written;
    }
    if (status != 0) break;
  }
  if (close(input) != 0 && status == 0) status = 1;
  if (close(output) != 0 && status == 0) {
    fprintf(stderr, "cp: %s: %s\n", destination, strerror(errno));
    status = 1;
  }
  return status;
}

static int copy_link(const char *source, const char *destination,
                     off_t source_size) {
  size_t capacity = source_size > 0 ? (size_t)source_size + 1 : 256;
  char *target = malloc(capacity);
  if (target == NULL) {
    fputs("cp: out of memory\n", stderr);
    return 1;
  }
  const ssize_t length = readlink(source, target, capacity - 1);
  if (length < 0 || (size_t)length >= capacity - 1) {
    fprintf(stderr, "cp: %s: %s\n", source,
            length < 0 ? strerror(errno) : "link target is too long");
    free(target);
    return 1;
  }
  target[length] = '\0';
  if (unlink(destination) != 0 && errno != ENOENT) {
    fprintf(stderr, "cp: %s: %s\n", destination, strerror(errno));
    free(target);
    return 1;
  }
  if (symlink(target, destination) != 0) {
    fprintf(stderr, "cp: %s: %s\n", destination, strerror(errno));
    free(target);
    return 1;
  }
  free(target);
  return 0;
}

static int copy_directory(const char *source, const char *destination) {
  if (!recursive) {
    fprintf(stderr, "cp: %s is a directory (use -R)\n", source);
    return 1;
  }
  struct stat destination_metadata;
  int created = 0;
  if (lstat(destination, &destination_metadata) != 0) {
    if (errno != ENOENT || mkdir(destination, 0777) != 0) {
      fprintf(stderr, "cp: %s: %s\n", destination, strerror(errno));
      return 1;
    }
    created = 1;
  } else if (!S_ISDIR(destination_metadata.st_mode)) {
    fprintf(stderr, "cp: %s is not a directory\n", destination);
    return 1;
  }

  char source_resolved[PATH_MAX];
  char destination_resolved[PATH_MAX];
  if (realpath(source, source_resolved) != NULL &&
      realpath(destination, destination_resolved) != NULL) {
    const size_t source_length = strlen(source_resolved);
    const int nested = strcmp(source_resolved, destination_resolved) == 0 ||
        (strncmp(source_resolved, destination_resolved, source_length) == 0 &&
         destination_resolved[source_length] == '/');
    if (nested) {
      fprintf(stderr, "cp: refusing to copy %s into itself at %s\n",
              source, destination);
      if (created) (void)rmdir(destination);
      return 1;
    }
  }

  DIR *directory = opendir(source);
  if (directory == NULL) {
    fprintf(stderr, "cp: %s: %s\n", source, strerror(errno));
    return 1;
  }
  int status = 0;
  struct dirent *entry;
  while ((entry = readdir(directory)) != NULL) {
    if (strcmp(entry->d_name, ".") == 0 || strcmp(entry->d_name, "..") == 0) continue;
    char *source_child = join_path(source, entry->d_name);
    char *destination_child = join_path(destination, entry->d_name);
    if (source_child == NULL || destination_child == NULL) {
      fputs("cp: out of memory\n", stderr);
      status = 1;
    } else if (copy_path(source_child, destination_child) != 0) {
      status = 1;
    }
    free(source_child);
    free(destination_child);
    if (status != 0) break;
  }
  if (closedir(directory) != 0 && status == 0) status = 1;
  return status;
}

static int copy_path(const char *source, const char *destination) {
  struct stat metadata;
  if (lstat(source, &metadata) != 0) {
    fprintf(stderr, "cp: %s: %s\n", source, strerror(errno));
    return 1;
  }
  struct stat destination_metadata;
  if (lstat(destination, &destination_metadata) == 0 &&
      metadata.st_dev == destination_metadata.st_dev &&
      metadata.st_ino == destination_metadata.st_ino) {
    fprintf(stderr, "cp: %s and %s are the same file\n", source, destination);
    return 1;
  }
  if (verbose) printf("%s -> %s\n", source, destination);
  if (S_ISREG(metadata.st_mode)) return copy_regular(source, destination);
  if (S_ISDIR(metadata.st_mode)) return copy_directory(source, destination);
  if (S_ISLNK(metadata.st_mode)) return copy_link(source, destination, metadata.st_size);
  fprintf(stderr, "cp: %s: unsupported file type\n", source);
  return 1;
}

static int copy_operand(const char *source, const char *destination,
                        int destination_is_directory) {
  char *target = NULL;
  if (destination_is_directory) {
    target = join_path(destination, base_name(source));
    if (target == NULL) {
      fputs("cp: out of memory\n", stderr);
      return 1;
    }
  }
  const int status = copy_path(source, target == NULL ? destination : target);
  free(target);
  return status;
}

int main(int argc, char **argv) {
  int first = 1;
  for (; first < argc; first++) {
    const char *argument = argv[first];
    if (strcmp(argument, "--") == 0) {
      first++;
      break;
    }
    if (strcmp(argument, "--help") == 0) {
      fputs("usage: cp [-Rrvf] [--] SOURCE... DESTINATION\n", stdout);
      return 0;
    }
    if (argument[0] != '-' || argument[1] == '\0') break;
    for (const char *option = argument + 1; *option != '\0'; option++) {
      if (*option == 'R' || *option == 'r') recursive = 1;
      else if (*option == 'v') verbose = 1;
      else if (*option != 'f') {
        fprintf(stderr, "cp: unsupported option -%c\n", *option);
        return 2;
      }
    }
  }
  if (argc - first < 2) {
    fputs("usage: cp [-Rrvf] [--] SOURCE... DESTINATION\n", stderr);
    return 2;
  }

  const char *destination = argv[argc - 1];
  struct stat metadata;
  const int destination_is_directory =
      stat(destination, &metadata) == 0 && S_ISDIR(metadata.st_mode);
  if (argc - first > 2 && !destination_is_directory) {
    fprintf(stderr, "cp: %s is not a directory\n", destination);
    return 1;
  }
  int status = 0;
  for (int index = first; index < argc - 1; index++) {
    if (copy_operand(argv[index], destination, destination_is_directory) != 0) {
      status = 1;
    }
  }
  return status;
}
