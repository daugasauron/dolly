#include <stdio.h>
#include <string.h>
#include <dolly/toolchain.h>

int main(int argc, char **argv) {
  // As cc's: Clang's banner for `c++ -v` alone.
  if (argc == 2 && strcmp(argv[1], "-v") == 0) {
    fprintf(stderr, "clang version %s\nTarget: wasm64-unknown-dolly\nThread model: posix\n", __clang_version__);
    return 0;
  }
  return dolly_toolchain_proxy(argc, argv, DOLLY_TOOLCHAIN_CXX);
}
