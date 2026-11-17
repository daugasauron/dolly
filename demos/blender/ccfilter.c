// ccfilter COMPILER ARG...: runs COMPILER without the options below, which upstream build files
// pass to every Clang and Dolly's cc refuses as unknown. Used as CMAKE_<LANG>_COMPILER_LAUNCHER
// and CMAKE_<LANG>_LINKER_LAUNCHER. An entry ending in '=' matches every option that starts so.
#include <stdio.h>
#include <string.h>
#include <unistd.h>

static const char *const dropped[] = {
  "-Qunused-arguments", // OpenImageIO: silences warnings about unused driver arguments
  "-fstack-protector-strong", // oneTBB: WebAssembly's stack holds no return addresses
  "-fno-trapping-math", // Cycles: permission to optimize; without it the code is only stricter
  "-fno-signed-zeros", // Cycles: likewise
  "-freciprocal-math", // Cycles: likewise
  "-ffp-contract=on", // Cycles: Clang's default
  "-ffast-math", // Blender's libc_compat: likewise
  "-Wl,--version-script=", // Blender: ELF symbol versions, which wasm-ld does not have
};

int main(int argc, char **argv) {
  if (argc < 2) return 64;
  int kept = 1;
  for (int index = 1; index < argc; index++) {
    int drop = 0;
    for (size_t option = 0; option < sizeof dropped / sizeof *dropped; option++) {
      const size_t length = strlen(dropped[option]);
      if (dropped[option][length - 1] == '=' ? !strncmp(argv[index], dropped[option], length)
                                             : !strcmp(argv[index], dropped[option])) drop = 1;
    }
    if (!drop) argv[kept++] = argv[index];
  }
  argv[kept] = NULL;
  execvp(argv[1], argv + 1);
  perror(argv[1]);
  return 127;
}
