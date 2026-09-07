#include <stdlib.h>

void __wasm_init_tls(void *memory);
void __wasm_call_ctors(void);
int __main_void(void);

void _start(void) {
  /* The linker initializes the main TLS region at instantiation. Complete
     its address relocations before any C/C++ constructor can read it. */
  __wasm_init_tls(__builtin_wasm_tls_base());
  __wasm_call_ctors();
  exit(__main_void());
}
