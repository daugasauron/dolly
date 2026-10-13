#define _POSIX_C_SOURCE 200809L

#include <dirent.h>
#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <time.h>
#include <unistd.h>

typedef struct { char *name; struct timespec modified; } entry;
typedef struct { entry *items; size_t length; size_t capacity; } name_list;
typedef struct {
  int show_all, almost_all, long_format, human, directory;
  int classify, recursive, reverse, newest_first, follow, inode;
} options;

static void free_names(name_list *names) {
  for (size_t index = 0; index < names->length; index++) free(names->items[index].name);
  free(names->items);
}

static int add_name(name_list *names, const char *name, struct timespec modified) {
  if (names->length == names->capacity) {
    size_t capacity = names->capacity == 0 ? 32 : names->capacity * 2;
    if (capacity < names->capacity || capacity > SIZE_MAX / sizeof(*names->items)) return -1;
    entry *items = realloc(names->items, capacity * sizeof(*items));
    if (items == NULL) return -1;
    names->items = items;
    names->capacity = capacity;
  }
  char *copy = strdup(name);
  if (copy == NULL) return -1;
  names->items[names->length++] = (entry){copy, modified};
  return 0;
}

static int compare_names(const void *left_value, const void *right_value) {
  const entry *left = left_value, *right = right_value;
  return strcmp(left->name, right->name);
}

// -t: the newest first, names deciding between equal times.
static int compare_times(const void *left_value, const void *right_value) {
  const entry *left = left_value, *right = right_value;
  if (left->modified.tv_sec != right->modified.tv_sec) return left->modified.tv_sec < right->modified.tv_sec ? 1 : -1;
  if (left->modified.tv_nsec != right->modified.tv_nsec) return left->modified.tv_nsec < right->modified.tv_nsec ? 1 : -1;
  return compare_names(left, right);
}

static void sort_names(name_list *names, const options *option) {
  if (names->length > 1) qsort(names->items, names->length, sizeof(*names->items),
                               option->newest_first ? compare_times : compare_names);
}

// -L describes what a symbolic link names, the link itself when that is missing.
static int entry_stat(const char *path, struct stat *metadata, const options *option) {
  return option->follow && stat(path, metadata) == 0 ? 0 : lstat(path, metadata);
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
  if (entry_stat(path, &metadata, option) != 0) {
    fprintf(stderr, "ls: %s: %s\n", path, strerror(errno));
    return 1;
  }
  const char suffix = option->classify
      ? S_ISDIR(metadata.st_mode) ? '/' : S_ISLNK(metadata.st_mode) ? '@' : '\0'
      : '\0';
  if (option->inode) printf("%llu ", (unsigned long long)metadata.st_ino);
  if (!option->long_format) {
    fputs(name, stdout);
    if (suffix != '\0') fputc(suffix, stdout);
    fputc('\n', stdout);
    return 0;
  }
  // The POSIX long format: the bits are what stat reports, no more; the
  // owner and group are the one user's numeric ids, which have no names;
  // the date carries the time of day for six months, then the year.
  char size[32], timestamp[32] = "?", mode[] = "----------";
  format_size(size, metadata.st_size, option->human);
  const time_t age = time(NULL) - metadata.st_mtime;
  struct tm *broken = localtime(&metadata.st_mtime);
  if (broken != NULL) {
    strftime(timestamp, sizeof(timestamp), age >= 0 && age < 182 * 86400 ? "%b %e %H:%M" : "%b %e  %Y", broken);
  }
  mode[0] = S_ISDIR(metadata.st_mode) ? 'd' : S_ISLNK(metadata.st_mode) ? 'l'
      : S_ISCHR(metadata.st_mode) ? 'c' : S_ISBLK(metadata.st_mode) ? 'b'
      : S_ISFIFO(metadata.st_mode) ? 'p' : S_ISSOCK(metadata.st_mode) ? 's' : '-';
  for (int bit = 0; bit < 9; bit++) {
    if (metadata.st_mode & (0400u >> bit)) mode[1 + bit] = "rwx"[bit % 3];
  }
  printf("%s %3lu %u %u %10s %s %s", mode, (unsigned long)metadata.st_nlink,
         (unsigned)metadata.st_uid, (unsigned)metadata.st_gid, size, timestamp, name);
  if (suffix != '\0') fputc(suffix, stdout);
  if (S_ISLNK(metadata.st_mode)) {
    char target[4096];
    const ssize_t length = readlink(path, target, sizeof(target) - 1);
    if (length >= 0) printf(" -> %.*s", (int)length, target);
  }
  fputc('\n', stdout);
  return 0;
}

