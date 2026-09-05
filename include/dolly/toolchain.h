#ifndef DOLLY_TOOLCHAIN_API_H
#define DOLLY_TOOLCHAIN_API_H

#ifdef __cplusplus
extern "C" {
#endif

enum {
  DOLLY_TOOLCHAIN_C = 0,
  DOLLY_TOOLCHAIN_CXX = 1,
  DOLLY_TOOLCHAIN_LD = 2,
  DOLLY_TOOLCHAIN_AR = 3,
  DOLLY_TOOLCHAIN_ZIG = 4,
};

// Runs the compiler process's C/C++/linker driver. This function is internal to
// /usr/libexec/dolly/compiler; it is not a kernel service or machine-ABI entry.
int dolly_toolchain_main(int argc, char **argv, int default_language);

// Process tool frontends delegate to the private compiler executable instead
// of linking LLVM into every /bin entry. This is a userspace helper, not a
// machine-ABI import.
int dolly_toolchain_proxy(int argc, char **argv, int default_language);

#ifdef __cplusplus
}
#endif

#endif
