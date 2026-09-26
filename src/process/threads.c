#define _GNU_SOURCE
#include "pthread_impl.h"
#include "stdio_impl.h"
#include "lock.h"
#include <dolly/threads.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>

typedef struct dolly_pthread {
  uintptr_t stack_top; /* Consumed by the stackless assembly trampoline. */
  struct pthread thread;
  void *(*entry)(void *);
  void *argument;
  void *tls;
  sigset_t mask;
  int host_tid, detached, finished, joining, c11;
  struct dolly_pthread *garbage_next;
} dolly_pthread;

static dolly_pthread main_thread;
static dolly_pthread *garbage;
static dolly_lock thread_list_lock;
unsigned __default_stacksize = 2 * 1024 * 1024;
unsigned __default_guardsize = 0;
extern unsigned char __stack_high, __stack_low;
void __wasm_init_tls(void *);
void __do_orphaned_stdio_locks(void);

void __tl_lock(void) { dolly_lock_acquire(&thread_list_lock); }
void __tl_unlock(void) { dolly_lock_release(&thread_list_lock); }
void __tl_sync(pthread_t thread) { (void)thread; __tl_lock(); __tl_unlock(); }

static dolly_pthread *record(pthread_t thread) {
  return (dolly_pthread *)((char *)thread - offsetof(dolly_pthread, thread));
}

static void reap_detached(void) {
  __tl_lock();
  dolly_pthread **link = &garbage;
  while (*link) {
    dolly_pthread *item = *link;
    uint64_t result;
    if (item->host_tid && dolly_thread_wait(item->host_tid, DOLLY_THREAD_WAIT_NONBLOCK, &result) == 0) {
      *link = item->garbage_next;
      item->thread.self = NULL;
      if (item != &main_thread) free(item);
    } else link = &item->garbage_next;
  }
  __tl_unlock();
}

static void initialize_thread(dolly_pthread *item, int tid, int main) {
  item->thread.self = &item->thread;
  item->thread.tid = tid;
  item->thread.robust_list.head = &item->thread.robust_list.head;
  __set_thread_state(&item->thread, 0, main, 1);
}

void __dolly_pthread_init(void) {
  __wasm_init_tls(__builtin_wasm_tls_base());
  int tid = dolly_thread_self();
  if (tid <= 0) __builtin_trap();
  main_thread.host_tid = tid;
  main_thread.thread.tsd = __pthread_tsd_main;
  main_thread.thread.next = main_thread.thread.prev = &main_thread.thread;
  main_thread.thread.detach_state = DT_JOINABLE;
  main_thread.thread.stack = &__stack_high;
  main_thread.thread.stack_size = (uintptr_t)&__stack_high - (uintptr_t)&__stack_low;
  initialize_thread(&main_thread, tid, 1);
  /* Keep libc locking enabled for the entire static thread profile. */
  libc.threaded = libc.need_locks = 1;
  for (FILE *file = *__ofl_lock(); file; file = file->next)
    if (file->lock < 0) file->lock = 0;
  __ofl_unlock();
  if (__stdin_used) __stdin_used->lock = 0;
  if (__stdout_used) __stdout_used->lock = 0;
  if (__stderr_used) __stderr_used->lock = 0;
}

int __dolly_thread_tid(void) { return __pthread_self()->tid; }

/* Wasm Workers are preemptively scheduled; there is no guest yield primitive. */
int sched_yield(void) { errno = ENOTSUP; return -1; }

int __pthread_create(pthread_t *restrict result, const pthread_attr_t *restrict attributes,
                     void *(*entry)(void *), void *restrict argument) {
  if (!result || !entry) return EINVAL;
  int c11 = attributes == __ATTRP_C11_THREAD;
  pthread_attr_t attr = {0};
  if (attributes && !c11) attr = *attributes;
  else attr._a_stacksize = __default_stacksize;
  if (attr._a_sched || attr._a_policy || attr._a_prio) return ENOTSUP;
  if (attr._a_stacksize < PTHREAD_STACK_MIN || attr._a_stacksize > 256 * 1024 * 1024)
    return EINVAL;
  if (attr._a_guardsize) return ENOTSUP; /* Linear memory has no page protection. */
  if (attr._a_stackaddr && (attr._a_stackaddr % 16 || attr._a_stackaddr < attr._a_stacksize)) return EINVAL;
  reap_detached();
  size_t alignment = __builtin_wasm_tls_align();
  if (alignment < 16) alignment = 16;
  size_t header = (sizeof(dolly_pthread) + alignment - 1) & -alignment;
  size_t tls_size = (__builtin_wasm_tls_size() + 15) & -16;
  size_t tsd_size = (__pthread_tsd_size + 15) & -16;
  size_t stack_size = (attr._a_stacksize + 15) & -16;
  size_t size = header + tls_size + tsd_size + (attr._a_stackaddr ? 0 : stack_size);
  dolly_pthread *item;
  if (posix_memalign((void **)&item, alignment, size)) return EAGAIN;
  memset(item, 0, size);
  item->tls = (char *)item + header;
  item->thread.tsd = (void **)((char *)item->tls + tls_size);
  item->stack_top = attr._a_stackaddr ? attr._a_stackaddr : (uintptr_t)item + size;
  item->entry = entry;
  item->c11 = c11;
  item->argument = argument;
  item->detached = attr._a_detach != 0;
  item->thread.detach_state = item->detached ? DT_DETACHED : DT_JOINABLE;
  item->thread.stack = (void *)item->stack_top;
  item->thread.stack_size = stack_size;
  item->thread.map_base = (void *)item;
  item->thread.map_size = size;
  item->thread.self = &item->thread;
  pthread_sigmask(SIG_BLOCK, NULL, &item->mask);
  pthread_t self = __pthread_self();
  __tl_lock();
  item->thread.next = self->next;
  item->thread.prev = self;
  self->next->prev = &item->thread;
  self->next = &item->thread;
  *result = &item->thread;
  int tid = dolly_thread_spawn((uintptr_t)item);
  if (tid > 0) {
    item->host_tid = tid;
    ++libc.threads_minus_1;
  } else {
    item->thread.next->prev = self;
    self->next = item->thread.next;
    *result = NULL;
    free(item);
  }
  __tl_unlock();
  return tid > 0 ? 0 : -tid;
}
weak_alias(__pthread_create, pthread_create);

