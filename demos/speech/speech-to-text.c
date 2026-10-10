// speech-to-text [MODEL [DETECTOR]]: writes what the microphone hears as
// text, a line for each stretch of speech. DETECTOR is the model that tells
// speech from other sound.
#define _GNU_SOURCE
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/ioctl.h>
#include <transcribe/vad.h>
#include <unistd.h>
#include "hearing.h"

enum {
  FRAME = 512,          // what the detector judges at a time: 32 ms
  LEAD_FRAMES = 10,     // 0.3 s kept from before speech is noticed
  QUIET_FRAMES = 47,    // 1.5 s without speech ends a line,
  LONG_FRAMES = 470,    // after 15 s of one a breath does (0.3 s),
  BREATH_FRAMES = 10,
  LONGEST_FRAMES = 940, // and at 30 s it ends
};

static int speaking;
static unsigned seen;

static void fail(const char *what, transcribe_status status) {
  fprintf(stderr, "\rspeech-to-text: %s: %s\n", what, transcribe_status_string(status));
  exit(1);
}

// The line being spoken, dim and cut to the terminal's width from its end
// while the model may still change it; then in full. Says whether it has ended.
static int show(void) {
  static char text[sizeof(line.text)];
  transcribe_status failed;
  const unsigned before = seen;
  const int ended = line_read(text, sizeof(text), &seen, &failed);
  if (failed != TRANSCRIBE_OK) fail("the model", failed);
  if (ended) {
    printf("\r\x1b[2K%s%s", text, *text ? "\n" : "");
  } else if (seen != before) {
    struct winsize size;
    const size_t columns = ioctl(STDOUT_FILENO, TIOCGWINSZ, &size) == 0 && size.ws_col > 1 ? size.ws_col - 1u : 79;
    const size_t length = strlen(text);
    const char *tail = length > columns ? text + length - columns : text;
    while ((*tail & 0xc0) == 0x80) ++tail;
    printf("\r\x1b[2K\x1b[2m%s\x1b[0m", tail);
  }
  fflush(stdout);
  return ended;
}

// One frame, and whether the detector heard speech in it.
static void frame_judged(const float *frame, int speech) {
  static float lead[LEAD_FRAMES][FRAME];
  static int lead_at, quiet, frames;
  if (!speaking) {
    if (!speech) {
      memcpy(lead[lead_at], frame, sizeof(lead[0]));
      lead_at = (lead_at + 1) % LEAD_FRAMES;
      return;
    }
    line_begin();
    for (int i = 0; i < LEAD_FRAMES; ++i) line_add(lead[(lead_at + i) % LEAD_FRAMES], FRAME);
    memset(lead, 0, sizeof(lead));
    speaking = 1;
    quiet = frames = 0;
  }
  line_add(frame, FRAME);
  quiet = speech ? 0 : quiet + 1;
  ++frames;
  if (quiet < QUIET_FRAMES && !(frames >= LONG_FRAMES && quiet >= BREATH_FRAMES) && frames < LONGEST_FRAMES) return;
  line_end();
  while (!show()) usleep(5000);
  speaking = 0;
}

int main(int argc, char **argv) {
  const char *model = argc > 1 ? argv[1] : "/usr/share/dolly/speech/parakeet-tdt_ctc-110m.gguf";
  const char *detector = argc > 2 ? argv[2] : "/usr/share/dolly/speech/silero-vad.gguf";
  static dolly_microphone microphone;
  // Asked first: the browser's question shows while the models load.
  if (dolly_microphone_open(&microphone) != 0) { perror("speech-to-text: the microphone"); return 1; }
  puts("Loading the model...");
  transcribe_status status = hearing_open(model, 4);
  if (status != TRANSCRIBE_OK) fail(model, status);
  struct transcribe_model *detecting;
  struct transcribe_vad_session *detection;
  if ((status = transcribe_model_load_file(detector, NULL, &detecting)) != TRANSCRIBE_OK ||
      (status = transcribe_vad_session_init(detecting, NULL, &detection)) != TRANSCRIBE_OK) fail(detector, status);

  dolly_microphone_status asked;
  for (int told = 0;; usleep(50000)) {
    if (dolly_microphone_get_status(&microphone, &asked) != 0) { perror("speech-to-text: the microphone"); return 1; }
    if (asked.state != DOLLY_MICROPHONE_WAITING) break;
    if (!told++) puts("Waiting for the browser's permission to use the microphone...");
  }
  if (asked.state == DOLLY_MICROPHONE_CAPTURING) puts("Listening. Each pause ends a line; Ctrl+C stops.");
  // Heard and not yet judged: the detector keeps what does not fill a frame.
  static float waiting[FRAME + DOLLY_MICROPHONE_MAX_FRAMES / 3 + 1];
  size_t held = 0;
  uint64_t told = 0;
  for (;;) {
    const int count = microphone_read_16_khz(&microphone, waiting + held);
    if (count < 0) {
      fprintf(stderr, "\rspeech-to-text: %s\n", errno == EACCES ? "the browser refused the microphone"
          : errno == ENODEV ? "no microphone is available" : strerror(errno));
      return 1;
    }
    if (count == 0) {
      if (speaking) show();
      usleep(20000);
      continue;
    }
    struct transcribe_vad_result judged;
    transcribe_vad_result_init(&judged);
    if ((status = transcribe_vad_stream_feed(detection, waiting + held, count)) != TRANSCRIBE_OK ||
        (status = transcribe_vad_get_result(detection, &judged)) != TRANSCRIBE_OK) fail("the detector", status);
    held += (size_t)count;
    const float *speech = transcribe_vad_probs(detection);
    for (int i = 0; i < judged.n_probs; ++i) frame_judged(waiting + (size_t)i * FRAME, speech[i] >= 0.5f);
    held -= (size_t)judged.n_probs * FRAME;
    memmove(waiting, waiting + (size_t)judged.n_probs * FRAME, held * sizeof(float));
    if (dolly_microphone_get_status(&microphone, &asked) == 0 && asked.dropped_frames > told && !speaking) {
      printf("\x1b[2m(%.1f s of sound were lost: the model fell behind)\x1b[0m\n", (double)(asked.dropped_frames - told) / DOLLY_MICROPHONE_RATE);
      told = asked.dropped_frames;
    }
  }
}
