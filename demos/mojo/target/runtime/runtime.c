/* The compiler runtime of a Mojo program in Dolly: the KGEN_CompilerRT_*
 * functions that the standard library and the compiler's output call.
 *
 * Upstream's is Mojo/lib/CompilerRT, over AsyncRT's thread pool, tcmalloc,
 * Support and LLVMSupport. This one is its interface over libc for one
 * thread: a task runs when something waits for it, and the parallelism level
 * is 1. A string argument is a pointer and a length, as the compiler emits a
 * two-word struct for wasm64. Python interoperation is absent, so a program
 * that uses it does not link. */
#include <stdarg.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

/* Memory */

void *KGEN_CompilerRT_AlignedAlloc(int64_t alignment, int64_t size) {
  void *memory = NULL;
  if (alignment <= 0) alignment = 16;
  if (alignment < (int64_t)sizeof(void *)) alignment = sizeof(void *);
  return posix_memalign(&memory, (size_t)alignment, size > 0 ? (size_t)size : 1) ? NULL : memory;
}

void KGEN_CompilerRT_AlignedFree(void *memory) { free(memory); }

/* Globals, destroyed latest first */

struct global {
  struct global *next;
  size_t length;
  void *value;
  void (*destroy)(void *);
  char name[];
};

enum { INDEXED_GLOBALS = 3 };
static struct global *globals;
static struct { void *value; void (*destroy)(void *); } indexed[INDEXED_GLOBALS];

void *KGEN_CompilerRT_GetOrCreateGlobal(const char *name, size_t length, void *(*create)(void),
                                        void (*destroy)(void *)) {
  for (struct global *entry = globals; entry; entry = entry->next) {
    if (entry->length == length && !memcmp(entry->name, name, length)) return entry->value;
  }
  if (!create) return NULL;
  void *value = create();
  struct global *entry = malloc(sizeof *entry + length);
  if (!entry) abort();
  *entry = (struct global){globals, length, value, destroy};
  memcpy(entry->name, name, length);
  globals = entry;
  return value;
}

void *KGEN_CompilerRT_GetGlobalOrNull(const char *name, size_t length) {
  return KGEN_CompilerRT_GetOrCreateGlobal(name, length, NULL, NULL);
}

static void *inserted;
static void *take_inserted(void) { return inserted; }

void KGEN_CompilerRT_InsertGlobal(const char *name, size_t length, void *value) {
  inserted = value;
  KGEN_CompilerRT_GetOrCreateGlobal(name, length, take_inserted, NULL);
}

void *KGEN_CompilerRT_GetOrCreateGlobalIndexed(size_t index, void *(*create)(void), void (*destroy)(void *)) {
  if (index >= INDEXED_GLOBALS) abort();
  if (!indexed[index].value) {
    indexed[index].value = create();
    indexed[index].destroy = destroy;
  }
  return indexed[index].value;
}

void KGEN_CompilerRT_DestroyGlobals(void) {
  while (globals) {
    struct global *entry = globals;
    globals = entry->next;
    if (entry->destroy && entry->value) entry->destroy(entry->value);
    free(entry);
  }
  for (size_t index = 0; index < INDEXED_GLOBALS; index++) {
    void *value = indexed[index].value;
    indexed[index].value = NULL;
    if (value && indexed[index].destroy) indexed[index].destroy(value);
  }
}

/* Arguments */

struct string { const char *bytes; size_t length; };
struct argument_list { struct string *list; size_t count; };
static struct string no_arguments = {"", 0}, *arguments = &no_arguments;
static size_t argument_count = 1;

void KGEN_CompilerRT_SetArgV(int count, char **values) {
  struct string *list = calloc(count > 0 ? (size_t)count : 1, sizeof *list);
  if (!list) abort();
  for (int i = 0; i < count; i++) list[i] = (struct string){values[i], strlen(values[i])};
  arguments = list;
  argument_count = (size_t)count;
}

void KGEN_CompilerRT_GetArgV(struct argument_list *result) {
  result->list = arguments;
  result->count = argument_count;
}

/* The system */

size_t KGEN_CompilerRT_NumPhysicalCores(void) { return 1; }
size_t KGEN_CompilerRT_NumLogicalCores(void) { return 1; }
size_t KGEN_CompilerRT_NumPerformanceCores(void) { return 1; }

