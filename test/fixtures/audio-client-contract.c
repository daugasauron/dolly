#include <dolly/audio.h>
#include <dolly/process.h>
#include <assert.h>
#include <errno.h>
#include <stdio.h>
#include <string.h>

static uint32_t reply[4], calls;
static int64_t result;
static uint64_t previous_sequence;

int64_t audio_test_call(uint32_t operation, const void *request, uint64_t bytes,
                       void *response, uint64_t capacity) {
  const uint32_t *words = request;
  uint64_t sequence;
  memcpy(&sequence, (const char *)request + 16, 8);
  assert(operation == DOLLY_AUDIO_PROCESS_OP && bytes >= 32 && capacity == 16);
  assert(words[0] == DOLLY_AUDIO_VERSION && words[6] == bytes - 32 && !words[7]);
  assert(sequence > previous_sequence && sequence <= UINT32_MAX);
  previous_sequence = sequence;
  ++calls;
  if (result > 0 && result <= 16) memcpy(response, reply, result);
  return result;
}

int main(void) {
  static dolly_audio audio;
  static float pcm[256];
  dolly_audio_status status = {123, 2, 456};
  reply[0] = 1; reply[2] = DOLLY_AUDIO_RATE; reply[3] = DOLLY_AUDIO_CHANNELS;
  result = 16;
  assert(dolly_audio_open(&audio) == 0 && audio.scope == 1);
  assert(dolly_audio_open(&audio) == -1 && errno == EBUSY && calls == 1);
  assert(dolly_audio_write(&audio, pcm, 127) == -1 && errno == EINVAL && calls == 1);
  assert(dolly_audio_write(&audio, NULL, 128) == -1 && errno == EINVAL && calls == 1);
  result = 4; reply[0] = 127;
  assert(dolly_audio_write(&audio, pcm, 128) == -1 && errno == EPROTO);
  reply[0] = 129;
  assert(dolly_audio_write(&audio, pcm, 128) == -1 && errno == EPROTO);
  reply[0] = 128;
  assert(dolly_audio_write(&audio, pcm, 128) == 128);
  result = -EAGAIN;
  assert(dolly_audio_write(&audio, pcm, 128) == -1 && errno == EAGAIN);
  result = INT64_MAX;
  assert(dolly_audio_write(&audio, pcm, 128) == -1 && errno == EPROTO);
  result = 16; reply[0] = DOLLY_AUDIO_QUEUE_FRAMES + 1; reply[1] = 1;
  assert(dolly_audio_get_status(&audio, &status) == -1 && errno == EPROTO);
  assert(status.queued_frames == 123 && status.played_frames == 456);
  reply[0] = 0; reply[1] = 3;
  assert(dolly_audio_get_status(&audio, &status) == -1 && errno == EPROTO);
  reply[1] = 2; reply[2] = 1024; reply[3] = 0;
  assert(dolly_audio_get_status(&audio, &status) == 0 && status.played_frames == 1024);
  result = 4;
  assert(dolly_audio_close(&audio) == -1 && errno == EPROTO && audio.scope == 1);
  audio.sequence = UINT32_MAX - 1;
  assert(dolly_audio_get_status(&audio, &status) == -1 && errno == EOVERFLOW);
  result = 0;
  assert(dolly_audio_close(&audio) == 0 && audio.scope == 0);
  assert(previous_sequence == UINT32_MAX);
  assert(dolly_audio_close(&audio) == -1 && errno == EBADF);
  previous_sequence = 0; result = 16; reply[0] = 0;
  assert(dolly_audio_open(&audio) == -1 && errno == EPROTO);
  puts("Audio client contract PASS");
}
