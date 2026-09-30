#include <dolly/audio.h>
#include <dolly/host.h>

DOLLY_HOST_REQUIRE(audio, 0);
#include <dolly/process.h>
#include <errno.h>
#include <string.h>

static int fail(int error) { errno = error; return -1; }
static void u32(void *data, size_t offset, uint32_t n) { memcpy((char *)data + offset, &n, 4); }
static void u64(void *data, size_t offset, uint64_t n) { memcpy((char *)data + offset, &n, 8); }

static int call(dolly_audio *audio, unsigned operation, size_t bytes, size_t reply_bytes) {
  if (!audio) return fail(EINVAL);
  if (operation != DOLLY_AUDIO_OPEN && !audio->scope) return fail(EBADF);
  /* Reserve the last sequence for CLOSE so an exhausted stream can be reopened. */
  if (audio->sequence >= UINT32_MAX - (operation != DOLLY_AUDIO_CLOSE))
    return fail(EOVERFLOW);
  u32(audio->packet, 0, DOLLY_AUDIO_VERSION);
  u32(audio->packet, 4, operation);
  u64(audio->packet, 8, audio->scope);
  u64(audio->packet, 16, ++audio->sequence);
  u32(audio->packet, 24, bytes - 32);
  u32(audio->packet, 28, 0);
  int64_t result = dolly_process_call(DOLLY_AUDIO_PROCESS_OP, audio->packet, bytes,
                                    audio->reply, sizeof(audio->reply));
  if (result < 0 && result >= -4095) return fail((int)-result);
  return result == (int64_t)reply_bytes ? 0 : fail(EPROTO);
}

int dolly_audio_open(dolly_audio *audio) {
  if (!audio) return fail(EINVAL);
  if (audio->scope) return fail(EBUSY);
  memset(audio, 0, sizeof(*audio));
  if (call(audio, DOLLY_AUDIO_OPEN, 32, 16) < 0) return -1;
  uint64_t scope;
  uint32_t rate, channels;
  memcpy(&scope, audio->reply, 8);
  memcpy(&rate, audio->reply + 8, 4);
  memcpy(&channels, audio->reply + 12, 4);
  if (!scope || scope > UINT32_MAX) return fail(EPROTO);
  audio->scope = scope;
  if (rate != DOLLY_AUDIO_RATE || channels != DOLLY_AUDIO_CHANNELS) {
    dolly_audio_close(audio);
    return fail(EPROTO);
  }
  return 0;
}

int dolly_audio_close(dolly_audio *audio) {
  if (call(audio, DOLLY_AUDIO_CLOSE, 32, 0) < 0) return -1;
  audio->scope = 0;
  return 0;
}

int dolly_audio_write(dolly_audio *audio, const float *stereo, uint32_t frames) {
  if (!audio || !stereo || frames < DOLLY_AUDIO_MIN_FRAMES || frames > DOLLY_AUDIO_MAX_FRAMES)
    return fail(EINVAL);
  if (!audio->scope) return fail(EBADF);
  u32(audio->packet, 32, frames);
  u32(audio->packet, 36, 0);
  memcpy(audio->packet + 40, stereo, frames * 8);
  if (call(audio, DOLLY_AUDIO_WRITE, 40 + frames * 8, 4) < 0) return -1;
  uint32_t accepted;
  memcpy(&accepted, audio->reply, 4);
  return accepted == frames ? (int)accepted : fail(EPROTO);
}

int dolly_audio_get_status(dolly_audio *audio, dolly_audio_status *status) {
  if (!status) return fail(EINVAL);
  if (call(audio, DOLLY_AUDIO_STATUS, 32, 16) < 0) return -1;
  dolly_audio_status reply;
  memcpy(&reply, audio->reply, sizeof(reply));
  if (reply.queued_frames > DOLLY_AUDIO_QUEUE_FRAMES || (reply.state != 1 && reply.state != 2))
    return fail(EPROTO);
  *status = reply;
  return 0;
}
