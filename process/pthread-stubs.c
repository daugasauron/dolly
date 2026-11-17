/*
 * Without -pthread a process is one thread, so Emscripten's upstream
 * non-threaded pthread implementation is the generic fallback (threads@0 runs
 * the threads of a -pthread program). Keep every definition in the generic
 * object weak so normal static-link ownership works exactly as it does for a
 * libc fallback: a runtime's strong definition wins without a special linker
 * flag or a package-specific exclusion list.
 */

#pragma weak __acquire_ptc
#pragma weak __inhibit_ptc
#pragma weak __lock
#pragma weak __private_cond_signal
#pragma weak __pthread_cond_timedwait
#pragma weak __pthread_create
#pragma weak __pthread_detach
#pragma weak __pthread_exit
#pragma weak __pthread_join
#pragma weak __pthread_key_create
#pragma weak __pthread_key_delete
#pragma weak __pthread_mutex_lock
#pragma weak __pthread_mutex_timedlock
#pragma weak __pthread_mutex_trylock
#pragma weak __pthread_mutex_unlock
#pragma weak __pthread_once
#pragma weak __pthread_testcancel
#pragma weak __release_ptc
#pragma weak __unlock
#pragma weak __wait
#pragma weak emscripten_current_thread_process_queued_calls
#pragma weak emscripten_futex_wait
#pragma weak emscripten_futex_wake
#pragma weak emscripten_has_threading_support
#pragma weak emscripten_is_main_runtime_thread
#pragma weak emscripten_main_thread_process_queued_calls
#pragma weak emscripten_num_logical_cores
#pragma weak emscripten_thread_sleep
#pragma weak pthread_atfork
#pragma weak pthread_barrier_destroy
#pragma weak pthread_barrier_init
#pragma weak pthread_barrier_wait
#pragma weak pthread_cancel
#pragma weak pthread_cond_broadcast
#pragma weak pthread_cond_destroy
#pragma weak pthread_cond_init
#pragma weak pthread_cond_signal
#pragma weak pthread_cond_timedwait
#pragma weak pthread_cond_wait
#pragma weak pthread_create
#pragma weak pthread_detach
#pragma weak pthread_equal
#pragma weak pthread_exit
#pragma weak pthread_getspecific
#pragma weak pthread_join
#pragma weak pthread_key_create
#pragma weak pthread_key_delete
#pragma weak pthread_kill
#pragma weak pthread_mutex_consistent
#pragma weak pthread_mutex_destroy
#pragma weak pthread_mutex_init
#pragma weak pthread_mutex_lock
#pragma weak pthread_mutex_timedlock
#pragma weak pthread_mutex_trylock
#pragma weak pthread_mutex_unlock
#pragma weak pthread_once
#pragma weak pthread_rwlock_destroy
#pragma weak pthread_rwlock_init
#pragma weak pthread_rwlock_rdlock
#pragma weak pthread_rwlock_timedrdlock
#pragma weak pthread_rwlock_timedwrlock
#pragma weak pthread_rwlock_tryrdlock
#pragma weak pthread_rwlock_trywrlock
#pragma weak pthread_rwlock_unlock
#pragma weak pthread_rwlock_wrlock
#pragma weak pthread_setcancelstate
#pragma weak pthread_setcanceltype
#pragma weak pthread_setspecific
#pragma weak pthread_testcancel
#pragma weak sem_post
#pragma weak sem_trywait
#pragma weak sem_wait
#pragma weak thrd_detach

/* Upstream answers these with success whatever happened. Each is defined
 * below as the one thread of a serial process sees it, as threads@0 answers. */
