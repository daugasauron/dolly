// gpu@0 kernel side: a device leased per process (kernel/device-lease.c).
#include "device-lease.h"
#include "process-kernel.h"

#include <dolly/gpu-abi.h>
#include <errno.h>
#include <string.h>

static _Alignas(64) unsigned char replies[DOLLY_GPU_SLOTS * (DOLLY_DEVICE_REPLY_HEADER_BYTES + DOLLY_GPU_REPLY_BYTES)];
static dolly_device_lease leases[DOLLY_GPU_SLOTS];

DOLLY_BROWSER_IMPORT(dolly_gpu_dispatch)
int dolly_gpu_dispatch(const void *packet, uintptr_t bytes);
uintptr_t dolly_gpu_mailbox_address(void) { return (uintptr_t)replies; }

// The processes with a surface, in the order they opened it: the page shows
// the last one's. The first may be any process; another only a descendant of
// the process shown, as a program it runs to show its own window (display@0's
// lease is the same), and the surface below is shown again when it closes.
static int surface_pids[DOLLY_GPU_SLOTS];
static unsigned surfaces;

static int admit(int pid, const unsigned char *packet, uintptr_t size) {
  uint32_t width = 0;
  if (size >= 40) memcpy(&width, packet + 32, sizeof(width));
  if (width == 0) return 0;
  for (unsigned i = 0; i < surfaces; ++i)
    if (surface_pids[i] == pid) return 0;
  const int shown = surfaces ? surface_pids[surfaces - 1] : 0;
  if (surfaces == DOLLY_GPU_SLOTS || (shown && !dolly_process_descends_from(pid, shown))) return -EBUSY;
  surface_pids[surfaces++] = pid;
  return 0;
}

static void released(int pid) {
  unsigned i = 0;
  while (i < surfaces && surface_pids[i] != pid) ++i;
  if (i == surfaces) return;
  memmove(&surface_pids[i], &surface_pids[i + 1], (surfaces - i - 1) * sizeof(surface_pids[0]));
  --surfaces;
}

static const dolly_leased_device gpu = {
    DOLLY_GPU_VERSION, DOLLY_GPU_OPEN, DOLLY_GPU_CLOSE, DOLLY_GPU_SLOTS,
    DOLLY_GPU_PACKET_BYTES, DOLLY_GPU_REPLY_BYTES, 0, dolly_gpu_dispatch, replies, leases, admit, released};

const dolly_kernel_module dolly_gpu_kernel = {DOLLY_GPU_PROCESS_OP, DOLLY_GPU_PROCESS_OP, .device = &gpu};
