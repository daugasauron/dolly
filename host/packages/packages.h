#pragma once
#include <stdint.h>
// The mailboxes' _Atomic needs nothing in C++ (Clang), where before C++23
// <stdatomic.h> would cover std::atomic's functions with C's macros.
#ifndef __cplusplus
#include <stdatomic.h>
#endif
#include <dolly/packages-abi.h>

/* Host mailbox layout; dolly-packages-0.wat owns its version and semantics. */
typedef struct {
  _Atomic uint32_t request, cancelled, completed, chunk, consumed;
  _Atomic uint32_t length, error, eof, enabled, size, kind, directory_length;
  unsigned char reserved[16];
  char directory[DOLLY_PACKAGES_DIRECTORY_CAPACITY];
  char pin[DOLLY_PACKAGES_PIN_BYTES];
  unsigned char data[DOLLY_PACKAGES_CHUNK_CAPACITY];
} dolly_packages_mailbox;

/* DOLLY_PACKAGES_FETCH's request; the destination path and the directory follow. */
typedef struct {
  uint32_t kind;
  uint32_t destination_size;
  uint32_t directory_size;
  uint32_t reserved;
  char pin[DOLLY_PACKAGES_PIN_BYTES];
} dolly_packages_request;

#ifdef __cplusplus
extern "C" {
#endif
/* Writes what KIND names into DESTINATION, which must not exist: the page's
 * image directory, DIRECTORY's amy-index.txt, or the snapshot of the package
 * whose recipe DIRECTORY's catalog pins at PIN (64 hex digits). DIRECTORY is
 * NULL for KIND_DIRECTORY. 0 or a negative errno. */
int dolly_packages_fetch(uint32_t kind, const char *directory, const char *pin, const char *destination);
#ifdef __cplusplus
}
#endif
