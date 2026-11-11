#pragma once
#include <stdint.h>
#include <dolly/pty-abi.h>

/* The packets of dolly-pty-0.wat. Programs use <pty.h> and <sys/ioctl.h>: the
 * client implements openpty over OPEN, and ioctl(TIOCSWINSZ) is the libc's
 * generic terminal request (process.h). */
typedef struct { uint32_t descriptor, flags, rows, columns; } dolly_pty_request;
typedef struct { uint32_t master, slave, number, reserved; } dolly_pty_descriptors;
