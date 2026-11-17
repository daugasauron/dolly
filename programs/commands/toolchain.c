#include <dolly/runtime.h>

#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#include "toolchain.h"

int dolly_toolchain_proxy(int argc, char **argv, int default_language) {
  static const char *const modes[] = {
      "--dolly-toolchain-mode=c",
      "--dolly-toolchain-mode=c++",
      "--dolly-toolchain-mode=ld",
      "--dolly-toolchain-mode=ar",
  };
  if (argc <= 0 || argv == NULL || argv[0] == NULL ||
      default_language < DOLLY_TOOLCHAIN_C ||
      default_language > DOLLY_TOOLCHAIN_AR || argc == INT32_MAX) return 64;
  char **forward = calloc((size_t)argc + 2, sizeof(*forward));
  if (forward == NULL) return 1;
  forward[0] = argv[0];
  forward[1] = (char *)modes[default_language];
  for (int index = 1; index < argc; ++index) forward[index + 1] = argv[index];
  int status = 126;
  /* Retry only 126: survive transient Worker allocation, never hide source errors.
   * A compile that read its standard input ("-") is not retried: the input is
   * gone, and the retry would compile nothing and succeed. */
  unsigned attempts = 3;
  for (int index = 1; index < argc; ++index) {
    if (strcmp(argv[index], "-") == 0) attempts = 1;
  }
  for (unsigned attempt = 0; attempt < attempts; ++attempt) {
    const int pid = dolly_spawn(
        "/usr/libexec/dolly/process-bin/compiler", argc + 1, forward,
        STDIN_FILENO, STDOUT_FILENO, STDERR_FILENO);
    const int waited = pid < 0 ? pid : dolly_wait(pid, &status);
    if (waited == 0 && status != 126) break;
    status = 126;
    if (attempt + 1 < attempts) {
      fprintf(stderr,
              "dolly: compiler process failed; retrying %u/3\n",
              attempt + 2);
    }
  }
  free(forward);
  return status;
}
