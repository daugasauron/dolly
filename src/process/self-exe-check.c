#define _GNU_SOURCE
#include <assert.h>
#include <dolly/runtime.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

static void check_path(const char *expected) {
  char actual[PATH_MAX];
  ssize_t size = readlink("/proc/self/exe", actual, sizeof(actual));
  assert(size == (ssize_t)strlen(expected));
  assert(!memcmp(actual, expected, (size_t)size));
}

static int child(const char *path, const char *expected, int remove) {
  char *args[] = {"forged-argv-zero", (char *)expected, remove ? "unlink" : "keep", NULL};
  int pid = dolly_spawn_env_cwd(path, 3, args, NULL, "/", 0, 1, 2, -1);
  assert(pid > 0);
  return pid;
}

static void wait_child(int pid) {
  int status;
  assert(dolly_wait(pid, &status) == 0 && status == 0);
}

int main(int argc, char **argv) {
  if (argc > 1) {
    check_path(argv[1]);
    assert(chdir("/tmp") == 0);
    check_path(argv[1]);
    if (argc > 2 && !strcmp(argv[2], "unlink")) {
      assert(unlink(argv[1]) == 0);
      check_path(argv[1]);
    }
    return 0;
  }
  char *expected = realpath(argv[0], NULL);
  assert(expected);
  check_path(expected);
  char short_path[6] = {0, 0, 0, 0, 0, 'X'};
  assert(readlink("/proc/self/exe", short_path, 5) == 5);
  assert(!memcmp(short_path, expected, 5) && short_path[5] == 'X');
  char directory[PATH_MAX], alias[PATH_MAX], one[PATH_MAX], two[PATH_MAX];
  assert(getcwd(directory, sizeof(directory)));
  assert(snprintf(alias, sizeof(alias), "%s/identity-alias", directory) < (int)sizeof(alias));
  assert(snprintf(one, sizeof(one), "%s/identity-one", directory) < (int)sizeof(one));
  assert(snprintf(two, sizeof(two), "%s/identity-two", directory) < (int)sizeof(two));
  assert(chdir("/") == 0);
  check_path(expected);
  wait_child(child(alias, expected, 0));
  int first = child(one, one, 1), second = child(two, two, 1);
  wait_child(first); wait_child(second);
  free(expected);
  puts("PROCESS-SELF-EXE-OK");
}
