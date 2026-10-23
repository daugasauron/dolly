#ifndef DOLLY_DEVICE_LEASE_H
#define DOLLY_DEVICE_LEASE_H

#include <stdatomic.h>
#include <stddef.h>
#include <stdint.h>

/* A host device leased to one process at a time (gpu@0, audio@0, microphone@0). Each process
 * call is one packet the page answers in the lease's reply slot, a 64-byte
 * header followed by reply_bytes. */
typedef struct {
  _Atomic uint32_t state, scope, sequence, error, length;
  unsigned char reserved[44];
  unsigned char bytes[];
} dolly_device_reply;

typedef struct {
  int pid;
  uint32_t scope, sequence, operation;
  int pending;
} dolly_device_lease;

typedef struct {
  uint32_t version, open, close, slots;
  size_t packet_bytes, reply_bytes;
  int reopen_busy; /* OPEN on an open, idle lease fails with EBUSY. */
  int (*dispatch)(const void *packet, uintptr_t bytes);
  unsigned char *replies; /* slots * (64 + reply_bytes), 64-byte aligned. */
  dolly_device_lease *leases;
} dolly_leased_device;

int64_t dolly_device_call(const dolly_leased_device *device, int pid, unsigned char *packet,
                          uintptr_t size, uintptr_t capacity);
void dolly_device_release(const dolly_leased_device *device, int pid);

#endif
