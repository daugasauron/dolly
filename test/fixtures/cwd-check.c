#define _GNU_SOURCE
#include <assert.h>
#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <dolly/runtime.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/wait.h>
#include <unistd.h>

static void check_cwd(const char *expected) {
  char path[PATH_MAX];
  assert(getcwd(path, sizeof(path)) && strcmp(path, expected) == 0);
}

int main(int argc, char **argv) {
  if (argc == 3 && strcmp(argv[1], "child") == 0) {
    check_cwd(argv[2]);
    assert(chdir("/") == 0);
    return 0;
  }
  char executable[PATH_MAX];
  ssize_t length = readlink("/proc/self/exe", executable, sizeof(executable) - 1);
  assert(length > 0);
  executable[length] = 0;
  int saved = open(".", O_RDONLY | O_DIRECTORY);
  char root[] = "/tmp/dolly-cwd-XXXXXX";
  assert(saved >= 0 && mkdtemp(root));
  assert(chdir(root) == 0 && mkdir("a", 0700) == 0);
  assert(chdir("a") == 0 && mkdir("inside", 0700) == 0);
  assert(chdir("inside") == 0);
  char before[PATH_MAX], after[PATH_MAX], expected[PATH_MAX];
  snprintf(before, sizeof(before), "%s/a", root);
  snprintf(after, sizeof(after), "%s/b", root);
  snprintf(expected, sizeof(expected), "%s/b/inside", root);
  assert(rename(before, after) == 0 && mkdir(before, 0700) == 0);
  check_cwd(expected);
  int marker = open("marker", O_CREAT | O_RDWR, 0600);
  assert(marker >= 0 && write(marker, "x", 1) == 1 && close(marker) == 0);
  struct stat metadata;
  char path[PATH_MAX];
  snprintf(path, sizeof(path), "%s/b/inside/marker", root);
  assert(stat(path, &metadata) == 0 && metadata.st_size == 1);
  snprintf(path, sizeof(path), "%s/a/marker", root);
  assert(stat(path, &metadata) == -1 && errno == ENOENT);
  snprintf(path, sizeof(path), "%s/b/renamed", root);
  assert(rename(expected, path) == 0);
  strcpy(expected, path);
  check_cwd(expected);
  char *arguments[] = {executable, "child", expected, NULL};
  int child = dolly_spawn(executable, 3, arguments, 0, 1, 2);
  assert(child > 0);
  int status;
  assert(waitpid(child, &status, 0) == child && WIFEXITED(status) && WEXITSTATUS(status) == 0);
  check_cwd(expected);
  assert(unlink("marker") == 0 && rmdir(expected) == 0);
  errno = 0;
  assert(getcwd(path, sizeof(path)) == NULL && errno == ENOENT);
  assert(fchdir(saved) == 0 && close(saved) == 0);
  assert(fchdir(-1) == -1 && errno == EBADF);
  assert(fchdir(AT_FDCWD) == -1 && errno == EBADF);
  assert(rmdir(before) == 0 && rmdir(after) == 0 && rmdir(root) == 0);
}
