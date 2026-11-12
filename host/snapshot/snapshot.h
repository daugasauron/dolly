#pragma once
#include <stdint.h>
#include <stdatomic.h>

/* Opaque session transfer, serviced by the kernel. This is the mailbox C
 * layout of dolly-snapshot-0.wat, whose sizes and words kernel.c checks it
 * against, not a process API for invoking kernel functions. */
typedef struct {
  _Atomic uint32_t request_sequence, completed_sequence, status;
  _Atomic uint32_t chunk_sequence, chunk_consumed_sequence, chunk_length, chunk_eof;
  _Atomic uint32_t total_size_low, total_size_high, cancelled_sequence;
  unsigned char reserved[24];
} dolly_session_mailbox;
