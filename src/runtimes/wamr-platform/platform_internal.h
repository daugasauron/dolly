#ifndef DOLLY_WAMR_PLATFORM_INTERNAL_H
#define DOLLY_WAMR_PLATFORM_INTERNAL_H

#include <ctype.h>
#include <errno.h>
#include <inttypes.h>
#include <limits.h>
#include <math.h>
#include <stdbool.h>
#include <stdarg.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/time.h>
#include <time.h>

#define BH_PLATFORM_DOLLY
#define BH_APPLET_PRESERVED_STACK_SIZE (2 * BH_KB)
#define BH_THREAD_DEFAULT_PRIORITY 0

/* Dolly executes one command at a time on one browser worker. */
typedef uintptr_t korp_tid;
typedef int korp_mutex;
typedef int korp_cond;
typedef int korp_thread;
typedef int korp_rwlock;
typedef int korp_sem;

#define os_thread_local_attribute

typedef int os_file_handle;
typedef void *os_dir_stream;
typedef int os_raw_file_handle;
typedef int os_poll_file_handle;
typedef unsigned int os_nfds_t;
typedef struct timespec os_timespec;

static inline os_file_handle
os_get_invalid_handle(void)
{
    return -1;
}

static inline int
os_getpagesize(void)
{
    return 65536;
}

#endif