int KGEN_CompilerRT_fprintf(FILE *stream, const char *format, ...) {
  va_list values;
  va_start(values, format);
  int result = vfprintf(stream, format, values);
  va_end(values);
  return result;
}

/* A fault in Wasm is a trap: the process ends with status 126 and one line
 * from Dolly's supervisor. There is no signal to print a stack trace from. */
void KGEN_CompilerRT_PrintStackTraceOnFault(void) {}

/* As upstream answers while stack traces on errors are not configured. */
int KGEN_CompilerRT_GetStackTrace(char **text, unsigned depth) {
  (void)text;
  (void)depth;
  return 0;
}

void KGEN_CompilerRT_SetAsanAllocators(void) {}

/* Tasks: one queue, run by whoever waits */

struct task {
  struct task *next;
  void (*resume)(void *);
  void *handle;
};

struct chain {
  bool ready;
  struct task *waiting;
};

static struct task *first_task, **last_task = &first_task;
static char device;
static void *current_device;

static void enqueue(struct task *task) {
  task->next = NULL;
  *last_task = task;
  last_task = &task->next;
}

static bool run_one(void) {
  struct task *task = first_task;
  if (!task) return false;
  first_task = task->next;
  if (!first_task) last_task = &first_task;
  void (*resume)(void *) = task->resume;
  void *handle = task->handle;
  free(task);
  resume(handle);
  return true;
}

static struct task *new_task(void (*resume)(void *), void *handle) {
  struct task *task = malloc(sizeof *task);
  if (!task) abort();
  *task = (struct task){NULL, resume, handle};
  return task;
}

void KGEN_CompilerRT_AsyncRT_InitializeChain(struct chain **chain) {
  *chain = calloc(1, sizeof **chain);
  if (!*chain) abort();
}

void KGEN_CompilerRT_AsyncRT_DestroyChain(struct chain **chain) {
  free(*chain);
  *chain = NULL;
}

void KGEN_CompilerRT_AsyncRT_Complete(struct chain **chain) {
  (*chain)->ready = true;
  while ((*chain)->waiting) {
    struct task *task = (*chain)->waiting;
    (*chain)->waiting = task->next;
    enqueue(task);
  }
}

void KGEN_CompilerRT_AsyncRT_Wait(struct chain **chain) {
  while (!(*chain)->ready) {
    if (!run_one()) {
      fputs("mojo: waiting for a task that nothing will complete\n", stderr);
      abort();
    }
  }
}

bool KGEN_CompilerRT_AsyncRT_Wait_Timeout(struct chain **chain, int64_t nanoseconds) {
  struct timespec start, now;
  clock_gettime(CLOCK_MONOTONIC, &start);
  while (!(*chain)->ready && run_one()) {
    clock_gettime(CLOCK_MONOTONIC, &now);
    if ((now.tv_sec - start.tv_sec) * 1000000000 + (now.tv_nsec - start.tv_nsec) >= nanoseconds) break;
  }
  return (*chain)->ready;
}

void KGEN_CompilerRT_AsyncRT_Execute(void (*resume)(void *), void *handle, int64_t worker) {
  (void)worker;
  enqueue(new_task(resume, handle));
}

void KGEN_CompilerRT_AsyncRT_AndThen(void (*resume)(void *), struct chain **chain, void *handle) {
  struct task *task = new_task(resume, handle);
  if ((*chain)->ready) {
    enqueue(task);
  } else {
    task->next = (*chain)->waiting;
    (*chain)->waiting = task;
  }
}

void *KGEN_CompilerRT_AsyncRT_GetOrCreateCPUDevice(void) { return current_device = &device; }
void *KGEN_CompilerRT_AsyncRT_GetCurrentCPUDevice(void) { return current_device; }
void KGEN_CompilerRT_AsyncRT_ReleaseCPUDevice(void *released) { (void)released; }
uint32_t KGEN_CompilerRT_AsyncRT_ParallelismLevel(void) { return 1; }

/* A spin waiter waits for another task: here, by running one. */
void *KGEN_CompilerRT_AsyncRT_InitializeSpinWaiter(void) { return &device; }
void KGEN_CompilerRT_AsyncRT_SpinWaiter_Wait(void *waiter) {
  (void)waiter;
  run_one();
}
void KGEN_CompilerRT_AsyncRT_DestroySpinWaiter(void *waiter) { (void)waiter; }
