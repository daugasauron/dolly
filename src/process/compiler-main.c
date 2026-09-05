#include <dolly/toolchain.h>

#include <string.h>

int dolly_main(int argc, char **argv);

static int toolchain_mode(const char *argument) {
  static const char *const values[] = {
      "--dolly-toolchain-mode=c",
      "--dolly-toolchain-mode=c++",
      "--dolly-toolchain-mode=ld",
      "--dolly-toolchain-mode=ar",
      "--dolly-toolchain-mode=zig",
  };
  for (int mode = DOLLY_TOOLCHAIN_C; mode <= DOLLY_TOOLCHAIN_ZIG; ++mode) {
    if (strcmp(argument, values[mode]) == 0) return mode;
  }
  return -1;
}

int main(int argc, char **argv) {
  if (argc < 2) return 64;
  const int mode = toolchain_mode(argv[1]);
  if (mode < 0) return 64;
  for (int index = 1; index < argc; ++index) argv[index] = argv[index + 1];
  return mode == DOLLY_TOOLCHAIN_ZIG
      ? dolly_main(argc - 1, argv)
      : dolly_toolchain_main(argc - 1, argv, mode);
}
