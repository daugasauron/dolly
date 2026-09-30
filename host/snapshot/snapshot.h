#pragma once
#include <stdint.h>
#include <stdatomic.h>

/* Opaque session transfer, serviced by the kernel. This is the mailbox C
 * layout, not a process API for invoking kernel functions. */
enum {
  DOLLY_SESSION_NAME_CAPACITY = 128,
  DOLLY_SESSION_MAILBOX_HEADER_SIZE = 64,
  DOLLY_SESSION_TRANSFER_CAPACITY = 1024 * 1024,
};
typedef struct {
  _Atomic uint32_t request_sequence, completed_sequence, status, name_length;
  _Atomic uint32_t chunk_sequence, chunk_consumed_sequence, chunk_length, chunk_eof;
  _Atomic uint32_t total_size_low, total_size_high, cancelled_sequence;
  unsigned char reserved[20];
} dolly_session_mailbox;
