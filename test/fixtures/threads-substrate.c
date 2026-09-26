/* Freestanding ABI exercise; pthread/libc integration has separate coverage. */
#include <dolly/process.h>
#include <dolly/threads.h>
#include <stdatomic.h>
#include <errno.h>

__attribute__((import_module("dolly_process_0"), import_name("call")))
int64_t raw_call(uint32_t, const void *, uint64_t, void *, uint64_t);
int64_t dolly_process_call(uint32_t op, const void *req, uint64_t size, void *res, uint64_t capacity) {
  return raw_call(op, req, size, res, capacity);
}
void __wasm_init_tls(void *);
void __wasm_call_ctors(void);

#ifndef THREAD_PROBE_MODE
#define THREAD_PROBE_MODE 0
#endif

enum { COUNT = 15, STACK_SIZE = 65536 };
typedef struct {
  uintptr_t top;
  _Alignas(64) unsigned char tls[4096];
  _Alignas(16) unsigned char stack[STACK_SIZE];
  int id, mode;
  uintptr_t stack_address, tls_address;
} thread_record;
static thread_record records[COUNT];
static _Thread_local int thread_value = 91;
static atomic_int gate, counter, reader_ready;
static dolly_process_pipe_response pipe_fds;
static int constructions;
static uint64_t sentinel = UINT64_C(0x1234abcd5678ef01);
static atomic_int bodies_staged;
static int join_target;
static char http_url[512];
static unsigned http_url_size;
static struct { uint64_t offset, total; unsigned char bytes[65536]; } bodies[2];
static struct { dolly_process_http_poll_response header; unsigned char bytes[65536]; } replies[2];

__attribute__((constructor)) static void construct(void) { ++constructions; }

static void message(const char *text) {
  struct { uint32_t fd, reserved; uint64_t size; char bytes[100]; } packet = {1, 0, 0, {0}};
  while (text[packet.size] && packet.size < sizeof(packet.bytes)) {
    packet.bytes[packet.size] = text[packet.size]; ++packet.size;
  }
  uint64_t written;
  dolly_process_call(DOLLY_PROCESS_FD_WRITE, &packet, 16 + packet.size, &written, 8);
}

static void finish(int status) {
  dolly_process_exit_request packet = {(uint32_t)status, 0};
  dolly_process_call(DOLLY_PROCESS_EXIT, &packet, 8, 0, 0);
  __builtin_trap();
}

static void fail(int line) {
  char text[] = "THREAD-FAIL line 0000\n";
  for (int i = 20; i >= 17; --i) { text[i] = '0' + line % 10; line /= 10; }
  message(text);
  finish(1);
}
#define CHECK(value) do { if (!(value)) fail(__LINE__); } while (0)

static void post_body(int index) {
  const unsigned char byte = 'A' + index;
  bodies[index].total = 1024 * 1024 + 33;
  for (unsigned i = 0; i < 65536; ++i) bodies[index].bytes[i] = byte;
  for (uint64_t offset = 0; offset < bodies[index].total;) {
    bodies[index].offset = offset;
    uint64_t size = bodies[index].total - offset;
    if (size > 65536) size = 65536;
    CHECK(dolly_process_call(DOLLY_PROCESS_HTTP_BODY_WRITE, &bodies[index], size + 16, 0, 0) == 0);
    offset += size;
  }
  atomic_fetch_add(&bodies_staged, 1);
  __builtin_wasm_memory_atomic_notify((int *)&bodies_staged, 2);
  int staged;
  while ((staged = atomic_load(&bodies_staged)) != 2)
    __builtin_wasm_memory_atomic_wait32((int *)&bodies_staged, staged, -1);
  struct { dolly_process_http_start_request header; char text[516]; } start = {
    {0, 4, http_url_size, 0, bodies[index].total}, {0}
  };
  start.text[0] = 'P'; start.text[1] = 'O'; start.text[2] = 'S'; start.text[3] = 'T';
  for (unsigned i = 0; i < http_url_size; ++i) start.text[4 + i] = http_url[i];
  dolly_process_http_start_response started;
  CHECK(dolly_process_call(DOLLY_PROCESS_HTTP_START, &start, 28 + http_url_size, &started, 8) == 8);
  dolly_process_http_poll_request poll = {started.sequence, 0};
  uint64_t received = 0;
  for (;;) {
    CHECK(dolly_process_call(DOLLY_PROCESS_HTTP_POLL, &poll, 8, &replies[index], sizeof(replies[index])) >= 32);
    dolly_process_http_poll_response *header = &replies[index].header;
    CHECK(!header->error);
    if (!header->ready) continue;
    CHECK(header->status == 200);
    if (header->kind == 3) {
      received += header->length;
      for (unsigned i = 0; i < header->length; ++i) CHECK(replies[index].bytes[i] == byte);
    }
    if (header->eof) break;
  }
  CHECK(received == bodies[index].total);
}

