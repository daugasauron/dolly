#include <dolly/microphone.h>
#include <dolly/host.h>

DOLLY_HOST_REQUIRE(microphone, 0, DOLLY_MICROPHONE_ABI_DIGEST);
#include <dolly/process.h>
#include <errno.h>
#include <string.h>

static int fail(int error) { errno = error; return -1; }
static void u32(void *data, size_t offset, uint32_t n) { memcpy((char *)data + offset, &n, 4); }
static void u64(void *data, size_t offset, uint64_t n) { memcpy((char *)data + offset, &n, 8); }
static int known(uint32_t state) { return state >= DOLLY_MICROPHONE_WAITING && state <= DOLLY_MICROPHONE_UNAVAILABLE; }

/* Returns the reply's length. */
static int64_t call(dolly_microphone *microphone, unsigned operation, size_t bytes) {
  if (!microphone) return fail(EINVAL);
  if (operation != DOLLY_MICROPHONE_OPEN && !microphone->scope) return fail(EBADF);
  /* Reserve the last sequence for CLOSE so an exhausted capture can be reopened. */
  if (microphone->sequence >= UINT32_MAX - (operation != DOLLY_MICROPHONE_CLOSE))
    return fail(EOVERFLOW);
  u32(microphone->packet, 0, DOLLY_MICROPHONE_VERSION);
  u32(microphone->packet, 4, operation);
  u64(microphone->packet, 8, microphone->scope);
  u64(microphone->packet, 16, ++microphone->sequence);
  u32(microphone->packet, 24, bytes - 32);
  u32(microphone->packet, 28, 0);
  int64_t result = dolly_process_call(DOLLY_MICROPHONE_PROCESS_OP, microphone->packet, bytes,
                                      microphone->reply, sizeof(microphone->reply));
  return result < 0 && result >= -4095 ? fail((int)-result) : result;
}

int dolly_microphone_open(dolly_microphone *microphone) {
  if (!microphone) return fail(EINVAL);
  if (microphone->scope) return fail(EBUSY);
  memset(microphone, 0, sizeof(*microphone));
  int64_t length = call(microphone, DOLLY_MICROPHONE_OPEN, 32);
  if (length < 0) return -1;
  uint64_t scope;
  uint32_t rate, channels;
  memcpy(&scope, microphone->reply, 8);
  memcpy(&rate, microphone->reply + 8, 4);
  memcpy(&channels, microphone->reply + 12, 4);
  if (length != 16 || !scope || scope > UINT32_MAX) return fail(EPROTO);
  microphone->scope = scope;
  if (rate != DOLLY_MICROPHONE_RATE || channels != DOLLY_MICROPHONE_CHANNELS) {
    dolly_microphone_close(microphone);
    return fail(EPROTO);
  }
  return 0;
}

int dolly_microphone_close(dolly_microphone *microphone) {
  int64_t length = call(microphone, DOLLY_MICROPHONE_CLOSE, 32);
  if (length < 0) return -1;
  microphone->scope = 0;
  return length == 0 ? 0 : fail(EPROTO);
}

int dolly_microphone_read(dolly_microphone *microphone, float *mono, uint32_t frames) {
  if (!microphone || !mono || !frames || frames > DOLLY_MICROPHONE_MAX_FRAMES) return fail(EINVAL);
  if (!microphone->scope) return fail(EBADF);
  u32(microphone->packet, 32, frames);
  u32(microphone->packet, 36, 0);
  int64_t length = call(microphone, DOLLY_MICROPHONE_READ, 40);
  if (length < 0) return -1;
  uint32_t read, state;
  memcpy(&read, microphone->reply, 4);
  memcpy(&state, microphone->reply + 4, 4);
  if (length < 8 || read > frames || length != 8 + (int64_t)read * 4 || !known(state)) return fail(EPROTO);
  memcpy(mono, microphone->reply + 8, (size_t)read * 4);
  return (int)read;
}

int dolly_microphone_get_status(dolly_microphone *microphone, dolly_microphone_status *status) {
  if (!status) return fail(EINVAL);
  int64_t length = call(microphone, DOLLY_MICROPHONE_STATUS, 32);
  if (length < 0) return -1;
  dolly_microphone_status reply;
  if (length != sizeof(reply)) return fail(EPROTO);
  memcpy(&reply, microphone->reply, sizeof(reply));
  if (reply.queued_frames > DOLLY_MICROPHONE_QUEUE_FRAMES || !known(reply.state)) return fail(EPROTO);
  *status = reply;
  return 0;
}
