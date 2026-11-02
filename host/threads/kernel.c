// threads@0 kernel side: the threads of each threaded process, their join
// results, and which of them receives the process's signals. The supervisor
// starts and retires thread Workers through this module's exports.
#include "process-kernel.h"

#include <dolly/threads.h>
#include <errno.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

enum { DOLLY_THREADS_PER_PROCESS = 64 };

typedef struct {
  int tid, waiter, waiting_on, retired;
  uint64_t result;
} dolly_thread;

typedef struct dolly_thread_table {
  int pid, signal_tid;
  dolly_thread threads[DOLLY_THREADS_PER_PROCESS];
  struct dolly_thread_table *next;
} dolly_thread_table;

static dolly_thread_table *tables;
static uint32_t next_tid = 1;

static dolly_thread_table *table_for(int pid) {
  for (dolly_thread_table *table = tables; table != NULL; table = table->next)
    if (table->pid == pid) return table;
  return NULL;
}

static dolly_thread *find_thread(dolly_thread_table *table, int tid) {
  if (table == NULL || tid <= 0) return NULL;
  for (size_t i = 0; i < DOLLY_THREADS_PER_PROCESS; ++i)
    if (table->threads[i].tid == tid) return &table->threads[i];
  return NULL;
}

static int allocate_thread(dolly_thread_table *table) {
  if (next_tid > INT32_MAX) return -EAGAIN;
  for (size_t i = 0; i < DOLLY_THREADS_PER_PROCESS; ++i) {
    if (table->threads[i].tid) continue;
    table->threads[i].tid = (int)next_tid++;
    return table->threads[i].tid;
  }
  return -EAGAIN;
}

/* A different call abandons an interrupted wait, including signal polling. */
static void abandon_wait(dolly_thread_table *table, dolly_thread *thread) {
  dolly_thread *target = find_thread(table, thread->waiting_on);
  if (target && target->waiter == thread->tid) target->waiter = 0;
  thread->waiting_on = 0;
}

int dolly_threads_attach(int pid) {
  if (table_for(pid)) return -EALREADY;
  if (!dolly_kernel_process_launching(pid)) return -ESRCH;
  dolly_thread_table *table = calloc(1, sizeof(*table));
  if (table == NULL) return -ENOMEM;
  const int tid = allocate_thread(table);
  if (tid < 0) { free(table); return tid; }
  table->pid = pid;
  table->signal_tid = tid;
  table->next = tables;
  tables = table;
  return tid;
}

int dolly_threads_unstarted(int pid, int tid) {
  dolly_thread_table *table = table_for(pid);
  dolly_thread *thread = find_thread(table, tid);
  if (!thread || tid == table->signal_tid) return -ESRCH;
  dolly_kernel_thread_released(pid, tid);
  memset(thread, 0, sizeof(*thread));
  return 0;
}

int dolly_threads_retired(int pid, int tid, uint64_t result) {
  dolly_thread_table *table = table_for(pid);
  dolly_thread *thread = find_thread(table, tid);
  if (!thread || thread->retired || !dolly_kernel_process_running(pid)) return -ESRCH;
  thread->result = result;
  thread->retired = 1;
  dolly_kernel_thread_released(pid, tid);
  int receiver = 0;
  for (size_t i = 0; i < DOLLY_THREADS_PER_PROCESS; ++i) {
    dolly_thread *other = &table->threads[i];
    if (other->waiter == tid) other->waiter = 0;
    if (other->tid && !other->retired && (!receiver || other->tid < receiver))
      receiver = other->tid;
  }
  if (table->signal_tid == tid) table->signal_tid = receiver;
  return receiver == 0;
}

int64_t dolly_threads_dispatch(int pid, int tid, uint32_t operation,
                               uintptr_t request_size, uintptr_t response_capacity) {
  dolly_thread_table *table = table_for(pid);
  dolly_thread *thread = find_thread(table, tid);
  if (!thread || thread->retired || !dolly_kernel_process_running(pid)) return -ESRCH;
  if (thread->waiting_on && operation != DOLLY_THREAD_WAIT) abandon_wait(table, thread);
  return dolly_kernel_dispatch(pid, tid, tid == table->signal_tid, operation,
                               request_size, response_capacity);
}

static int64_t threads_call(int pid, int tid, uint32_t operation, unsigned char *mailbox,
                            uintptr_t request_size, uintptr_t response_capacity) {
  dolly_thread_table *table = table_for(pid);
  if (table == NULL) return -ENOSYS;
  dolly_thread *thread = find_thread(table, tid);
  if (!thread) return -ESRCH;
  switch (operation) {
    case DOLLY_THREAD_SPAWN: {
      if (request_size != 8 || response_capacity != 8) return -EINVAL;
      const int child = allocate_thread(table);
      if (child < 0) return child;
      const dolly_thread_identity response = {(uint32_t)child, 0};
      return dolly_kernel_respond(mailbox, &response, sizeof(response));
    }
    case DOLLY_THREAD_SELF: {
      if (request_size || response_capacity != 8) return -EINVAL;
      const dolly_thread_identity response = {(uint32_t)tid, 0};
      return dolly_kernel_respond(mailbox, &response, sizeof(response));
    }
    case DOLLY_THREAD_EXIT:
      /* The Worker unwinds to its trusted JS entry wrapper first. The
       * supervisor publishes retirement only after guest code has stopped. */
      return request_size == 8 && !response_capacity ? 0 : -EINVAL;
    case DOLLY_THREAD_WAIT: {
      if (request_size != 8 || response_capacity != 8) return -EINVAL;
      dolly_thread_wait_request request;
      memcpy(&request, mailbox, sizeof(request));
      if (thread->waiting_on && (request.tid != (uint32_t)thread->waiting_on || request.flags))
        abandon_wait(table, thread);
      if (request.flags & ~DOLLY_THREAD_WAIT_NONBLOCK) return -EINVAL;
      if (request.tid == (uint32_t)tid) return -EDEADLK;
      dolly_thread *target = find_thread(table, (int)request.tid);
      if (!target) return -ESRCH;
      if (target->waiter && target->waiter != tid) return -EINVAL;
      if (!target->retired) {
        if (request.flags & DOLLY_THREAD_WAIT_NONBLOCK) return -EAGAIN;
        target->waiter = tid;
        thread->waiting_on = target->tid;
        return DOLLY_PROCESS_DISPATCH_DEFERRED;
      }
      memcpy(mailbox, &target->result, sizeof(target->result));
      memset(target, 0, sizeof(*target));
      thread->waiting_on = 0;
      return sizeof(target->result);
    }
  }
  return -ENOSYS;
}

static void threads_release(int pid, int tid) {
  if (tid != 0) return;
  for (dolly_thread_table **link = &tables; *link != NULL; link = &(*link)->next) {
    if ((*link)->pid != pid) continue;
    dolly_thread_table *table = *link;
    *link = table->next;
    free(table);
    return;
  }
}

const dolly_kernel_module dolly_threads_kernel = {
    DOLLY_THREAD_SPAWN, DOLLY_THREAD_WAIT, threads_call, threads_release};
