#include <stdio.h>
#include <string.h>
#include <dolly/toolchain.h>

int main(int argc, char **argv) {
  // `cc -v` and `cc --version` alone print Clang's banner, as Clang does (-v to
  // stderr, --version to stdout), which build systems read to name the compiler
  // and its version: FFmpeg's `cc -v 2>&1 | grep -q clang`, Meson's C17 and C++20
  // for Clang 6 and 10 on. The seed compiler this file is built with is the one it
  // starts, so the version is its own.
  if (argc == 2 && (strcmp(argv[1], "-v") == 0 || strcmp(argv[1], "--version") == 0)) {
    fprintf(argv[1][1] == 'v' ? stderr : stdout,
            "clang version %s\nTarget: wasm64-unknown-dolly\nThread model: posix\n", __clang_version__);
    return 0;
  }
  return dolly_toolchain_proxy(argc, argv, DOLLY_TOOLCHAIN_C);
}
