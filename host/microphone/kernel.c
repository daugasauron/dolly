// microphone@0 kernel side: a device leased to one process (src/device-lease.c).
#include "device-lease.h"
#include "process-kernel.h"

#include <dolly/microphone-abi.h>

static _Alignas(64) unsigned char replies[DOLLY_MICROPHONE_SLOTS * (64 + DOLLY_MICROPHONE_REPLY_BYTES)];
static dolly_device_lease leases[DOLLY_MICROPHONE_SLOTS];

DOLLY_BROWSER_IMPORT(dolly_microphone_dispatch)
int dolly_microphone_dispatch(const void *packet, uintptr_t bytes);
uintptr_t dolly_microphone_mailbox_address(void) { return (uintptr_t)replies; }

static const dolly_leased_device microphone = {
    DOLLY_MICROPHONE_VERSION, DOLLY_MICROPHONE_OPEN, DOLLY_MICROPHONE_CLOSE, DOLLY_MICROPHONE_SLOTS,
    DOLLY_MICROPHONE_PACKET_BYTES, DOLLY_MICROPHONE_REPLY_BYTES, 1, dolly_microphone_dispatch, replies, leases};

const dolly_kernel_module dolly_microphone_kernel = {DOLLY_MICROPHONE_PROCESS_OP, DOLLY_MICROPHONE_PROCESS_OP, .device = &microphone};
