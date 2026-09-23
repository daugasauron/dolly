#define _GNU_SOURCE
#include <dolly/audio.h>
#include <errno.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>

static void check(int ok, const char *what) {
  if (!ok) { perror(what); exit(1); }
}
static double now(void) {
  struct timespec t; clock_gettime(CLOCK_MONOTONIC, &t);
  return t.tv_sec + t.tv_nsec * 1e-9;
}
int main(int argc, char **argv) {
  static dolly_audio audio;
  static float pcm[4096 * 2];
  const int hold = argc > 1 && !strcmp(argv[1], "--hold");
  for (unsigned i = 0; i < 4096; ++i) pcm[i * 2 + 1] = .5f * sinf(i * 440.f * 6.283185307f / 48000.f);
  check(dolly_audio_open(&audio) == 0, "audio open");
  static dolly_audio duplicate;
  check(dolly_audio_open(&duplicate) == -1 && errno == EBUSY, "duplicate audio open");
  pcm[0] = NAN;
  check(dolly_audio_write(&audio, pcm, 4096) == -1 && errno == EINVAL, "nonfinite PCM accepted");
  pcm[0] = 0;
  unsigned accepted = 0;
  for (unsigned i = 0; i < 30; ++i) {
    int n = dolly_audio_write(&audio, pcm, 4096);
    if (n < 0) { check(errno == EAGAIN, "audio backpressure"); break; }
    check(n == 4096, "partial audio write"); accepted += n;
  }
  check(accepted >= 4096 && accepted < 30 * 4096, "audio queue unbounded");
  printf("AUDIO_QUEUED %u\n", accepted); fflush(stdout);
  if (hold) {
    puts("AUDIO_HOLD"); fflush(stdout);
    for (;;) { usleep(10000); int n = dolly_audio_write(&audio, pcm, 4096); check(n == 4096 || (n == -1 && errno == EAGAIN), "held audio write"); }
  }
  dolly_audio_status status;
  const double deadline = now() + 10;
  do {
    check(dolly_audio_get_status(&audio, &status) == 0, "audio status");
    check(status.queued_frames <= DOLLY_AUDIO_QUEUE_FRAMES, "queue quota");
    check(now() < deadline, "audio playback timeout"); usleep(10000);
  } while (status.queued_frames);
  check(status.played_frames == accepted, "played frame accounting");
  check(dolly_audio_close(&audio) == 0, "audio close");
  check(dolly_audio_write(&audio, pcm, 4096) == -1 && errno == EBADF, "closed audio accepted");
  check(dolly_audio_open(&audio) == 0 && dolly_audio_write(&audio, pcm, 4096) == 4096, "audio reopen");
  puts("Audio PCM playback PASS");
  return 0; /* Reaping must revoke the reopened stream and queued output. */
}
