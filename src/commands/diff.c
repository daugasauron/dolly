#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <dolly/runtime.h>

static void usage(FILE *stream) {
  fputs("usage: diff [OPTION ...] FILE FILE\n"
        "Dolly delegates file/directory comparison to source-built "
        "git diff --no-index.\n", stream);
}

int main(int argc, char **argv) {
  if (argc == 2 && strcmp(argv[1], "--help") == 0) {
    usage(stdout);
    return 0;
  }
  if (argc < 3) {
    usage(stderr);
    return 2;
  }
  if ((size_t)argc > SIZE_MAX / sizeof(char *) - 3) {
    fputs("diff: too many arguments\n", stderr);
    return 2;
  }

  char **arguments = calloc((size_t)argc + 4, sizeof(*arguments));
  if (arguments == NULL) {
    fprintf(stderr, "diff: %s\n", strerror(errno));
    return 2;
  }
  arguments[0] = "git";
  arguments[1] = "--no-pager";
  arguments[2] = "diff";
  arguments[3] = "--no-index";
  for (int index = 1; index < argc; index++) arguments[index + 3] = argv[index];

  const int pid = dolly_spawn("/usr/bin/git", argc + 3, arguments, 0, 1, 2);
  free(arguments);
  if (pid < 0) {
    fprintf(stderr, "diff: git diff --no-index is unavailable: %s\n",
            strerror(-pid));
    return 2;
  }
  int status;
  const int waited = dolly_wait(pid, &status);
  if (waited < 0) {
    fprintf(stderr, "diff: wait failed: %s\n", strerror(-waited));
    return 2;
  }
  return status;
}