#define pthread_cancel emscripten_stub_pthread_cancel
#define pthread_kill emscripten_stub_pthread_kill
#define pthread_mutex_init emscripten_stub_pthread_mutex_init
#define __pthread_mutex_lock emscripten_stub___pthread_mutex_lock
#define __pthread_mutex_trylock emscripten_stub___pthread_mutex_trylock
#define __pthread_mutex_timedlock emscripten_stub___pthread_mutex_timedlock
#define __pthread_mutex_unlock emscripten_stub___pthread_mutex_unlock
#define pthread_mutex_lock emscripten_stub_pthread_mutex_lock
#define pthread_mutex_trylock emscripten_stub_pthread_mutex_trylock
#define pthread_mutex_timedlock emscripten_stub_pthread_mutex_timedlock
#define pthread_mutex_unlock emscripten_stub_pthread_mutex_unlock
#define __pthread_cond_timedwait emscripten_stub___pthread_cond_timedwait
#define pthread_cond_timedwait emscripten_stub_pthread_cond_timedwait
#define pthread_setcancelstate emscripten_stub_pthread_setcancelstate
#define pthread_setcanceltype emscripten_stub_pthread_setcanceltype
#define pthread_barrier_init emscripten_stub_pthread_barrier_init
#define pthread_barrier_wait emscripten_stub_pthread_barrier_wait
#define pthread_rwlock_rdlock emscripten_stub_pthread_rwlock_rdlock
#define pthread_rwlock_tryrdlock emscripten_stub_pthread_rwlock_tryrdlock
#define pthread_rwlock_timedrdlock emscripten_stub_pthread_rwlock_timedrdlock
#define pthread_rwlock_wrlock emscripten_stub_pthread_rwlock_wrlock
#define pthread_rwlock_trywrlock emscripten_stub_pthread_rwlock_trywrlock
#define pthread_rwlock_timedwrlock emscripten_stub_pthread_rwlock_timedwrlock
#define pthread_rwlock_unlock emscripten_stub_pthread_rwlock_unlock
#include "library_pthread_stub.c"
#undef pthread_cancel
#undef pthread_kill
#undef pthread_mutex_init
#undef __pthread_mutex_lock
#undef __pthread_mutex_trylock
#undef __pthread_mutex_timedlock
#undef __pthread_mutex_unlock
#undef pthread_mutex_lock
#undef pthread_mutex_trylock
#undef pthread_mutex_timedlock
#undef pthread_mutex_unlock
#undef __pthread_cond_timedwait
#undef pthread_cond_timedwait
#undef pthread_setcancelstate
#undef pthread_setcanceltype
#undef pthread_barrier_init
#undef pthread_barrier_wait
#undef pthread_rwlock_rdlock
#undef pthread_rwlock_tryrdlock
#undef pthread_rwlock_timedrdlock
#undef pthread_rwlock_wrlock
#undef pthread_rwlock_trywrlock
#undef pthread_rwlock_timedwrlock
#undef pthread_rwlock_unlock
#include <limits.h>
#include <signal.h>
#include <time.h>

/* The one thread a serial process has is not cancelled: ENOTSUP. */
int pthread_cancel(pthread_t thread) {
  (void)thread;
  return ENOTSUP;
}

int pthread_kill(pthread_t thread, int number) {
  if (thread != pthread_self()) return ESRCH;
  return number == 0 || raise(number) == 0 ? 0 : errno;
}

/* No other thread can end a wait, so one with a deadline lasts until it. A
 * handler that runs meanwhile ends it early, as a spurious wake-up. */
static int wait_until(clockid_t clock, const struct timespec *deadline) {
  if (deadline->tv_nsec < 0 || deadline->tv_nsec >= 1000000000L) return EINVAL;
  if (deadline->tv_sec < 0) return ETIMEDOUT;
  const int error = clock_nanosleep(clock, TIMER_ABSTIME, deadline, NULL);
  return error == 0 ? ETIMEDOUT : error;
}

/* A mutex is held while _m_lock is nonzero, as musl's own code reads it;
 * _m_count counts a recursive mutex's further locks. */
int pthread_mutex_init(pthread_mutex_t *restrict mutex, const pthread_mutexattr_t *restrict attributes) {
  *mutex = (pthread_mutex_t){0};
  if (attributes) mutex->_m_type = attributes->__attr;
  return 0;
}

int __pthread_mutex_trylock(pthread_mutex_t *mutex) {
  if (!mutex->_m_lock) {
    mutex->_m_lock = 1;
    return 0;
  }
  if ((mutex->_m_type & 3) != PTHREAD_MUTEX_RECURSIVE) return EBUSY;
  if (mutex->_m_count == INT_MAX) return EAGAIN;
  mutex->_m_count++;
  return 0;
}

/* The one thread holds a mutex it cannot take: without a deadline, waiting
 * would be a deadlock. A handler may release it meanwhile. */
int __pthread_mutex_timedlock(pthread_mutex_t *restrict mutex, const struct timespec *restrict deadline) {
  for (;;) {
    const int busy = __pthread_mutex_trylock(mutex);
    if (busy != EBUSY) return busy;
    if (!deadline || (mutex->_m_type & 3) == PTHREAD_MUTEX_ERRORCHECK) return EDEADLK;
    const int waited = wait_until(CLOCK_REALTIME, deadline);
    if (waited != EINTR) return waited;
  }
}

