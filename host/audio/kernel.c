// audio@0 kernel side: a device leased per process (src/device-lease.c).
#include "device-lease.h"
#include "process-kernel.h"

#include <dolly/audio-abi.h>

static _Alignas(64) unsigned char replies[DOLLY_AUDIO_SLOTS * (64 + DOLLY_AUDIO_REPLY_BYTES)];
static dolly_device_lease leases[DOLLY_AUDIO_SLOTS];

DOLLY_BROWSER_IMPORT(dolly_audio_dispatch)
int dolly_audio_dispatch(const void *packet, uintptr_t bytes);
uintptr_t dolly_audio_mailbox_address(void) { return (uintptr_t)replies; }

static const dolly_leased_device audio = {
    DOLLY_AUDIO_VERSION, DOLLY_AUDIO_OPEN, DOLLY_AUDIO_CLOSE, DOLLY_AUDIO_SLOTS,
    DOLLY_AUDIO_PACKET_BYTES, DOLLY_AUDIO_REPLY_BYTES, 1, dolly_audio_dispatch, replies, leases};

const dolly_kernel_module dolly_audio_kernel = {DOLLY_AUDIO_PROCESS_OP, DOLLY_AUDIO_PROCESS_OP, .device = &audio};
