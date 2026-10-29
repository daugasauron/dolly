/* One thread grows the memory and hands each new page to another, which fills
 * it at once. Chrome checks memory.fill against each thread's own record of
 * the size, which another thread's growth updates late, so this trapped there
 * until a threaded process started at its maximum (src/process-supervisor.mjs). */
#include <pthread.h>
#include <stdint.h>
#include <string.h>
static uint64_t page;
static int done;
static void *fill(void *argument) {
  (void)argument;
  for (uint64_t address; !__atomic_load_n(&done, __ATOMIC_ACQUIRE);) {
    if ((address = __atomic_load_n(&page, __ATOMIC_ACQUIRE)) == 0) continue;
    memset((void *)(uintptr_t)address, 1, 4096);
    __atomic_store_n(&page, 0, __ATOMIC_RELEASE);
  }
  return NULL;
}
int main(void) {
  pthread_t thread;
  if (pthread_create(&thread, NULL, fill, NULL)) return 2;
  for (int round = 0; round < 4000; ++round) {
    size_t old = __builtin_wasm_memory_grow(0, 1);
    if (old == (size_t)-1) break;
    __atomic_store_n(&page, (uint64_t)old * 65536, __ATOMIC_RELEASE);
    while (__atomic_load_n(&page, __ATOMIC_ACQUIRE)) {}
  }
  __atomic_store_n(&done, 1, __ATOMIC_RELEASE);
  return pthread_join(thread, NULL);
}
