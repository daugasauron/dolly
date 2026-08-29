#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

int main(int argc, char **argv) {
  int first_path = 1;
  if (first_path < argc && strcmp(argv[first_path], "--help") == 0) {
    fputs("usage: cd [--] [DIRECTORY]\n", stdout);
    return 0;
  }
  if (first_path < argc && strcmp(argv[first_path], "--") == 0) first_path++;
  if (argc - first_path > 1) {
    fputs("cd: expected at most one path\n", stderr);
    return 2;
  }
  const char *path = first_path < argc ? argv[first_path] : getenv("HOME");
  if (path == NULL || path[0] == '\0') path = "/workspace";
  if (chdir(path) != 0) {
    fprintf(stderr, "cd: %s: %s\n", path, strerror(errno));
    return 1;
  }
  return 0;
}
