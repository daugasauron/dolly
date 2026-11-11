/* What pty@0's kernel side gives the kernel's other modules: console@0
 * (host/console/kernel.c) holds a master end for the host, which no process's
 * descriptor table names. */
#pragma once
#include "process-kernel.h"

typedef struct dolly_pty dolly_pty;
/* A pair of `rows` by `columns`, both ends open and in no descriptor table;
 * NULL with *error -EINVAL, -ENFILE or -ENOMEM. */
dolly_pty *dolly_pty_pair(uint32_t rows, uint32_t columns, int *error);
dolly_kernel_socket *dolly_pty_master(dolly_pty *pty);
dolly_kernel_socket *dolly_pty_slave(dolly_pty *pty);
/* A new size, and SIGWINCH for the programs on the slave; -EINVAL for none. */
int dolly_pty_resize(dolly_pty *pty, uint32_t rows, uint32_t columns);
/* The master's holder lets go, as a last descriptor would: the programs on
 * the slave get SIGHUP, and a slave that no descriptor names goes too. */
void dolly_pty_release(dolly_pty *pty);