static int hidden(const char *name, const options *option) {
  if (name[0] != '.' || option->show_all) return 0;
  if (option->almost_all && strcmp(name, ".") != 0 && strcmp(name, "..") != 0) return 0;
  return 1;
}

// Lists the members of the directory `path`.
static int list_path(const char *path, const options *option, int print_heading) {
  DIR *directory = opendir(path);
  if (directory == NULL) { fprintf(stderr, "ls: %s: %s\n", path, strerror(errno)); return 1; }
  name_list names = {0};
  int status = 0;
  struct dirent *member;
  while ((member = readdir(directory)) != NULL) {
    if (hidden(member->d_name, option)) continue;
    struct stat metadata = {0};
    if (option->newest_first) {
      char *member_path = join_path(path, member->d_name);
      if (member_path != NULL) (void)entry_stat(member_path, &metadata, option);
      free(member_path);
    }
    if (add_name(&names, member->d_name, metadata.st_mtim) != 0) { fputs("ls: out of memory\n", stderr); status = 1; break; }
  }
  if (closedir(directory) != 0) status = 1;
  sort_names(&names, option);
  if (print_heading) printf("%s:\n", path);
  if (option->long_format) {
    // Files occupy memory, not blocks: the total counts their sizes in KiB.
    unsigned long long total = 0;
    for (size_t index = 0; index < names.length; index++) {
      char *entry_path = join_path(path, names.items[index].name);
      struct stat entry_metadata;
      if (entry_path != NULL && entry_stat(entry_path, &entry_metadata, option) == 0) {
        total += ((unsigned long long)entry_metadata.st_size + 1023) / 1024;
      }
      free(entry_path);
    }
    printf("total %llu\n", total);
  }
  for (size_t offset = 0; offset < names.length; offset++) {
    const size_t index = option->reverse ? names.length - offset - 1 : offset;
    char *entry_path = join_path(path, names.items[index].name);
    if (entry_path == NULL || print_entry(entry_path, names.items[index].name, option) != 0) status = 1;
    free(entry_path);
  }
  if (option->recursive) {
    for (size_t offset = 0; offset < names.length; offset++) {
      const size_t index = option->reverse ? names.length - offset - 1 : offset;
      if (strcmp(names.items[index].name, ".") == 0 || strcmp(names.items[index].name, "..") == 0) continue;
      char *entry_path = join_path(path, names.items[index].name);
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
    case 'i': option->inode = 1; return 0;
    case 'L': option->follow = 1; return 0;
    case 'l': option->long_format = 1; return 0;
    case 'R': option->recursive = 1; return 0;
    case 'r': option->reverse = 1; return 0;
    case 't': option->newest_first = 1; return 0;
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
      fputs("usage: ls [-1aAdFhiLlpRrt] [--color[=WHEN]] [--] [PATH ...]\n"
            "-l prints mode, links, numeric owner and group, size, date and name; its total is the\n"
            "listed sizes in KiB, each rounded up, because disk blocks do not exist.\n"
            "-t sorts by modification time, the newest first; -L describes what a symbolic link names;\n"
            "-i prints each file's serial number before it.\n"
            "Operands that are not directories are listed first, then each directory.\n", stdout);
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
  static char *const current[] = {"."};
  char *const *operands = first_path == argc ? current : argv + first_path;
  const size_t count = first_path == argc ? 1 : (size_t)(argc - first_path);
  name_list files = {0}, directories = {0};
  int status = 0;
  for (size_t index = 0; index < count; index++) {
    struct stat metadata;
    if (entry_stat(operands[index], &metadata, &option) != 0) {
      fprintf(stderr, "ls: %s: %s\n", operands[index], strerror(errno));
      status = 1;
    } else if (add_name(S_ISDIR(metadata.st_mode) && !option.directory ? &directories : &files,
                        operands[index], metadata.st_mtim) != 0) {
      fputs("ls: out of memory\n", stderr);
      return 1;
    }
  }
  sort_names(&files, &option);
  sort_names(&directories, &option);
  for (size_t offset = 0; offset < files.length; offset++) {
    const char *name = files.items[option.reverse ? files.length - offset - 1 : offset].name;
    if (print_entry(name, name, &option) != 0) status = 1;
  }
  for (size_t offset = 0; offset < directories.length; offset++) {
    if (offset != 0 || files.length != 0) fputc('\n', stdout);
    const char *name = directories.items[option.reverse ? directories.length - offset - 1 : offset].name;
    if (list_path(name, &option, count > 1) != 0) status = 1;
  }
  free_names(&files);
  free_names(&directories);
  return status;
}
