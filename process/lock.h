#pragma once

/* Adapter bookkeeping only. Public pthread primitives come from musl. */
typedef int dolly_lock;
/* threads.c: a host of libraries waits through dso@0's loader. */
int emscripten_futex_wait(volatile void *address, unsigned value, double milliseconds);
static inline void dolly_lock_acquire(dolly_lock *lock) {
#ifdef __EMSCRIPTEN_PTHREADS__
  while (__atomic_exchange_n(lock, 1, __ATOMIC_ACQUIRE))
    emscripten_futex_wait(lock, 1, __builtin_inf());
#else
  (void)lock;
#endif
}
static inline void dolly_lock_release(dolly_lock *lock) {
#ifdef __EMSCRIPTEN_PTHREADS__
  __atomic_store_n(lock, 0, __ATOMIC_RELEASE);
  __builtin_wasm_memory_atomic_notify(lock, 1);
#else
  (void)lock;
#endif
}
