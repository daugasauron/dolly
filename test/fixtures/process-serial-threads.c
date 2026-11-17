// A program built without -pthread is one thread: its pthread calls answer as
// that thread sees them, as threads@0 would, never with a success that did not happen.
#include <errno.h>
#include <pthread.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <time.h>

#define CHECK(test) do { if (!(test)) { fprintf(stderr, "SERIAL FAIL %d: %s\n", __LINE__, #test); exit(1); } } while (0)

static double now(void) {
  struct timespec value;
  clock_gettime(CLOCK_REALTIME, &value);
  return value.tv_sec + value.tv_nsec / 1e9;
}

static struct timespec after(double seconds) {
  const double at = now() + seconds;
  return (struct timespec){(time_t)at, (long)((at - (time_t)at) * 1e9)};
}

static void *nothing(void *argument) { return argument; }

int main(void) {
  pthread_mutex_t normal = PTHREAD_MUTEX_INITIALIZER;
  CHECK(pthread_mutex_lock(&normal) == 0 && pthread_mutex_trylock(&normal) == EBUSY);
  CHECK(pthread_mutex_lock(&normal) == EDEADLK);
  struct timespec deadline = after(0.2);
  double started = now();
  CHECK(pthread_mutex_timedlock(&normal, &deadline) == ETIMEDOUT && now() - started > 0.15);
  CHECK(pthread_mutex_unlock(&normal) == 0 && pthread_mutex_trylock(&normal) == 0 && pthread_mutex_unlock(&normal) == 0);

  pthread_mutexattr_t attributes;
  pthread_mutex_t recursive, checking;
  CHECK(pthread_mutexattr_init(&attributes) == 0 && pthread_mutexattr_settype(&attributes, PTHREAD_MUTEX_RECURSIVE) == 0);
  CHECK(pthread_mutex_init(&recursive, &attributes) == 0);
  CHECK(pthread_mutex_lock(&recursive) == 0 && pthread_mutex_trylock(&recursive) == 0 && pthread_mutex_lock(&recursive) == 0);
  CHECK(pthread_mutex_unlock(&recursive) == 0 && pthread_mutex_unlock(&recursive) == 0 && pthread_mutex_unlock(&recursive) == 0);
  CHECK(pthread_mutex_unlock(&recursive) == EPERM);
  CHECK(pthread_mutexattr_settype(&attributes, PTHREAD_MUTEX_ERRORCHECK) == 0 && pthread_mutex_init(&checking, &attributes) == 0);
  CHECK(pthread_mutex_lock(&checking) == 0 && pthread_mutex_lock(&checking) == EDEADLK && pthread_mutex_trylock(&checking) == EBUSY);
  CHECK(pthread_mutex_unlock(&checking) == 0 && pthread_mutex_unlock(&checking) == EPERM);

  // Nothing can signal the condition: a wait with a deadline ends there.
  pthread_cond_t condition = PTHREAD_COND_INITIALIZER;
  CHECK(pthread_mutex_lock(&normal) == 0);
  deadline = after(0.3);
  started = now();
  CHECK(pthread_cond_timedwait(&condition, &normal, &deadline) == ETIMEDOUT && now() - started > 0.25);
  deadline = after(-10);
  CHECK(pthread_cond_timedwait(&condition, &normal, &deadline) == ETIMEDOUT);
  deadline.tv_nsec = 1000000000;
  CHECK(pthread_cond_timedwait(&condition, &normal, &deadline) == EINVAL);
  CHECK(pthread_mutex_unlock(&normal) == 0);

  int previous = 12345;
  CHECK(pthread_setcancelstate(PTHREAD_CANCEL_DISABLE, &previous) == 0 && previous == PTHREAD_CANCEL_ENABLE);
  CHECK(pthread_setcancelstate(PTHREAD_CANCEL_ENABLE, &previous) == 0 && previous == PTHREAD_CANCEL_DISABLE);
  CHECK(pthread_setcanceltype(PTHREAD_CANCEL_DEFERRED, &previous) == 0 && previous == PTHREAD_CANCEL_DEFERRED);

  // No second thread can arrive at a barrier; one of one passes it alone.
  pthread_barrier_t barrier;
  CHECK(pthread_barrier_init(&barrier, NULL, 2) == EAGAIN && pthread_barrier_init(&barrier, NULL, 0) == EINVAL);
  CHECK(pthread_barrier_init(&barrier, NULL, 1) == 0 && pthread_barrier_wait(&barrier) == PTHREAD_BARRIER_SERIAL_THREAD);

  pthread_rwlock_t lock = PTHREAD_RWLOCK_INITIALIZER;
  CHECK(pthread_rwlock_rdlock(&lock) == 0 && pthread_rwlock_tryrdlock(&lock) == 0);
  CHECK(pthread_rwlock_trywrlock(&lock) == EBUSY && pthread_rwlock_wrlock(&lock) == EDEADLK);
  CHECK(pthread_rwlock_unlock(&lock) == 0 && pthread_rwlock_unlock(&lock) == 0);
  CHECK(pthread_rwlock_wrlock(&lock) == 0 && pthread_rwlock_tryrdlock(&lock) == EBUSY && pthread_rwlock_trywrlock(&lock) == EBUSY);
  deadline = after(0.1);
  CHECK(pthread_rwlock_timedrdlock(&lock, &deadline) == ETIMEDOUT && pthread_rwlock_unlock(&lock) == 0);

  pthread_t thread;
  CHECK(pthread_create(&thread, NULL, nothing, NULL) == ENOTSUP && pthread_cancel(pthread_self()) == ENOTSUP);
  CHECK(pthread_kill(pthread_self(), 0) == 0 && pthread_kill(pthread_self(), 999) == EINVAL);
  return 0;
}
