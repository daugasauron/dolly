#define _POSIX_C_SOURCE 200809L

#include <dirent.h>
#include <errno.h>
#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>

typedef struct {
  int all;
  int summarize;
  int human;
  int bytes;
  int total;
  size_t max_depth;
  int status;
} Options;

typedef struct {
  char **items;
  size_t count;
  size_t capacity;
} Names;

static void usage(FILE *stream) {
  fputs("usage: du [-a|-s] [-b|-h|-k] [-c] [-d DEPTH] [PATH ...]\n"
        "Dolly reports logical in-memory file bytes; disk blocks do not exist.\n",
        stream);
}

static int compare_names(const void *left, const void *right) {
  return strcmp(*(const char *const *)left, *(const char *const *)right);
}

static void names_dispose(Names *names) {
  for (size_t index = 0; index < names->count; index++) free(names->items[index]);
  free(names->items);
}

static int names_push(Names *names, const char *name) {
  if (names->count == names->capacity) {
    const size_t next = names->capacity == 0 ? 16 : names->capacity * 2;
    if (next < names->capacity || next > SIZE_MAX / sizeof(*names->items)) return 0;
    char **replacement = realloc(names->items, next * sizeof(*names->items));
    if (replacement == NULL) return 0;
    names->items = replacement;
    names->capacity = next;
  }
  names->items[names->count] = strdup(name);
  if (names->items[names->count] == NULL) return 0;
  names->count++;
  return 1;
}

static char *join_path(const char *directory, const char *name) {
  const size_t directory_length = strlen(directory);
  const size_t name_length = strlen(name);
  const int slash = directory_length != 0 && directory[directory_length - 1] != '/';
  if (directory_length > SIZE_MAX - name_length - (size_t)slash - 1) return NULL;
  char *path = malloc(directory_length + name_length + (size_t)slash + 1);
  if (path == NULL) return NULL;
  memcpy(path, directory, directory_length);
  size_t offset = directory_length;
  if (slash) path[offset++] = '/';
  memcpy(path + offset, name, name_length + 1);
  return path;
}

static uint64_t add_size(uint64_t left, uint64_t right, Options *options) {
  if (UINT64_MAX - left < right) {
    fputs("du: logical size overflow\n", stderr);
    options->status = 1;
    return UINT64_MAX;
  }
  return left + right;
}

static void print_size(uint64_t size, const char *path, const Options *options) {
  if (options->human) {
    static const char units[] = "BKMGTPE";
    double value = (double)size;
    size_t unit = 0;
    while (value >= 1024.0 && unit + 1 < sizeof(units) - 1) {
      value /= 1024.0;
      unit++;
    }
    if (unit == 0) printf("%" PRIu64 "B\t%s\n", size, path);
    else if (value >= 10.0) printf("%.0f%c\t%s\n", value, units[unit], path);
    else printf("%.1f%c\t%s\n", value, units[unit], path);
    return;
  }
  const uint64_t divisor = options->bytes ? 1 : 1024;
  const uint64_t displayed = size == 0 ? 0 : 1 + (size - 1) / divisor;
  printf("%" PRIu64 "\t%s\n", displayed, path);
}

static uint64_t walk(const char *path, size_t depth, int operand,
                     Options *options) {
  struct stat metadata;
  if (lstat(path, &metadata) != 0) {
    fprintf(stderr, "du: %s: %s\n", path, strerror(errno));
    options->status = 1;
    return 0;
  }
  if (!S_ISDIR(metadata.st_mode)) {
    const uint64_t size = metadata.st_size > 0 ? (uint64_t)metadata.st_size : 0;
    if (operand || options->all) print_size(size, path, options);
    return size;
  }

  DIR *directory = opendir(path);
  if (directory == NULL) {
    fprintf(stderr, "du: %s: %s\n", path, strerror(errno));
    options->status = 1;
    return 0;
  }
  Names names = {0};
  struct dirent *entry;
  while ((entry = readdir(directory)) != NULL) {
    if (strcmp(entry->d_name, ".") == 0 || strcmp(entry->d_name, "..") == 0) continue;
    if (!names_push(&names, entry->d_name)) {
      fputs("du: out of memory\n", stderr);
      options->status = 1;
      break;
    }
  }
  if (closedir(directory) != 0) options->status = 1;
  if (names.count > 1) {
    qsort(names.items, names.count, sizeof(*names.items), compare_names);
  }
  uint64_t total = 0;
  for (size_t index = 0; index < names.count; index++) {
    char *child = join_path(path, names.items[index]);
    if (child == NULL) {
      fputs("du: out of memory\n", stderr);
      options->status = 1;
      continue;
    }
    total = add_size(total, walk(child, depth + 1, 0, options), options);
    free(child);
  }
  names_dispose(&names);
  if ((options->summarize && operand) ||
      (!options->summarize && depth <= options->max_depth)) {
    print_size(total, path, options);
  }
  return total;
}

static int parse_depth(const char *text, size_t *depth) {
  if (*text == '\0') return 0;
  size_t value = 0;
  for (const unsigned char *byte = (const unsigned char *)text;
       *byte != '\0'; byte++) {
    if (*byte < '0' || *byte > '9') return 0;
    const size_t digit = (size_t)(*byte - '0');
    if (value > (SIZE_MAX - digit) / 10) return 0;
    value = value * 10 + digit;
  }
  *depth = value;
  return 1;
}

int main(int argc, char **argv) {
  Options options = {.max_depth = SIZE_MAX};
  int first = 1;
  for (; first < argc; first++) {
    const char *argument = argv[first];
    if (strcmp(argument, "--") == 0) {
      first++;
      break;
    }
    if (strcmp(argument, "--help") == 0) {
      usage(stdout);
      return 0;
    }
    if (strcmp(argument, "--apparent-size") == 0) continue;
    if (strcmp(argument, "--bytes") == 0) {
      options.bytes = 1;
      options.human = 0;
      continue;
    }
    if (strncmp(argument, "--max-depth=", 12) == 0) {
      if (!parse_depth(argument + 12, &options.max_depth)) goto usage_error;
      continue;
    }
    if (strcmp(argument, "-d") == 0) {
      if (++first == argc || !parse_depth(argv[first], &options.max_depth)) goto usage_error;
      continue;
    }
    if (argument[0] != '-' || argument[1] == '\0') break;
    for (const char *option = argument + 1; *option != '\0'; option++) {
      if (*option == 'a') options.all = 1;
      else if (*option == 's') options.summarize = 1;
      else if (*option == 'h') { options.human = 1; options.bytes = 0; }
      else if (*option == 'b') { options.bytes = 1; options.human = 0; }
      else if (*option == 'k') { options.bytes = 0; options.human = 0; }
      else if (*option == 'c') options.total = 1;
      else if (*option != 'x') goto usage_error;
    }
  }
  if (options.all && options.summarize) goto usage_error;
  if (options.summarize && options.max_depth != SIZE_MAX) goto usage_error;

  uint64_t grand_total = 0;
  if (first == argc) {
    grand_total = walk(".", 0, 1, &options);
  } else {
    for (int index = first; index < argc; index++) {
      grand_total = add_size(grand_total, walk(argv[index], 0, 1, &options), &options);
    }
  }
  if (options.total) print_size(grand_total, "total", &options);
  return options.status;

usage_error:
  usage(stderr);
  return 2;
}
