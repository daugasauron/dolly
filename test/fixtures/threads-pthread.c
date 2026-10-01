#define _GNU_SOURCE
#include <pthread.h>
#include <semaphore.h>
#include <stdatomic.h>
#include <assert.h>
#include <errno.h>
#include <stdlib.h>
#include <stdio.h>
#include <unistd.h>
#include <threads.h>
#include <string.h>
#include <dlfcn.h>
#include <dolly/process.h>
#include <dolly/runtime.h>
#include <signal.h>
#include <fcntl.h>
#include <sys/mman.h>
#include <sys/wait.h>
#include <spawn.h>

static pthread_mutex_t lock = PTHREAD_MUTEX_INITIALIZER;
static pthread_barrier_t barrier;
static pthread_once_t once = PTHREAD_ONCE_INIT;
static pthread_key_t key;
static sem_t done;
static atomic_int destroyed;
static int count, initialized;
static int main_tid, main_pid;
static int shared_fd;
static pthread_mutex_t robust;
static atomic_int busy_ready;
static _Thread_local int local = 17;
static volatile sig_atomic_t caught_tid;
static void caught(int number) { assert(number == SIGTERM); caught_tid = gettid(); }
static void *signal_joiner(void *unused) {
  (void)unused;
  usleep(20000);
  assert(dolly_kill(getpid(), SIGTERM) == 0);
  /* The main thread takes the signal while it waits in pthread_join. */
  for (int i = 0; i < 2000 && !caught_tid; ++i) usleep(1000);
  return caught_tid ? (void *)321 : NULL;
}
static volatile sig_atomic_t child_signals;
static void child_exited(int number) { assert(number == SIGCHLD); child_signals = 1; }
static void *spawn_child(void *unused) {
  (void)unused;
  pid_t child;
  char *argv[] = {"true", NULL};
  assert(posix_spawnp(&child, "true", NULL, NULL, argv, environ) == 0);
  /* The kernel's SIGCHLD also reaches the main thread inside pthread_join. */
  for (int i = 0; i < 2000 && !child_signals; ++i) usleep(1000);
  assert(waitpid(child, NULL, 0) == child);
  return child_signals ? (void *)1 : NULL;
}
static void *leave_locked(void *unused) { (void)unused; assert(pthread_mutex_lock(&robust) == 0); return NULL; }
static void *busy(void *unused) {
  (void)unused;
  atomic_fetch_add(&busy_ready, 1);
  for (;;) atomic_signal_fence(memory_order_seq_cst);
}

static void initialize(void) { ++initialized; }
static void destroy(void *value) { assert(value == (void *)29); atomic_fetch_add(&destroyed, 1); }
static void *detached(void *argument) {
  assert(sem_post(&done) == 0);
  return argument;
}
static int c11(void *argument) { return (int)(long)argument; }
static void *last_thread(void *argument) {
  (void)argument;
  usleep(10000);
  FILE *file = fopen("/tmp/last-thread", "w");
  assert(file);
  fputs("survived main", file);
  assert(fclose(file) == 0);
  return NULL;
}

