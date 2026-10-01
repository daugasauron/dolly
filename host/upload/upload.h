#pragma once
#include <stdint.h>
#include <stdatomic.h>
#include <dolly/upload-abi.h>

/* Host mailbox layout; dolly-upload-0.wat owns its version and semantics. */
typedef struct {
  _Atomic uint32_t request, cancelled, completed, chunk, consumed;
  _Atomic uint32_t length, error, eof, enabled, size;
  unsigned char reserved[24];
  unsigned char data[DOLLY_UPLOAD_CHUNK_CAPACITY];
} dolly_upload_mailbox;

#ifdef __cplusplus
extern "C" {
#endif
/* Request a user-selected file. The destination remains inside Dolly. */
int dolly_upload_file(const char *path);
#ifdef __cplusplus
}
#endif