int __pthread_join(pthread_t thread, void **result) {
  if (thread == __pthread_self()) return EDEADLK;
  reap_detached();
  __tl_lock();
  dolly_pthread *item = record(thread);
  if (thread->self != thread || item->detached || item->joining) {
    __tl_unlock(); return EINVAL;
  }
  item->joining = 1;
  int tid = item->host_tid;
  __tl_unlock();
  uint64_t value;
  int status;
  do { status = dolly_thread_wait(tid, 0, &value); } while (status == -EINTR);
  if (status) {
    __tl_lock(); item->joining = 0; __tl_unlock();
    return -status;
  }
  if (result) *result = (void *)(uintptr_t)value;
  thread->self = NULL;
  if (item != &main_thread) free(item);
  return 0;
}
weak_alias(__pthread_join, pthread_join);

int __pthread_detach(pthread_t thread) {
  __tl_lock();
  dolly_pthread *item = record(thread);
  if (thread->self != thread || item->detached || item->joining) {
    __tl_unlock(); return EINVAL;
  }
  item->detached = 1;
  if (item->finished) { item->garbage_next = garbage; garbage = item; }
  else thread->detach_state = DT_DETACHED;
  __tl_unlock();
  reap_detached();
  return 0;
}
weak_alias(__pthread_detach, pthread_detach);

void __do_cleanup_push(struct __ptcb *cb) {
  pthread_t self = __pthread_self();
  cb->__next = self->cancelbuf;
  self->cancelbuf = cb;
}
void __do_cleanup_pop(struct __ptcb *cb) { __pthread_self()->cancelbuf = cb->__next; }

_Noreturn void __pthread_exit(void *result) {
  pthread_t self = __pthread_self();
  dolly_pthread *item = record(self);
  self->canceldisable = 1;
  while (self->cancelbuf) {
    struct __ptcb *cb = self->cancelbuf;
    self->cancelbuf = cb->__next;
    cb->__f(cb->__x);
  }
  __pthread_tsd_run_dtors();
  __do_orphaned_stdio_locks();
  __tl_lock();
  /* musl tracks robust mutexes in each thread's own linked list. */
  volatile void *volatile *head;
  while ((head = self->robust_list.head) && head != &self->robust_list.head) {
    pthread_mutex_t *mutex = (void *)((char *)head - offsetof(pthread_mutex_t, _m_next));
    self->robust_list.head = *head;
    a_swap(&mutex->_m_lock, 0x40000000);
    __wake(&mutex->_m_lock, 1, (mutex->_m_type & 128) ^ 128);
  }
  self->next->prev = self->prev;
  self->prev->next = self->next;
  --libc.threads_minus_1;
  item->finished = 1;
  self->detach_state = DT_EXITED;
  if (item->detached) { item->garbage_next = garbage; garbage = item; }
  __tl_unlock();
  dolly_thread_exit((uintptr_t)result);
}
weak_alias(__pthread_exit, pthread_exit);

uint64_t __dolly_pthread_start(uint32_t tid, uint64_t argument) {
  dolly_pthread *item = (void *)(uintptr_t)argument;
  __wasm_init_tls(item->tls);
  initialize_thread(item, tid, 0);
  pthread_sigmask(SIG_SETMASK, &item->mask, NULL);
  void *result = item->c11 ? (void *)(intptr_t)((int (*)(void *))item->entry)(item->argument)
      : item->entry(item->argument);
  pthread_exit(result);
}

int emscripten_futex_wait(volatile void *address, uint32_t value, double milliseconds) {
  if ((uintptr_t)address % 4 || !address || isnan(milliseconds)) return -EINVAL;
  int64_t timeout = !isfinite(milliseconds) ? -1 : milliseconds <= 0 ? 0 :
      milliseconds >= (double)INT64_MAX / 1000000 ? INT64_MAX : (int64_t)(milliseconds * 1000000);
  int result = __builtin_wasm_memory_atomic_wait32((int *)address, value, timeout);
  return result == 0 ? 0 : result == 1 ? -EAGAIN : -ETIMEDOUT;
}
int emscripten_futex_wake(volatile void *address, int count) {
  if ((uintptr_t)address % 4 || !address || count < 0) return -EINVAL;
  return __builtin_wasm_memory_atomic_notify((int *)address, count);
}

int pthread_cancel(pthread_t thread) { (void)thread; return ENOTSUP; }
int pthread_kill(pthread_t thread, int signal) {
  if (signal) return ENOTSUP;
  return thread && thread->self == thread ? 0 : ESRCH;
}
int pthread_setcanceltype(int type, int *previous) {
  if (type != PTHREAD_CANCEL_DEFERRED) return type == PTHREAD_CANCEL_ASYNCHRONOUS ? ENOTSUP : EINVAL;
  if (previous) *previous = PTHREAD_CANCEL_DEFERRED;
  return 0;
}
int _emscripten_thread_is_valid(pthread_t thread) { return thread && thread->self == thread; }
bool emscripten_has_threading_support(void) { return true; }
/* Every Dolly process thread is a Worker, so blocking never runs on the DOM thread. */
void emscripten_check_blocking_allowed(void) {}
