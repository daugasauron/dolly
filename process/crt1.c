#include <stdlib.h>

void __wasm_init_tls(void *memory);
void __wasm_call_ctors(void);
void __dolly_signal_start(void);
int __main_void(void);

void _start(void) {
#ifdef __EMSCRIPTEN_PTHREADS__
  /* TLS, the signal state, then the main thread. */
  void __dolly_pthread_init(void);
  __dolly_pthread_init();
#else
  /* The linker initializes the main TLS region at instantiation. Complete
     its address relocations before any C/C++ constructor can read it. */
  __wasm_init_tls(__builtin_wasm_tls_base());
  /* What exec carried over, before a call a pending signal could interrupt. */
  __dolly_signal_start();
#endif
  __wasm_call_ctors();
  exit(__main_void());
}
