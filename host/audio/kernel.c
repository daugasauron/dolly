// audio@0 kernel side: a device leased per process (src/device-lease.c).
#include "device-lease.h"
#include "process-kernel.h"

#include <dolly/audio-abi.h>
#include <emscripten/emscripten.h>
#include <errno.h>

static _Alignas(64) unsigned char replies[DOLLY_AUDIO_SLOTS * (64 + DOLLY_AUDIO_REPLY_BYTES)];
static dolly_device_lease leases[DOLLY_AUDIO_SLOTS];

DOLLY_EM_JS(int, dolly_audio_dispatch, (const void *packet, uintptr_t bytes), {
  return -ENOSYS;
});
uintptr_t dolly_audio_mailbox_address(void) { return (uintptr_t)replies; }

static const dolly_leased_device audio = {
    DOLLY_AUDIO_VERSION, DOLLY_AUDIO_OPEN, DOLLY_AUDIO_CLOSE, DOLLY_AUDIO_SLOTS,
    DOLLY_AUDIO_PACKET_BYTES, DOLLY_AUDIO_REPLY_BYTES, 1, dolly_audio_dispatch, replies, leases};

static int64_t audio_call(int pid, int tid, uint32_t operation, unsigned char *packet,
                         uintptr_t size, uintptr_t capacity) {
  return dolly_device_call(&audio, pid, packet, size, capacity);
}

static void audio_release(int pid, int tid) {
  if (tid == 0) dolly_device_release(&audio, pid);
}

const dolly_kernel_module dolly_audio_kernel = {DOLLY_AUDIO_PROCESS_OP, DOLLY_AUDIO_PROCESS_OP, audio_call, audio_release};
