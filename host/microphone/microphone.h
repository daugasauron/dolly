#pragma once
#include <dolly/microphone-abi.h>
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
typedef struct {
  uint64_t scope, sequence;
  unsigned char packet[DOLLY_MICROPHONE_PACKET_BYTES], reply[DOLLY_MICROPHONE_REPLY_BYTES];
} dolly_microphone;
typedef struct {
  uint32_t queued_frames, state;
  uint64_t captured_frames, dropped_frames;
} dolly_microphone_status;
/* Zero-initialize before first use; one capture per process, called serially.
   Functions return -1 and set errno on failure. Open returns at once: the
   browser asks its user, and until they answer the state is
   DOLLY_MICROPHONE_WAITING and a read returns 0 frames. A read never blocks:
   it returns the frames queued, at most `frames` (1..DOLLY_MICROPHONE_MAX_FRAMES)
   mono samples at DOLLY_MICROPHONE_RATE, or fails with EACCES (denied) or
   ENODEV (no device, or it ended). On sequence EOVERFLOW, close and reopen. */
int dolly_microphone_open(dolly_microphone *microphone);
int dolly_microphone_close(dolly_microphone *microphone);
int dolly_microphone_read(dolly_microphone *microphone, float *mono, uint32_t frames);
int dolly_microphone_get_status(dolly_microphone *microphone, dolly_microphone_status *status);
#ifdef __cplusplus
}
#endif