uint64_t threads_substrate_entry(uint32_t tid, uint64_t argument) {
  thread_record *record = (thread_record *)(uintptr_t)argument;
  __wasm_init_tls(record->tls);
  int stack_local = record->id;
  record->stack_address = (uintptr_t)&stack_local;
  record->tls_address = (uintptr_t)&thread_value;
  CHECK(thread_value == 91 && constructions == 1);
  CHECK(sentinel == UINT64_C(0xfedcba9876543210));
  CHECK(dolly_thread_self() == (int)tid);
  thread_value = 1000 + record->id;
  if (record->mode == 6) {
    uint64_t result;
    CHECK(dolly_thread_wait(join_target, 0, &result) == 0 && result == UINT64_C(0x100000001));
  } else if (record->mode == 4) {
    post_body(record->id - 1);
  } else if (record->mode == 1) {
    dolly_process_fd_io_request request = {pipe_fds.read_descriptor, 0, 1};
    char reply;
    atomic_store(&reader_ready, 1);
    CHECK(dolly_process_call(DOLLY_PROCESS_FD_READ, &request, sizeof(request), &reply, 1) == 1);
    CHECK(reply == 'P');
  } else {
    while (!atomic_load(&gate)) __builtin_wasm_memory_atomic_wait32((int *)&gate, 0, -1);
    if (record->mode == 2) __builtin_trap();
    if (record->mode == 3) finish(37);
    for (int i = 0; i < 50000; ++i) atomic_fetch_add(&counter, 1);
    uintptr_t page = __builtin_wasm_memory_grow(0, 1);
    CHECK(page != (uintptr_t)-1);
    volatile uint32_t *grown = (uint32_t *)(page * 65536);
    *grown = tid;
    CHECK(dolly_thread_self() == (int)tid && *grown == tid);
  }
  CHECK(thread_value == 1000 + record->id && stack_local == record->id);
  if (record->id & 1) dolly_thread_exit(UINT64_C(0x100000000) + record->id);
  return UINT64_C(0x100000000) + record->id;
}

__asm__(".text\n"
        ".globl dolly_thread_start\n"
        ".globaltype __stack_pointer, i64\n"
        ".functype threads_substrate_entry (i32, i64) -> (i64)\n"
        "dolly_thread_start:\n"
        ".functype dolly_thread_start (i32, i64) -> (i64)\n"
        "local.get 1\ni64.load 0\nglobal.set __stack_pointer\n"
        "local.get 0\nlocal.get 1\ncall threads_substrate_entry\nend_function\n");

static int spawn(int index, int mode) {
  thread_record *record = &records[index];
  record->top = (uintptr_t)(record->stack + STACK_SIZE);
  record->id = index + 1;
  record->mode = mode;
  return dolly_thread_spawn((uintptr_t)record);
}

static void join(int tid, int index) {
  uint64_t result;
  CHECK(dolly_thread_wait(tid, 0, &result) == 0);
  CHECK(result == UINT64_C(0x100000001) + index);
  CHECK(records[index].stack_address >= (uintptr_t)records[index].stack);
  CHECK(records[index].stack_address < records[index].top);
  CHECK(records[index].tls_address >= (uintptr_t)records[index].tls);
  CHECK(records[index].tls_address < (uintptr_t)records[index].tls + sizeof(records[index].tls));
  CHECK(dolly_thread_wait(tid, 0, &result) == -ESRCH);
}

