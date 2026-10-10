#define _GNU_SOURCE
#include <dolly/microphone.h>
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
static dolly_microphone microphone;
static uint32_t settled(void) {
  dolly_microphone_status status;
  for (double end = now() + 20;;) {
    check(dolly_microphone_get_status(&microphone, &status) == 0, "microphone status");
    if (status.state != DOLLY_MICROPHONE_WAITING) return status.state;
    check(now() < end, "the browser never answered");
    usleep(20000);
  }
}
/* microphone [--denied|--hold]: records half a second and says what it heard. */
int main(int argc, char **argv) {
  static float pcm[24000], scratch[DOLLY_MICROPHONE_MAX_FRAMES];
  const char *mode = argc > 1 ? argv[1] : "";
  check(dolly_microphone_open(&microphone) == 0, "microphone open");
  uint64_t scope = microphone.scope;
  check(dolly_microphone_open(&microphone) == -1 && errno == EBUSY && microphone.scope == scope,
        "reopening an active client lost its lease");
  static dolly_microphone duplicate;
  check(dolly_microphone_open(&duplicate) == -1 && errno == EBUSY, "duplicate microphone open");
  check(dolly_microphone_read(&microphone, scratch, 0) == -1 && errno == EINVAL, "a read of no frames");
  check(dolly_microphone_read(&microphone, scratch, DOLLY_MICROPHONE_MAX_FRAMES + 1) == -1 && errno == EINVAL,
        "a read beyond the packet");
  uint32_t state = settled();
  if (!strcmp(mode, "--denied")) {
    check(state == DOLLY_MICROPHONE_DENIED, "the microphone was not denied");
    check(dolly_microphone_read(&microphone, scratch, 128) == -1 && errno == EACCES, "a denied read");
    check(dolly_microphone_close(&microphone) == 0, "microphone close");
    puts("MICROPHONE_DENIED");
    return 0;
  }
  check(state == DOLLY_MICROPHONE_CAPTURING, "the microphone is not capturing");
  if (!strcmp(mode, "--hold")) {
    puts("MICROPHONE_HOLDING"); fflush(stdout);
    for (;;) { check(dolly_microphone_read(&microphone, scratch, 4096) >= 0, "held read"); usleep(20000); }
  }
  /* A device starts with silence: the measurement begins 0.2 s in. */
  unsigned skipped = 0, frames = 0;
  for (double end = now() + 10; skipped < 9600;) {
    int n = dolly_microphone_read(&microphone, scratch, 9600 - skipped < 4096 ? 9600 - skipped : 4096);
    check(n >= 0, "microphone read");
    skipped += n;
    check(now() < end, "no samples arrived");
    if (!n) usleep(10000);
  }
  for (double end = now() + 10; frames < 24000;) {
    unsigned want = 24000 - frames < 4096 ? 24000 - frames : 4096;
    int n = dolly_microphone_read(&microphone, pcm + frames, want);
    check(n >= 0 && (unsigned)n <= want, "microphone read");
    frames += n;
    check(now() < end, "no samples arrived");
    if (!n) usleep(10000);
  }
  double energy = 0;
  unsigned crossings = 0;
  for (unsigned i = 0; i < frames; ++i) {
    check(isfinite(pcm[i]) && fabsf(pcm[i]) <= 1.5f, "a sample out of range");
    energy += pcm[i] * pcm[i];
    if (i && (pcm[i - 1] < 0) != (pcm[i] < 0)) ++crossings;
  }
  /* Unread, the queue holds its two seconds and counts what it drops. */
  usleep(2600000);
  dolly_microphone_status status;
  check(dolly_microphone_get_status(&microphone, &status) == 0, "microphone status");
  check(status.queued_frames == DOLLY_MICROPHONE_QUEUE_FRAMES && status.dropped_frames > 0 &&
        status.captured_frames == skipped + frames + status.queued_frames + status.dropped_frames,
        "the queue is not bounded or loses count");
  check(dolly_microphone_close(&microphone) == 0, "microphone close");
  check(dolly_microphone_get_status(&microphone, &status) == -1 && errno == EBADF, "status after close");
  check(dolly_microphone_open(&microphone) == 0 && microphone.scope > scope, "microphone reopen");
  check(settled() == DOLLY_MICROPHONE_CAPTURING, "the second capture");
  check(dolly_microphone_close(&microphone) == 0, "second close");
  printf("MICROPHONE_CAPTURED frames=%u rms=%.4f hz=%.0f dropped=%llu\n", frames, sqrt(energy / frames),
         crossings * (double)DOLLY_MICROPHONE_RATE / (2.0 * frames), (unsigned long long)status.dropped_frames);
  return 0;
}
