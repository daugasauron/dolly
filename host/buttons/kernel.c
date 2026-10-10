// buttons@0 kernel side: the strip leased to one process (src/device-lease.c)
// and what that process types, which stays in Wasm.
#include "device-lease.h"
#include "process-kernel.h"

#include <dolly/buttons-abi.h>
#include <emscripten/emscripten.h>
#include <errno.h>

static _Alignas(64) unsigned char replies[DOLLY_BUTTONS_SLOTS * (64 + DOLLY_BUTTONS_REPLY_BYTES)];
static dolly_device_lease leases[DOLLY_BUTTONS_SLOTS];

DOLLY_BROWSER_IMPORT(dolly_buttons_dispatch)
int dolly_buttons_dispatch(const void *packet, uintptr_t bytes);
uintptr_t dolly_buttons_mailbox_address(void) { return (uintptr_t)replies; }

static const dolly_leased_device buttons = {
    DOLLY_BUTTONS_VERSION, DOLLY_BUTTONS_OPEN, DOLLY_BUTTONS_CLOSE, DOLLY_BUTTONS_SLOTS,
    DOLLY_BUTTONS_PACKET_BYTES, DOLLY_BUTTONS_REPLY_BYTES, 1, dolly_buttons_dispatch, replies, leases};

static int64_t buttons_call(int pid, int tid, uint32_t operation, unsigned char *packet,
                            uintptr_t size, uintptr_t capacity) {
  if (operation == DOLLY_BUTTONS_PROCESS_OP) return dolly_device_call(&buttons, pid, packet, size, capacity);
  if (leases[0].pid != pid) return -EBADF;
  if (size == 0 || size > DOLLY_BUTTONS_TYPE_BYTES) return -EINVAL;
  return dolly_kernel_terminal_type(packet, size);
}

static void buttons_release(int pid, int tid) {
  if (tid == 0) dolly_device_release(&buttons, pid);
}

const dolly_kernel_module dolly_buttons_kernel = {DOLLY_BUTTONS_PROCESS_OP, DOLLY_BUTTONS_TYPE_OP,
                                                  buttons_call, buttons_release};
