#include <dolly/toolchain.h>

#include <string.h>

/* Clang recurses on the browser's stack, deeper than a Chrome Worker's holds.
 * With this record the executable asks to be entered on the larger stack a
 * browser may have (src/process-supervisor.mjs); other programs do not. */
__asm__(".section .custom_section.dolly.process.stack,\"\",@\n.byte 1\n");

static int toolchain_mode(const char *argument) {
  static const char *const values[] = {
      "--dolly-toolchain-mode=c",
      "--dolly-toolchain-mode=c++",
      "--dolly-toolchain-mode=ld",
      "--dolly-toolchain-mode=ar",
  };
  for (int mode = DOLLY_TOOLCHAIN_C; mode <= DOLLY_TOOLCHAIN_AR; ++mode) {
    if (strcmp(argument, values[mode]) == 0) return mode;
  }
  return -1;
}

int main(int argc, char **argv) {
  if (argc < 2) return 64;
  const int mode = toolchain_mode(argv[1]);
  if (mode < 0) return 64;
  for (int index = 1; index < argc; ++index) argv[index] = argv[index + 1];
  return dolly_toolchain_main(argc - 1, argv, mode);
}
