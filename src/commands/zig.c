#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <dolly/runtime.h>

#define DOLLY_ZIG_VERSION "0.16.0"

int main(int argc, char **argv) {
  if (argc < 1) return 64;

  /*
   * The source-provided stage1 compiler is a bootstrap compiler, and its
   * metadata-only `version` branch traps before doing useful work. Report the
   * exact source pin in the outer command; all compilation subcommands still
   * execute zig1.wasm.
   */
  if (argc == 2 &&
      (strcmp(argv[1], "version") == 0 || strcmp(argv[1], "--version") == 0)) {
    puts(DOLLY_ZIG_VERSION);
    return 0;
  }

  char **child_argv = calloc((size_t)argc + 2, sizeof(*child_argv));
  if (child_argv == NULL) {
    fputs("zig: out of memory\n", stderr);
    return 1;
  }
  child_argv[0] = "/usr/libexec/dolly/zig1";
  child_argv[1] = "/usr/lib/zig";
  for (int index = 1; index < argc; index++) {
    child_argv[index + 1] = argv[index];
  }

  const int pid = dolly_spawn(child_argv[0], argc + 1, child_argv, 0, 1, 2);
  free(child_argv);
  if (pid < 0) {
    fprintf(stderr, "zig: could not start stage1 compiler: %s\n", strerror(-pid));
    return 1;
  }
  int status = 1;
  if (dolly_wait(pid, &status) != 0) {
    fputs("zig: could not collect stage1 compiler\n", stderr);
    return 1;
  }
  return status;
}
