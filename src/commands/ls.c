#define _POSIX_C_SOURCE 200809L

#include <dirent.h>
#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <time.h>

typedef struct { char **items; size_t length; size_t capacity; } name_list;
typedef struct {
  int show_all, almost_all, long_format, human, directory;
  int classify, recursive, reverse;
} options;

static void free_names(name_list *names) {
  for (size_t index = 0; index < names->length; index++) free(names->items[index]);
  free(names->items);
}

static int add_name(name_list *names, const char *name) {
  if (names->length == names->capacity) {
    size_t capacity = names->capacity == 0 ? 32 : names->capacity * 2;
    if (capacity < names->capacity || capacity > SIZE_MAX / sizeof(*names->items)) return -1;
    char **items = realloc(names->items, capacity * sizeof(*items));
    if (items == NULL) return -1;
    names->items = items;
    names->capacity = capacity;
  }
  char *copy = strdup(name);
  if (copy == NULL) return -1;
  names->items[names->length++] = copy;
  return 0;
}

static int compare_names(const void *left, const void *right) {
  return strcmp(*(const char *const *)left, *(const char *const *)right);
}

static char *join_path(const char *directory, const char *name) {
  const size_t directory_length = strlen(directory), name_length = strlen(name);
  const int slash = directory_length != 0 && directory[directory_length - 1] != '/';
  if (directory_length > SIZE_MAX - name_length - (size_t)slash - 1) return NULL;
  char *path = malloc(directory_length + (size_t)slash + name_length + 1);
  if (path == NULL) return NULL;
  memcpy(path, directory, directory_length);
  if (slash) path[directory_length] = '/';
  memcpy(path + directory_length + (size_t)slash, name, name_length + 1);
  return path;
}

static void format_size(char output[32], off_t size, int human) {
  if (!human || size < 1024) { snprintf(output, 32, "%lld", (long long)size); return; }
  static const char units[] = "KMGTPE";
  double value = (double)size;
  size_t unit = 0;
  do { value /= 1024.0; unit++; } while (value >= 1024.0 && unit < sizeof(units) - 1);
  if (value < 10.0) snprintf(output, 32, "%.1f%c", value, units[unit - 1]);
  else snprintf(output, 32, "%.0f%c", value, units[unit - 1]);
}

static int print_entry(const char *path, const char *name, const options *option) {
  struct stat metadata;
  if (lstat(path, &metadata) != 0) {
    fprintf(stderr, "ls: %s: %s\n", path, strerror(errno));
    return 1;
  }
  const char suffix = option->classify
      ? S_ISDIR(metadata.st_mode) ? '/' : S_ISLNK(metadata.st_mode) ? '@' : '\0'
      : '\0';
  if (!option->long_format) {
    fputs(name, stdout);
    if (suffix != '\0') fputc(suffix, stdout);
    fputc('\n', stdout);
    return 0;
  }
  char size[32], timestamp[32] = "?";
  format_size(size, metadata.st_size, option->human);
  struct tm *broken = localtime(&metadata.st_mtime);
  if (broken != NULL) strftime(timestamp, sizeof(timestamp), "%Y-%m-%d %H:%M", broken);
  const char kind = S_ISDIR(metadata.st_mode) ? 'd' : S_ISLNK(metadata.st_mode) ? 'l' : '-';
  printf("%c %10s %s %s", kind, size, timestamp, name);
  if (suffix != '\0') fputc(suffix, stdout);
  fputc('\n', stdout);
  return 0;
}

static int hidden(const char *name, const options *option) {
  if (name[0] != '.' || option->show_all) return 0;
  if (option->almost_all && strcmp(name, ".") != 0 && strcmp(name, "..") != 0) return 0;
  return 1;
}

static int list_path(const char *path, const options *option, int print_heading) {
  struct stat metadata;
  if (lstat(path, &metadata) != 0) {
    fprintf(stderr, "ls: %s: %s\n", path, strerror(errno));
    return 1;
  }
  if (!S_ISDIR(metadata.st_mode) || option->directory) return print_entry(path, path, option);
  DIR *directory = opendir(path);
  if (directory == NULL) { fprintf(stderr, "ls: %s: %s\n", path, strerror(errno)); return 1; }
  name_list names = {0};
  int status = 0;
  struct dirent *entry;
  while ((entry = readdir(directory)) != NULL) {
    if (hidden(entry->d_name, option)) continue;
    if (add_name(&names, entry->d_name) != 0) { fputs("ls: out of memory\n", stderr); status = 1; break; }
  }
  if (closedir(directory) != 0) status = 1;
  qsort(names.items, names.length, sizeof(*names.items), compare_names);
  if (print_heading) printf("%s:\n", path);
  for (size_t offset = 0; offset < names.length; offset++) {
    const size_t index = option->reverse ? names.length - offset - 1 : offset;
    char *entry_path = join_path(path, names.items[index]);
    if (entry_path == NULL || print_entry(entry_path, names.items[index], option) != 0) status = 1;
    free(entry_path);
  }
  if (option->recursive) {
    for (size_t offset = 0; offset < names.length; offset++) {
      const size_t index = option->reverse ? names.length - offset - 1 : offset;
      if (strcmp(names.items[index], ".") == 0 || strcmp(names.items[index], "..") == 0) continue;
      char *entry_path = join_path(path, names.items[index]);
      struct stat child;
      if (entry_path != NULL && lstat(entry_path, &child) == 0 && S_ISDIR(child.st_mode) && !S_ISLNK(child.st_mode)) {
        fputc('\n', stdout);
        if (list_path(entry_path, option, 1) != 0) status = 1;
      }
      free(entry_path);
    }
  }
  free_names(&names);
  return status;
}

static int short_option(options *option, char value) {
  switch (value) {
    case '1': return 0;
    case 'a': option->show_all = 1; option->almost_all = 0; return 0;
    case 'A': option->almost_all = 1; option->show_all = 0; return 0;
    case 'd': option->directory = 1; return 0;
    case 'F': case 'p': option->classify = 1; return 0;
    case 'h': option->human = 1; return 0;
    case 'l': option->long_format = 1; return 0;
    case 'R': option->recursive = 1; return 0;
    case 'r': option->reverse = 1; return 0;
    default: return -1;
  }
}

int main(int argc, char **argv) {
  options option = {0};
  int first_path = 1;
  for (; first_path < argc; first_path++) {
    const char *argument = argv[first_path];
    if (strcmp(argument, "--") == 0) { first_path++; break; }
    if (strcmp(argument, "--help") == 0) {
      fputs("usage: ls [-1aAdFhlpRr] [--color[=WHEN]] [--] [PATH ...]\n", stdout);
      return 0;
    }
    if (strncmp(argument, "--color", 7) == 0 || strcmp(argument, "--group-directories-first") == 0) continue;
    if (argument[0] != '-' || argument[1] == '\0') break;
    for (size_t index = 1; argument[index] != '\0'; index++) {
      if (short_option(&option, argument[index]) != 0) {
        fprintf(stderr, "ls: unsupported option: -%c\n", argument[index]);
        return 2;
      }
    }
  }
  if (first_path == argc) return list_path(".", &option, 0);
  const int multiple = argc - first_path > 1;
  int status = 0;
  for (int index = first_path; index < argc; index++) {
    if (index != first_path) fputc('\n', stdout);
    if (list_path(argv[index], &option, multiple) != 0) status = 1;
  }
  return status;
}
