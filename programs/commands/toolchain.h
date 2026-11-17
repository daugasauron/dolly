#ifndef DOLLY_TOOLCHAIN_H
#define DOLLY_TOOLCHAIN_H

// The seed compiler's modes (programs/compiler-main.c): cc, c++, ld and ar
// start /usr/libexec/dolly/process-bin/compiler in one of them. Not a kernel
// service, an ABI entry or a header programs compile against.

#ifdef __cplusplus
extern "C" {
#endif

enum {
  DOLLY_TOOLCHAIN_C = 0,
  DOLLY_TOOLCHAIN_CXX = 1,
  DOLLY_TOOLCHAIN_LD = 2,
  DOLLY_TOOLCHAIN_AR = 3,
};

// The compiler's C/C++/linker driver (programs/compiler.cpp).
int dolly_toolchain_main(int argc, char **argv, int default_language);

// What cc, c++, ld and ar run (toolchain.c): the compiler as a private
// process, instead of LLVM linked into every one of them.
int dolly_toolchain_proxy(int argc, char **argv, int default_language);

#ifdef __cplusplus
}
#endif

#endif