void _start(void) {
  __wasm_init_tls(__builtin_wasm_tls_base());
  __wasm_call_ctors();
  CHECK(__builtin_wasm_tls_size() <= sizeof(records[0].tls));
  CHECK(__builtin_wasm_tls_align() <= 64);
  CHECK(thread_value == 91 && constructions == 1);
  thread_value = 77;
  sentinel = UINT64_C(0xfedcba9876543210);
  int self = dolly_thread_self();
  uint64_t result;
  CHECK(self > 0 && dolly_thread_wait(self, 0, &result) == -EDEADLK);
  CHECK(dolly_thread_wait(self, 2, &result) == -EINVAL);
  if (THREAD_PROBE_MODE) {
    int tid = spawn(0, THREAD_PROBE_MODE == 1 ? 2 : 3);
    CHECK(tid > 0);
    atomic_store(&gate, 1); __builtin_wasm_memory_atomic_notify((int *)&gate, COUNT);
    dolly_thread_wait(tid, 0, &result);
    fail(__LINE__);
  }
  int tids[COUNT];
  for (int i = 0; i < COUNT; ++i) {
    tids[i] = spawn(i, 0); CHECK(tids[i] > 0 && tids[i] != self);
  }
  CHECK(dolly_thread_spawn(0) == -EAGAIN);
  CHECK(dolly_thread_wait(tids[0], DOLLY_THREAD_WAIT_NONBLOCK, &result) == -EAGAIN);
  atomic_store(&gate, 1); __builtin_wasm_memory_atomic_notify((int *)&gate, COUNT);
  for (int i = 0; i < COUNT; ++i) join(tids[i], i);
  CHECK(atomic_load(&counter) == COUNT * 50000 && thread_value == 77 && constructions == 1);
  atomic_store(&gate, 0);
  join_target = spawn(0, 0); CHECK(join_target > 0);
  int waiter = spawn(1, 6); CHECK(waiter > 0);
  int wait_status;
  do { wait_status = dolly_thread_wait(join_target, DOLLY_THREAD_WAIT_NONBLOCK, &result); }
  while (wait_status == -EAGAIN);
  CHECK(wait_status == -EINVAL);
  atomic_store(&gate, 1); __builtin_wasm_memory_atomic_notify((int *)&gate, 1);
  join(waiter, 1);
  CHECK(dolly_thread_wait(join_target, 0, &result) == -ESRCH);
  /* Reuse the same stack/TLS only after confirmed join, across immediate exits. */
  for (int i = 0; i < 32; ++i) { int tid = spawn(0, 0); CHECK(tid > 0); join(tid, 0); }
  dolly_process_pipe_request pipe_request = {0, 0};
  CHECK(dolly_process_call(DOLLY_PROCESS_FD_PIPE, &pipe_request, 8, &pipe_fds, 8) == 8);
  int reader = spawn(0, 1); CHECK(reader > 0);
  while (!atomic_load(&reader_ready)) { }
  struct { uint32_t fd, reserved; uint64_t size; char byte; } write = {pipe_fds.write_descriptor, 0, 1, 'P'};
  CHECK(dolly_process_call(DOLLY_PROCESS_FD_WRITE, &write, 17, &result, 8) == 8 && result == 1);
  join(reader, 0);
  char arguments[1024];
  int64_t arguments_size = dolly_process_call(DOLLY_PROCESS_ARGUMENTS, 0, 0, arguments, sizeof(arguments));
  CHECK(arguments_size > 1);
  unsigned offset = 0;
  while (offset < (unsigned)arguments_size && arguments[offset]) ++offset;
  ++offset;
  while (offset < (unsigned)arguments_size && arguments[offset]) {
    CHECK(http_url_size + 1 < sizeof(http_url));
    http_url[http_url_size++] = arguments[offset++];
  }
  CHECK(http_url_size > 0);
  int first = spawn(0, 4), second = spawn(1, 4);
  CHECK(first > 0 && second > 0);
  join(first, 0); join(second, 1);
  message("THREAD-SUBSTRATE-OK TLS stacks constructors quota pipe reuse growth HTTP\n");
  finish(0);
}
