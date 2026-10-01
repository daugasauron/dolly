#include <dolly/process.h>
#include <dolly/threads.h>
#include <dolly/host.h>
#include <errno.h>

DOLLY_HOST_REQUIRE(threads, 0, DOLLY_THREADS_ABI_DIGEST);
_Static_assert(sizeof(dolly_thread_identity) == 8, "thread identity packet");
_Static_assert(sizeof(dolly_thread_wait_request) == 8, "thread wait packet");

int dolly_thread_spawn(uint64_t argument) {
  dolly_thread_identity response;
  int64_t result = dolly_process_call(DOLLY_THREAD_SPAWN, &argument, 8, &response, 8);
  return result < 0 ? (int)result : result == 8 && !response.reserved &&
      response.tid > 0 && response.tid <= INT32_MAX ? (int)response.tid : -EIO;
}

int dolly_thread_self(void) {
  dolly_thread_identity response;
  int64_t result = dolly_process_call(DOLLY_THREAD_SELF, 0, 0, &response, 8);
  return result < 0 ? (int)result : result == 8 && !response.reserved &&
      response.tid > 0 && response.tid <= INT32_MAX ? (int)response.tid : -EIO;
}

int dolly_thread_wait(uint32_t tid, uint32_t flags, uint64_t *value) {
  dolly_thread_wait_request request = {tid, flags};
  uint64_t response;
  int64_t result = dolly_process_call(DOLLY_THREAD_WAIT, &request, 8, &response, 8);
  if (result != 8) return result < 0 ? (int)result : -EIO;
  if (value) *value = response;
  return 0;
}

void dolly_thread_exit(uint64_t value) {
  dolly_process_call(DOLLY_THREAD_EXIT, &value, 8, 0, 0);
  __builtin_trap();
}
