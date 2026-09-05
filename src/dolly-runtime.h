#ifndef DOLLY_RUNTIME_H
#define DOLLY_RUNTIME_H

#include <stdint.h>

#include <dolly/runtime.h>

enum {
  DOLLY_HTTP_MAILBOX_VERSION = 2,
  DOLLY_HTTP_MAILBOX_HEADER_SIZE = 64,
};

int dolly_terminal_read_raw(void);
int dolly_terminal_read_raw_timeout(double milliseconds);
int dolly_isatty(int descriptor);
uint32_t dolly_terminal_columns(void);
uint32_t dolly_terminal_rows(void);
int dolly_terminal_mode_get(int descriptor);
int dolly_terminal_mode_set(int descriptor, uint32_t flags);
void dolly_terminal_reset_cooked(void);
void dolly_terminal_publish_result(int status);
void dolly_terminal_write(const char *text);
void dolly_terminal_write_bytes(const unsigned char *bytes, uintptr_t length);

#endif
