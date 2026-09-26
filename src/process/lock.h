#pragma once

/* Adapter bookkeeping only. Public pthread primitives come from musl. */
typedef int dolly_lock;
static inline void dolly_lock_acquire(dolly_lock *lock) {
#ifdef __EMSCRIPTEN_PTHREADS__
  while (__atomic_exchange_n(lock, 1, __ATOMIC_ACQUIRE))
    __builtin_wasm_memory_atomic_wait32(lock, 1, -1);
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
