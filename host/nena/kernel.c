// nena@0 kernel side: a device leased per process (src/device-lease.c). The
// page answers every packet; nothing about a session's modules is kept here.
#include "device-lease.h"
#include "process-kernel.h"

#include <dolly/nena-abi.h>
#include <emscripten/emscripten.h>
#include <errno.h>

static _Alignas(64) unsigned char replies[DOLLY_NENA_SLOTS * (64 + DOLLY_NENA_REPLY_BYTES)];
static dolly_device_lease leases[DOLLY_NENA_SLOTS];

DOLLY_BROWSER_IMPORT(dolly_nena_dispatch)
int dolly_nena_dispatch(const void *packet, uintptr_t bytes);
uintptr_t dolly_nena_mailbox_address(void) { return (uintptr_t)replies; }

static const dolly_leased_device nena = {
    DOLLY_NENA_VERSION, DOLLY_NENA_OPEN, DOLLY_NENA_CLOSE, DOLLY_NENA_SLOTS,
    DOLLY_NENA_PACKET_BYTES, DOLLY_NENA_REPLY_BYTES, 1, dolly_nena_dispatch, replies, leases};

static int64_t nena_call(int pid, int tid, uint32_t operation, unsigned char *packet,
                         uintptr_t size, uintptr_t capacity) {
  return dolly_device_call(&nena, pid, packet, size, capacity);
}

static void nena_release(int pid, int tid) {
  if (tid == 0) dolly_device_release(&nena, pid);
}

const dolly_kernel_module dolly_nena_kernel = {DOLLY_NENA_PROCESS_OP, DOLLY_NENA_PROCESS_OP, nena_call, nena_release};