int __pthread_mutex_lock(pthread_mutex_t *mutex) {
  return __pthread_mutex_timedlock(mutex, NULL);
}

int __pthread_mutex_unlock(pthread_mutex_t *mutex) {
  if (!mutex->_m_lock) return (mutex->_m_type & 3) == PTHREAD_MUTEX_NORMAL ? 0 : EPERM;
  if (mutex->_m_count) mutex->_m_count--;
  else mutex->_m_lock = 0;
  return 0;
}

weak_alias(__pthread_mutex_trylock, pthread_mutex_trylock);
weak_alias(__pthread_mutex_timedlock, pthread_mutex_timedlock);
weak_alias(__pthread_mutex_lock, pthread_mutex_lock);
weak_alias(__pthread_mutex_unlock, pthread_mutex_unlock);

/* A condition keeps the realtime clock: this libc sets no attribute's. */
int __pthread_cond_timedwait(pthread_cond_t *restrict condition, pthread_mutex_t *restrict mutex,
                             const struct timespec *restrict deadline) {
  (void)condition; (void)mutex;
  if (!deadline) return 0;
  const int error = wait_until(CLOCK_REALTIME, deadline);
  return error == EINTR ? 0 : error;
}

weak_alias(__pthread_cond_timedwait, pthread_cond_timedwait);

int pthread_setcancelstate(int state, int *previous) {
  if ((unsigned)state > 2) return EINVAL;
  if (previous) *previous = __pthread_self()->canceldisable;
  __pthread_self()->canceldisable = state;
  return 0;
}

int pthread_setcanceltype(int type, int *previous) {
  if ((unsigned)type > 1) return EINVAL;
  if (previous) *previous = __pthread_self()->cancelasync;
  __pthread_self()->cancelasync = type;
  return 0;
}

/* No second thread can arrive at a barrier. */
int pthread_barrier_init(pthread_barrier_t *restrict barrier, const pthread_barrierattr_t *restrict attributes,
                         unsigned count) {
  (void)attributes;
  if (count == 0 || count > INT_MAX) return EINVAL;
  if (count > 1) return EAGAIN;
  *barrier = (pthread_barrier_t){0};
  return 0;
}

int pthread_barrier_wait(pthread_barrier_t *barrier) {
  (void)barrier;
  return PTHREAD_BARRIER_SERIAL_THREAD;
}

/* _rw_lock counts the readers, or is WRITER while the one thread writes. */
enum { WRITER = INT_MAX };

static int rwlock_try(pthread_rwlock_t *lock, int write) {
  if (write ? lock->_rw_lock != 0 : lock->_rw_lock == WRITER) return EBUSY;
  if (!write && lock->_rw_lock == WRITER - 1) return EAGAIN;
  lock->_rw_lock = write ? WRITER : lock->_rw_lock + 1;
  return 0;
}

static int rwlock_wait(pthread_rwlock_t *lock, int write, const struct timespec *deadline) {
  for (;;) {
    const int busy = rwlock_try(lock, write);
    if (busy != EBUSY) return busy;
    if (!deadline) return EDEADLK;
    const int waited = wait_until(CLOCK_REALTIME, deadline);
    if (waited != EINTR) return waited;
  }
}

int pthread_rwlock_tryrdlock(pthread_rwlock_t *lock) { return rwlock_try(lock, 0); }
int pthread_rwlock_trywrlock(pthread_rwlock_t *lock) { return rwlock_try(lock, 1); }
int pthread_rwlock_rdlock(pthread_rwlock_t *lock) { return rwlock_wait(lock, 0, NULL); }
int pthread_rwlock_wrlock(pthread_rwlock_t *lock) { return rwlock_wait(lock, 1, NULL); }
int pthread_rwlock_timedrdlock(pthread_rwlock_t *restrict lock, const struct timespec *restrict deadline) {
  return rwlock_wait(lock, 0, deadline);
}
int pthread_rwlock_timedwrlock(pthread_rwlock_t *restrict lock, const struct timespec *restrict deadline) {
  return rwlock_wait(lock, 1, deadline);
}

int pthread_rwlock_unlock(pthread_rwlock_t *lock) {
  lock->_rw_lock = lock->_rw_lock == WRITER || lock->_rw_lock == 0 ? 0 : lock->_rw_lock - 1;
  return 0;
}
