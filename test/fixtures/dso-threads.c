// A host using threads@0 loads a library and makes an FFI closure while its
// other threads wait on a condition, wait in a read, or compute; then every
// thread calls both, a thread started after the load too, and a thread loads
// the library again while the main thread waits for it.
#include <dlfcn.h>
#include <pthread.h>
#include <stdatomic.h>
#include <stdint.h>
#include <stdio.h>
#include <time.h>
#include <unistd.h>
#include <dolly/dso.h>

typedef int (*unary)(int);
static const char *path;
static unary twice, *operations;
static int (*count_call)(void), (*caught)(int), (*closure)(int, int);
static atomic_int ready;
static pthread_mutex_t lock = PTHREAD_MUTEX_INITIALIZER;
static pthread_cond_t changed = PTHREAD_COND_INITIALIZER;
static int ends[2];

// libffi's wasm64 layouts: a cif of two ints returning an int.
static struct { uint64_t size; uint16_t alignment, type; uint64_t elements; } ffi_int = {4, 4, 1, 0};
static uint64_t argument_types[2];
static struct { uint32_t abi, nargs; uint64_t argument_types, return_type; uint32_t bytes, flags, fixed; } cif;
static uint64_t closure_storage[4];
static void sum(void *cif, void *result, void **arguments, void *user) {
  (void)cif, (void)user;
  *(int *)result = *(int *)arguments[0] + *(int *)arguments[1];
}

// The library's thread-locals start at 5 in each thread.
static void *check(void *unused) {
  (void)unused;
  return (void *)(intptr_t)(twice(21) == 42 && operations[1](41) == 42 && count_call() == 6 &&
                            count_call() == 7 && caught(42) == 42 && closure(30, 12) == 42);
}

static void *waiter(void *unused) {
  pthread_mutex_lock(&lock);
  while (!atomic_load(&ready)) pthread_cond_wait(&changed, &lock);
  pthread_mutex_unlock(&lock);
  return check(unused);
}

static void *reader(void *unused) {
  char byte;
  return read(ends[0], &byte, 1) == 1 ? check(unused) : NULL;
}

// It enters the kernel at least every millisecond, so a load waits for it.
static void *spinner(void *unused) {
  struct timespec now;
  while (!atomic_load(&ready)) clock_gettime(CLOCK_MONOTONIC, &now);
  return check(unused);
}

static void *loader(void *unused) {
  (void)unused;
  void *again = dlopen(path, RTLD_NOW);
  unary twice_again = again ? (unary)dlsym(again, "twice") : NULL;
  int (*constructions)(void) = again ? (int (*)(void))dlsym(again, "constructions") : NULL;
  return (void *)(intptr_t)(twice_again && twice_again(4) == 8 && constructions() == 1);
}

static int joined(pthread_t thread) {
  void *result = NULL;
  return pthread_join(thread, &result) == 0 && result != NULL;
}

static int started(void *(*entry)(void *)) {
  pthread_t thread;
  return pthread_create(&thread, NULL, entry, NULL) == 0 && joined(thread);
}

int main(int argc, char **argv) {
  if (argc != 2 || pipe(ends)) return 64;
  path = argv[1];
  pthread_t running[3];
  void *(*entries[3])(void *) = {waiter, reader, spinner};
  for (int index = 0; index < 3; ++index) {
    if (pthread_create(&running[index], NULL, entries[index], NULL)) return 65;
  }
  usleep(100000);
  void *library = dlopen(path, RTLD_NOW);
  if (!library) {
    fprintf(stderr, "dlopen: %s\n", dlerror());
    return 66;
  }
  twice = (unary)dlsym(library, "twice");
  operations = (unary *)dlsym(library, "operations");
  count_call = (int (*)(void))dlsym(library, "count_call");
  caught = (int (*)(int))dlsym(library, "caught");
  int (*constructions)(void) = (int (*)(void))dlsym(library, "constructions");
  argument_types[0] = argument_types[1] = (uint64_t)(uintptr_t)&ffi_int;
  cif.abi = 2, cif.nargs = 2, cif.fixed = 2;
  cif.argument_types = (uint64_t)(uintptr_t)argument_types, cif.return_type = (uint64_t)(uintptr_t)&ffi_int;
  uint64_t code = 0;
  if (dolly_ffi_closure_alloc((uint64_t)(uintptr_t)closure_storage, &code)) return 67;
  const dolly_ffi_closure_prep_request prepared = {(uint64_t)(uintptr_t)closure_storage, (uint64_t)(uintptr_t)&cif,
                                                   (uint64_t)(uintptr_t)sum, 0, code};
  if (dolly_ffi_closure_prep(&prepared)) return 68;
  closure = (int (*)(int, int))(uintptr_t)code;
  pthread_mutex_lock(&lock);
  atomic_store(&ready, 1);
  pthread_cond_broadcast(&changed);
  pthread_mutex_unlock(&lock);
  if (write(ends[1], "x", 1) != 1) return 69;
  int failures = !check(NULL) || constructions() != 1;
  for (int index = 0; index < 3; ++index) failures += !joined(running[index]) << (index + 1);
  failures += !started(check) << 4;
  failures += !started(loader) << 5;
  if (!failures) puts("DSO-THREADS-OK");
  return failures;
}
