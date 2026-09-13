#define _GNU_SOURCE
#include <assert.h>
#include <dolly/runtime.h>
#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/wait.h>
#include <unistd.h>

static int run(const char *shell, const char *command) {
  char *arguments[] = {(char *)shell, "-c", (char *)command, NULL};
  int child = dolly_spawn(shell, 3, arguments, 0, 1, 2), status;
  assert(child > 0 && waitpid(child, &status, 0) == child);
  return status;
}

int main(int argc, char **argv) {
  assert(argc == 2);
  if (strcmp(argv[1], "signal") == 0) {
    raise(SIGINT);
    return 77;
  }
  char executable[PATH_MAX];
  ssize_t length = readlink("/proc/self/exe", executable, sizeof(executable) - 1);
  assert(length > 0);
  executable[length] = 0;
  assert(setenv("SELF", executable, 1) == 0 && setenv("SLOP_UNDER_TEST", argv[1], 1) == 0);
  int saved = open(".", O_RDONLY | O_DIRECTORY);
  char scratch[] = "/tmp/dolly-slop-interrupt-XXXXXX";
  assert(saved >= 0 && mkdtemp(scratch) && chdir(scratch) == 0);
  assert(setenv("SLOP_TEST_DIR", scratch, 1) == 0);
  const char *commands[] = {
    "$SELF signal; echo fail > marker",
    "$SELF signal | echo fail > marker",
    "($SELF signal) | echo fail > marker",
    "($SELF signal; echo fail > marker); echo fail > marker",
    "if $SELF signal; then echo fail > marker; else echo fail > marker; fi",
    "while $SELF signal; do echo fail > marker; done; echo fail > marker",
    "for item in one two; do $SELF signal; echo fail > marker; done",
    "echo \"$($SELF signal)\" > marker",
    "echo \"$($SELF signal)\" \"$(echo fail > marker)\"",
    "for item in \"$($SELF signal)\" \"$(echo fail > marker)\"; do echo fail > marker; done",
    "case \"$($SELF signal)\" in *) echo fail > marker;; esac",
    "cat <<END\n$($SELF signal)\n$(echo fail > marker)\nEND",
    "$SLOP_UNDER_TEST -c '$SELF signal; echo fail > marker'; echo fail > marker",
    "! $SELF signal; echo fail > marker",
    "$SELF signal || echo fail > marker",
  };
  for (size_t index = 0; index < sizeof(commands) / sizeof(*commands); index++) {
    int status = run(argv[1], commands[index]);
    if (!WIFSIGNALED(status) || WTERMSIG(status) != SIGINT) {
      fprintf(stderr, "interruption case %zu returned wait status %d: %s\n", index, status, commands[index]);
      return 1;
    }
    assert(access("marker", F_OK) == -1 && errno == ENOENT);
  }
  int status = run(argv[1], "$SLOP_UNDER_TEST -c 'exit 130'; echo continued > marker");
  assert(WIFEXITED(status) && WEXITSTATUS(status) == 0 && access("marker", F_OK) == 0);
  status = run(argv[1], "mkdir original; cd original; (mv ../original ../renamed); "
    "test \"$(pwd)\" = \"$SLOP_TEST_DIR/renamed\" || exit 91; "
    "value=\"$(mv ../renamed ../again; echo restored)\"; "
    "test \"$value\" = restored || exit 92; "
    "test \"$(pwd)\" = \"$SLOP_TEST_DIR/again\" || exit 93; cd ..; rm -rf again");
  assert(WIFEXITED(status) && WEXITSTATUS(status) == 0);
  assert(unlink("marker") == 0 && fchdir(saved) == 0 && close(saved) == 0 && rmdir(scratch) == 0);
}
