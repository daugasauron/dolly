#pragma once
#include <stdint.h>

/* The packets and constants of dolly-pty-0.wat. A prototype: the manifest
 * lists neither this header nor a client, so the seed is unchanged and a
 * program that wants pseudo-terminals carries its own calls. Listed, the
 * constants come from the generated pty-abi.h and its digest is stamped. */
enum {
  DOLLY_PTY_OPEN = 176,
  DOLLY_PTY_RESIZE = 177,
  DOLLY_PTY_CLOEXEC = 1,
  DOLLY_PTY_NONBLOCK = 2,
  DOLLY_PTY_LIMIT = 32,
  DOLLY_PTY_INPUT_BYTES = 4096,
  DOLLY_PTY_OUTPUT_BYTES = 65536,
};
typedef struct { uint32_t descriptor, flags, rows, columns; } dolly_pty_request;
typedef struct { uint32_t master, slave, number, reserved; } dolly_pty_descriptors;
