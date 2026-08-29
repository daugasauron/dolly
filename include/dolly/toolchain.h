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
};

// Runs Dolly's in-process C/C++/linker driver. The caller supplies the ordinary
// command argument vector and selects a source language or object-only linking.
int dolly_toolchain_main(int argc, char **argv, int default_language);

#ifdef __cplusplus
}
#endif

#endif
