// What Emscripten's libc and WasmFS ask of a host. The kernel answers each from
// its own state or from a Dolly import (abi/dolly-browser-0.wat), so no WASI
// or Emscripten name reaches that contract; the build's exact import check
// fails if a libc update asks for another.
#include <stddef.h>
#include <stdint.h>

#include <wasi/api.h>

#include "process-kernel.h"

// Milliseconds: since the epoch, and since the runtime Worker started.
DOLLY_BROWSER_IMPORT(dolly_clock_realtime) double dolly_clock_realtime(void);
DOLLY_BROWSER_IMPORT(dolly_clock_monotonic) double dolly_clock_monotonic(void);
// At most 65536 bytes a call; zero or a negative errno.
DOLLY_BROWSER_IMPORT(dolly_entropy) int dolly_entropy(uint8_t *bytes, uintptr_t length);

__wasi_errno_t __wasi_clock_time_get(__wasi_clockid_t clock, __wasi_timestamp_t precision,
                                     __wasi_timestamp_t *nanoseconds) {
  (void)precision;
  if (clock != __WASI_CLOCKID_REALTIME && clock != __WASI_CLOCKID_MONOTONIC) return __WASI_ERRNO_INVAL;
  *nanoseconds = (__wasi_timestamp_t)(
      (clock == __WASI_CLOCKID_REALTIME ? dolly_clock_realtime() : dolly_clock_monotonic()) * 1e6);
  return __WASI_ERRNO_SUCCESS;
}

// Date.now counts milliseconds; performance.now is clamped to microseconds or coarser.
__wasi_errno_t __wasi_clock_res_get(__wasi_clockid_t clock, __wasi_timestamp_t *nanoseconds) {
  if (clock != __WASI_CLOCKID_REALTIME && clock != __WASI_CLOCKID_MONOTONIC) return __WASI_ERRNO_INVAL;
  *nanoseconds = clock == __WASI_CLOCKID_REALTIME ? 1000000 : 1000;
  return __WASI_ERRNO_SUCCESS;
}

__wasi_errno_t __wasi_random_get(uint8_t *bytes, __wasi_size_t length) {
  return (__wasi_errno_t)-dolly_entropy(bytes, length);
}

// The kernel sets its own environment (src/dolly.c); the host supplies none.
__wasi_errno_t __wasi_environ_sizes_get(__wasi_size_t *count, __wasi_size_t *bytes) {
  *count = 0;
  *bytes = 0;
  return __WASI_ERRNO_SUCCESS;
}

__wasi_errno_t __wasi_environ_get(uint8_t **environment, uint8_t *bytes) {
  (void)environment;
  (void)bytes;
  return __WASI_ERRNO_SUCCESS;
}

// Memory grows inside Wasm; trusted JavaScript reads memory.buffer at each use.
void emscripten_notify_memory_growth(size_t memory) { (void)memory; }

// Emscripten's standalone runtime imports WASI's fd_write and fd_read under
// these two names, for its own diagnostics, WasmFS's stdout and stderr, and
// WasmFS's stdin. Diagnostics are boot text. Nothing reads WasmFS's stdin:
// processes reach the terminal through their own descriptors.
__wasi_errno_t imported__wasi_fd_write(__wasi_fd_t descriptor, const __wasi_ciovec_t *vectors,
                                       size_t count, __wasi_size_t *written) {
  (void)descriptor;
  *written = 0;
  for (size_t index = 0; index < count; ++index) {
    const int status = dolly_bootstrap_write_bytes(vectors[index].buf, vectors[index].buf_len);
    if (status < 0) return (__wasi_errno_t)-status;
    *written += vectors[index].buf_len;
  }
  return __WASI_ERRNO_SUCCESS;
}

__wasi_errno_t imported__wasi_fd_read(__wasi_fd_t descriptor, const __wasi_iovec_t *vectors,
                                      size_t count, __wasi_size_t *read) {
  (void)descriptor;
  (void)vectors;
  (void)count;
  *read = 0;
  return __WASI_ERRNO_SUCCESS;
}
