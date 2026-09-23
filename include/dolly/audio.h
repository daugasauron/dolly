#pragma once
#include <dolly/audio-abi.h>
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
typedef struct {
  uint64_t scope, sequence;
  unsigned char packet[DOLLY_AUDIO_PACKET_BYTES], reply[DOLLY_AUDIO_REPLY_BYTES];
} dolly_audio;
typedef struct {
  uint32_t queued_frames, state;
  uint64_t played_frames;
} dolly_audio_status;
/* Zero-initialize before first use; one stream per process, called serially.
   Functions return -1 and set errno on failure. A successful write accepts all
   frames. EAGAIN accepts none. On sequence EOVERFLOW, close and reopen. */
int dolly_audio_open(dolly_audio *audio);
int dolly_audio_close(dolly_audio *audio);
int dolly_audio_write(dolly_audio *audio, const float *stereo, uint32_t frames);
int dolly_audio_get_status(dolly_audio *audio, dolly_audio_status *status);
#ifdef __cplusplus
}
#endif
