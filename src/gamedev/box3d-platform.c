#define _POSIX_C_SOURCE 200809L

// Dolly's Box3D target adapter replaces upstream timer.c. Box3D's built-in
// scheduler links pthread primitives even when the normal one-worker world
// never creates a thread. Dolly deliberately executes tasks serially inside
// one Wasm userspace, so synchronization objects carry no host capability and
// worker handles are inert. The scheduler's calling thread still drains every
// queued task in b3SchedulerFinishTask.

#include "core.h"

#include <stdint.h>
#include <string.h>
#include <time.h>

uint64_t b3GetTicks(void) {
  struct timespec now = {0};
  if (clock_gettime(CLOCK_MONOTONIC, &now) != 0) return 0;
  return (uint64_t)now.tv_sec * UINT64_C(1000000000) +
         (uint64_t)now.tv_nsec;
}

float b3GetMilliseconds(uint64_t ticks) {
  return (float)((double)(b3GetTicks() - ticks) / 1000000.0);
}

float b3GetMillisecondsAndReset(uint64_t *ticks) {
  const uint64_t now = b3GetTicks();
  const float elapsed = (float)((double)(now - *ticks) / 1000000.0);
  *ticks = now;
  return elapsed;
}

void b3Yield(void) {}
void b3Sleep(int milliseconds) { (void)milliseconds; }

struct b3Mutex { unsigned unused; };
struct b3Semaphore { int count; };
struct b3Thread { unsigned unused; };

b3Mutex *b3CreateMutex(void) {
  return b3AllocZeroed(sizeof(b3Mutex));
}

void b3DestroyMutex(b3Mutex *mutex) {
  b3Free(mutex, sizeof(b3Mutex));
}

void b3LockMutex(b3Mutex *mutex) { (void)mutex; }
void b3UnlockMutex(b3Mutex *mutex) { (void)mutex; }

b3Semaphore *b3CreateSemaphore(int initial_count) {
  b3Semaphore *semaphore = b3Alloc(sizeof(b3Semaphore));
  semaphore->count = initial_count;
  return semaphore;
}

void b3DestroySemaphore(b3Semaphore *semaphore) {
  b3Free(semaphore, sizeof(b3Semaphore));
}

void b3WaitSemaphore(b3Semaphore *semaphore) {
  if (semaphore->count > 0) semaphore->count--;
}

void b3SignalSemaphore(b3Semaphore *semaphore) {
  semaphore->count++;
}

b3Thread *b3CreateThread(b3ThreadFunction *function, void *context,
                         const char *name) {
  (void)function;
  (void)context;
  (void)name;
  return b3AllocZeroed(sizeof(b3Thread));
}

void b3JoinThread(b3Thread *thread) {
  b3Free(thread, sizeof(b3Thread));
}

// This deterministic djb2 variant is part of upstream timer.c rather than the
// OS-independent core. Keep the exact algorithm when replacing that complete
// translation unit so hull and mesh hashes stay compatible with upstream.
uint32_t b3Hash(uint32_t hash, const uint8_t *data, int count) {
  uint32_t result = hash;
  int index = 0;
  while (index + 8 <= count) {
    uint64_t word;
    memcpy(&word, data + index, sizeof(word));
#if defined(__BYTE_ORDER__) && __BYTE_ORDER__ == __ORDER_BIG_ENDIAN__
    word = ((word & UINT64_C(0x00000000000000ff)) << 56) |
           ((word & UINT64_C(0x000000000000ff00)) << 40) |
           ((word & UINT64_C(0x0000000000ff0000)) << 24) |
           ((word & UINT64_C(0x00000000ff000000)) << 8) |
           ((word & UINT64_C(0x000000ff00000000)) >> 8) |
           ((word & UINT64_C(0x0000ff0000000000)) >> 24) |
           ((word & UINT64_C(0x00ff000000000000)) >> 40) |
           ((word & UINT64_C(0xff00000000000000)) >> 56);
#endif
    result = (result << 5) + result + (uint32_t)word;
    result = (result << 5) + result + (uint32_t)(word >> 32);
    index += 8;
  }
  while (index < count) {
    result = (result << 5) + result + data[index];
    index++;
  }
  return result;
}