static void *work(void *argument) {
  long id = (long)argument;
  assert(local == 17);
  local = (int)id;
  errno = (int)id + 100;
  assert(gettid() != main_tid && getpid() == main_pid);
  assert(pthread_once(&once, initialize) == 0);
  assert(pthread_setspecific(key, (void *)29) == 0);
  unsigned char *mapped = mmap(NULL, 65536, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
  assert(mapped != MAP_FAILED);
  memset(mapped, id, 65536);
  if (id == 1) assert(chdir("/tmp") == 0);
  int rc = pthread_barrier_wait(&barrier);
  assert(rc == 0 || rc == PTHREAD_BARRIER_SERIAL_THREAD);
  char cwd[32];
  assert(getcwd(cwd, sizeof(cwd)) && !strcmp(cwd, "/tmp"));
  for (int i = 0; i < 16; ++i) { unsigned char byte = id; assert(write(shared_fd, &byte, 1) == 1); }
  assert(mapped[0] == id && mapped[65535] == id && munmap(mapped, 65536) == 0);
  errno = (int)id + 100;
  for (int i = 0; i < 1000; ++i) {
    size_t size = 65536 + (size_t)i;
    unsigned char *memory = malloc(size);
    assert(memory);
    memory[0] = id; memory[size - 1] = id + 1;
    pthread_mutex_lock(&lock);
    ++count;
    pthread_mutex_unlock(&lock);
    assert(memory[0] == id && memory[size - 1] == id + 1);
    free(memory);
  }
  assert(local == id && errno == id + 100);
  assert(sem_post(&done) == 0);
  return (void *)(id + 30);
}

int main(int argc, char **argv) {
  main_tid = gettid(); main_pid = getpid();
  if (argc > 1 && strcmp(argv[1], "--main-exit") == 0) {
    pthread_t child;
    assert(pthread_create(&child, NULL, last_thread, NULL) == 0);
    pthread_exit(NULL);
  }
  if (argc > 1 && strcmp(argv[1], "--busy") == 0) {
    pthread_t children[2];
    for (int i = 0; i < 2; ++i) assert(pthread_create(children + i, NULL, busy, NULL) == 0);
    while (atomic_load(&busy_ready) != 2) {}
    puts("THREADS-BUSY");fflush(stdout);
    pthread_join(children[0], NULL);
    abort();
  }
  assert(sysconf(_SC_NPROCESSORS_ONLN) > 1);
  shared_fd = open("/tmp/thread-shared-fd", O_CREAT | O_TRUNC | O_RDWR, 0600);
  assert(shared_fd >= 0);
  pthread_t workers[4];
  assert(pthread_barrier_init(&barrier, NULL, 4) == 0);
  assert(pthread_key_create(&key, destroy) == 0);
  assert(sem_init(&done, 0, 0) == 0);
  for (long i = 0; i < 4; ++i) assert(pthread_create(&workers[i], NULL, work, (void *)(i + 1)) == 0);
  for (long i = 0; i < 4; ++i) {
    assert(sem_wait(&done) == 0);
    void *result;
    assert(pthread_join(workers[i], &result) == 0 && result == (void *)(i + 31));
  }
  assert(count == 4000 && initialized == 1 && atomic_load(&destroyed) == 4 && local == 17);
  assert(lseek(shared_fd, 0, SEEK_CUR) == 64 && lseek(shared_fd, 0, SEEK_SET) == 0);
  unsigned char bytes[64]; int counts[5] = {0};
  assert(read(shared_fd, bytes, sizeof(bytes)) == sizeof(bytes) && close(shared_fd) == 0);
  for (int i = 0; i < 64; ++i) { assert(bytes[i] >= 1 && bytes[i] <= 4); ++counts[bytes[i]]; }
  for (int i = 1; i <= 4; ++i) assert(counts[i] == 16);
  assert(pthread_key_delete(key) == 0);
  assert(pthread_barrier_destroy(&barrier) == 0);
  pthread_attr_t attr;
  assert(pthread_attr_init(&attr) == 0 && pthread_attr_setdetachstate(&attr, PTHREAD_CREATE_DETACHED) == 0);
  uintptr_t before = (uintptr_t)sbrk(0);
  for (int i = 0; i < 300; ++i) {
    pthread_t child;
    assert(pthread_create(&child, &attr, detached, NULL) == 0);
    assert(sem_wait(&done) == 0);
  }
  assert((uintptr_t)sbrk(0) - before < 64 * 1024 * 1024);
  assert(pthread_attr_destroy(&attr) == 0 && sem_destroy(&done) == 0);
  thrd_t thread;
  int result;
  assert(thrd_create(&thread, c11, (void *)123) == thrd_success);
  assert(thrd_join(thread, &result) == thrd_success && result == 123);
  struct sigaction action = {.sa_handler = caught};
  assert(sigaction(SIGTERM, &action, NULL) == 0);
  pthread_t sender;
  void *joined;
  assert(pthread_create(&sender, NULL, signal_joiner, NULL) == 0);
  assert(pthread_join(sender, &joined) == 0 && joined == (void *)321);
  assert(caught_tid == main_tid);
  struct sigaction on_child = {.sa_handler = child_exited};
  assert(sigaction(SIGCHLD, &on_child, NULL) == 0);
  assert(pthread_create(&sender, NULL, spawn_child, NULL) == 0);
  assert(pthread_join(sender, &joined) == 0 && joined);
  pthread_mutexattr_t mutex_attr;
  assert(pthread_mutexattr_init(&mutex_attr) == 0);
  assert(pthread_mutexattr_setrobust(&mutex_attr, PTHREAD_MUTEX_ROBUST) == 0);
  assert(pthread_mutex_init(&robust, &mutex_attr) == 0);
  assert(pthread_create(&sender, NULL, leave_locked, NULL) == 0 && pthread_join(sender, NULL) == 0);
  assert(pthread_mutex_lock(&robust) == EOWNERDEAD && pthread_mutex_consistent(&robust) == 0);
  assert(pthread_mutex_unlock(&robust) == 0 && pthread_mutex_destroy(&robust) == 0);
  assert(pthread_mutexattr_destroy(&mutex_attr) == 0);
  errno = 0;
  assert(dlopen(NULL, RTLD_NOW) == NULL && errno == ENOTSUP);
  assert(dolly_process_call(DOLLY_PROCESS_FFI_CALL, NULL, 0, NULL, 0) == -ENOTSUP);
  puts("PTHREAD-OK mutex barrier semaphore once TLS errno TSD allocator detach C11");
  return 0;
}
