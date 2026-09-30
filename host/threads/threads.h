#pragma once
#include <stdint.h>
#include <dolly/threads-abi.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct { uint32_t tid, reserved; } dolly_thread_identity;
typedef struct { uint32_t tid, flags; } dolly_thread_wait_request;

/* Return a positive TID or negative errno; WAIT returns zero or negative errno.
 * Child entry may run before spawn returns. Only WAIT confirms that its stack
 * and TLS can be reclaimed. Process exit/trap ends every thread. */
int dolly_thread_spawn(uint64_t argument);
int dolly_thread_self(void);
int dolly_thread_wait(uint32_t tid, uint32_t flags, uint64_t *result);
__attribute__((noreturn)) void dolly_thread_exit(uint64_t result);

/* Exported by the language runtime's stackless startup trampoline. */
uint64_t dolly_thread_start(uint32_t tid, uint64_t argument);

#ifdef __cplusplus
}
#endif
