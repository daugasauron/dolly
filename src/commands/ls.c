#include <dirent.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
  char **items;
  size_t length;
} name_list;

static void free_names(name_list *names) {
  for (size_t index = 0; index < names->length; index++) free(names->items[index]);
  free(names->items);
}

static int add_name(name_list *names, const char *name) {
  char **items = realloc(names->items, (names->length + 1) * sizeof(*items));
  if (items == NULL) return -1;
  names->items = items;
  const size_t length = strlen(name) + 1;
  char *copy = realloc(NULL, length);
  if (copy == NULL) return -1;
  memcpy(copy, name, length);
  names->items[names->length++] = copy;
  return 0;
}

static void sort_names(name_list *names) {
  for (size_t index = 1; index < names->length; index++) {
    char *item = names->items[index];
    size_t insertion = index;
    while (insertion != 0 && strcmp(names->items[insertion - 1], item) > 0) {
      names->items[insertion] = names->items[insertion - 1];
      insertion--;
    }
    names->items[insertion] = item;
  }
}

static int list_path(const char *path, int show_all, int almost_all) {
  DIR *directory = opendir(path);
  if (directory == NULL) {
    if (errno == ENOTDIR) {
      fputs(path, stdout);
      fputc('\n', stdout);
      return 0;
    }
    fprintf(stderr, "ls: %s: %s\n", path, strerror(errno));
    return 1;
  }

  name_list names = {0};
  struct dirent *entry;
  int status = 0;
  while ((entry = readdir(directory)) != NULL) {
    const int dot = strcmp(entry->d_name, ".") == 0 ||
                    strcmp(entry->d_name, "..") == 0;
    if ((!show_all && !almost_all && entry->d_name[0] == '.') ||
        (almost_all && dot)) {
      continue;
    }
    if (add_name(&names, entry->d_name) != 0) {
      fputs("ls: out of memory\n", stderr);
      status = 1;
      break;
    }
  }
  if (closedir(directory) != 0) {
    fprintf(stderr, "ls: %s: %s\n", path, strerror(errno));
    status = 1;
  }
  sort_names(&names);
  for (size_t index = 0; index < names.length; index++) {
    fputs(names.items[index], stdout);
    fputc('\n', stdout);
  }
  free_names(&names);
  return status;
}

int main(int argc, char **argv) {
  int show_all = 0;
  int almost_all = 0;
  int first_path = 1;
  for (; first_path < argc; first_path++) {
    if (strcmp(argv[first_path], "--") == 0) {
      first_path++;
      break;
    }
    if (strcmp(argv[first_path], "--help") == 0) {
      fputs("usage: ls [-a|-A] [-1] [--] [PATH ...]\n", stdout);
      return 0;
    }
    if (strcmp(argv[first_path], "-a") == 0) {
      show_all = 1;
      almost_all = 0;
    } else if (strcmp(argv[first_path], "-A") == 0) {
      almost_all = 1;
      show_all = 0;
    } else if (strcmp(argv[first_path], "-1") == 0) {
      // Dolly always emits one entry per line.
    } else if (argv[first_path][0] == '-') {
      fprintf(stderr, "ls: unsupported option: %s\n", argv[first_path]);
      return 2;
    } else {
      break;
    }
  }

  if (first_path == argc) return list_path(".", show_all, almost_all);
  const int multiple = argc - first_path > 1;
  int status = 0;
  for (int index = first_path; index < argc; index++) {
    if (multiple) {
      if (index != first_path) fputc('\n', stdout);
      printf("%s:\n", argv[index]);
    }
    if (list_path(argv[index], show_all, almost_all) != 0) status = 1;
  }
  return status;
}
