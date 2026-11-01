#include <stdio.h>
#include <string.h>
#include <dolly/toolchain.h>

int main(int argc, char **argv) {
  // `cc -v` alone prints Clang's banner, which configure scripts read to name
  // the compiler (FFmpeg's `cc -v 2>&1 | grep -q clang`). The seed compiler
  // this file is built with is the one it starts, so the version is its own.
  if (argc == 2 && strcmp(argv[1], "-v") == 0) {
    fprintf(stderr, "clang version %s\nTarget: wasm64-unknown-dolly\nThread model: posix\n", __clang_version__);
    return 0;
  }
  return dolly_toolchain_proxy(argc, argv, DOLLY_TOOLCHAIN_C);
}
