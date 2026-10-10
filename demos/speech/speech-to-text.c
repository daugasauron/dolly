// speech-to-text [MODEL]: writes what the microphone hears as text, a line for
// each stretch of speech. The model is a streaming one read by transcribe.cpp.
#define _GNU_SOURCE
#include <dolly/microphone.h>
#include <errno.h>
#include <math.h>
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <transcribe.h>
#include <unistd.h>

enum {
  FRAME = 480,           // 30 ms at the model's 16 kHz
  TAPS = 48,
  LEAD_FRAMES = 10,      // 0.3 s kept from before speech is noticed
  LEAST_FRAMES = 4,      // the model hears what arrived while it answered: 120 ms or more,
  MOST_FRAMES = 64,      // 1.9 s at most
  QUIET_FRAMES = 50,     // 1.5 s of quiet ends a line,
  LONG_FRAMES = 500,     // after 15 s of one a breath does (0.3 s),
  BREATH_FRAMES = 10,
  LONGEST_FRAMES = 1000, // and at 30 s it ends
  QUEUE = 16000 * 30,    // what the model may fall behind by
};

static struct transcribe_session *session;
static float taps[TAPS];
// Heard and not yet read by the model, at 16 kHz. The microphone itself keeps
// two seconds; `lost` counts the 48 kHz frames it dropped and what did not fit here.
static struct {
  pthread_mutex_t lock;
  pthread_cond_t arrived;
  float samples[QUEUE];
  size_t start, count;
  uint64_t lost;
  int error;
} heard = {PTHREAD_MUTEX_INITIALIZER, PTHREAD_COND_INITIALIZER};

static void fail(const char *what, transcribe_status status) {
  fprintf(stderr, "\rspeech-to-text: %s: %s\n", what, transcribe_status_string(status));
  exit(1);
}

// 48 kHz to 16 kHz: a low-pass at 7 kHz, then every third sample.
static void design_low_pass(void) {
  const double cutoff = 7000.0 / DOLLY_MICROPHONE_RATE;
  double sum = 0;
  for (int i = 0; i < TAPS; ++i) {
    const double t = i - (TAPS - 1) / 2.0;
    const double window = 0.54 - 0.46 * cos(2 * M_PI * i / (TAPS - 1));
    taps[i] = (float)(sin(2 * M_PI * cutoff * t) / (M_PI * t) * window);
    sum += taps[i];
  }
  for (int i = 0; i < TAPS; ++i) taps[i] /= (float)sum;
}

static size_t to_16_khz(const float *input, size_t count, float *output) {
  static float window[TAPS + DOLLY_MICROPHONE_MAX_FRAMES];
  static size_t held;
  memcpy(window + held, input, count * sizeof(float));
  held += count;
  size_t at = 0, made = 0;
  for (; at + TAPS <= held; at += 3) {
    float sample = 0;
    for (int tap = 0; tap < TAPS; ++tap) sample += taps[tap] * window[at + tap];
    output[made++] = sample;
  }
  held -= at;
  memmove(window, window + at, held * sizeof(float));
  return made;
}

// The line being spoken, dim and cut to the terminal's width from its end;
// a finished one in full.
static void show(int finished) {
  struct transcribe_stream_text text;
  transcribe_stream_text_init(&text);
  if (transcribe_stream_get_text(session, &text) != TRANSCRIBE_OK || !text.full_text) return;
  const char *line = text.full_text + strspn(text.full_text, " ");
  if (finished) {
    printf("\r\x1b[2K%s%s", line, *line ? "\n" : "");
  } else {
    struct winsize size;
    const size_t columns = ioctl(STDOUT_FILENO, TIOCGWINSZ, &size) == 0 && size.ws_col > 1 ? size.ws_col - 1u : 79;
    const size_t length = strlen(line);
    const char *tail = length > columns ? line + length - columns : line;
    while ((*tail & 0xc0) == 0x80) ++tail;
    printf("\r\x1b[2K\x1b[2m%s\x1b[0m", tail);
  }
  fflush(stdout);
}

static void hear(const float *samples, int count) {
  struct transcribe_stream_update update;
  transcribe_stream_update_init(&update);
  const transcribe_status status = transcribe_stream_feed(session, samples, count, &update);
  if (status != TRANSCRIBE_OK) fail("the model", status);
  if (update.result_changed) show(0);
}

// One frame from the microphone, and whether more are waiting. Speech is a
// frame well above the room's own level, which the quiet frames measure.
static void frame_arrived(const float *frame, int more) {
  static float lead[LEAD_FRAMES][FRAME], pending[MOST_FRAMES * FRAME], room = 0.003f;
  static int speaking, lead_at, held, quiet, frames;
  double energy = 0;
  for (int i = 0; i < FRAME; ++i) energy += frame[i] * frame[i];
  const float level = (float)sqrt(energy / FRAME);
  const int speech = level > fmaxf(4 * room, 0.006f);
  if (!speech) room += 0.05f * (level - room);

  if (!speaking) {
    if (!speech) {
      memcpy(lead[lead_at], frame, sizeof(lead[0]));
      lead_at = (lead_at + 1) % LEAD_FRAMES;
      return;
    }
    transcribe_stream_reset(session);
    const transcribe_status status = transcribe_stream_begin(session, NULL, NULL);
    if (status != TRANSCRIBE_OK) fail("the model", status);
    for (held = 0; held < LEAD_FRAMES; ++held) memcpy(pending + held * FRAME, lead[(lead_at + held) % LEAD_FRAMES], sizeof(lead[0]));
    memset(lead, 0, sizeof(lead));
    speaking = 1; quiet = frames = 0;
  }
  memcpy(pending + held++ * FRAME, frame, FRAME * sizeof(float));
  quiet = speech ? 0 : quiet + 1;
  ++frames;
  const int ended = quiet >= QUIET_FRAMES || (frames >= LONG_FRAMES && quiet >= BREATH_FRAMES) || frames >= LONGEST_FRAMES;
  // A model that keeps up is as far behind as its own answer takes; a slower one hears all that waited.
  if (!ended && held < MOST_FRAMES && (more || held < LEAST_FRAMES)) return;
  hear(pending, held * FRAME);
  held = 0;
  if (!ended) return;
  const transcribe_status status = transcribe_stream_finalize(session, NULL);
  if (status != TRANSCRIBE_OK) fail("the model", status);
  show(1);
  speaking = 0;
  static uint64_t told;
  pthread_mutex_lock(&heard.lock);
  const uint64_t lost = heard.lost;
  pthread_mutex_unlock(&heard.lock);
  if (lost > told) {
    printf("\x1b[2m(%.1f s of sound were lost: the model fell behind)\x1b[0m\n", (double)(lost - told) / DOLLY_MICROPHONE_RATE);
    told = lost;
  }
}

// Moves what the microphone hears into the queue, so that the model may take its time.
static void *listen(void *opened) {
  dolly_microphone *microphone = opened;
  static float input[DOLLY_MICROPHONE_MAX_FRAMES], output[DOLLY_MICROPHONE_MAX_FRAMES / 3 + 1];
  uint64_t dropped = 0;
  for (;;) {
    const int count = dolly_microphone_read(microphone, input, DOLLY_MICROPHONE_MAX_FRAMES);
    dolly_microphone_status status;
    if (count < 0 || dolly_microphone_get_status(microphone, &status) != 0) break;
    if (!count) { usleep(20000); continue; }
    const size_t made = to_16_khz(input, (size_t)count, output);
    pthread_mutex_lock(&heard.lock);
    heard.lost += status.dropped_frames - dropped;
    dropped = status.dropped_frames;
    for (size_t i = 0; i < made; ++i) {
      if (heard.count == QUEUE) { heard.start = (heard.start + 1) % QUEUE; --heard.count; heard.lost += 3; }
      heard.samples[(heard.start + heard.count++) % QUEUE] = output[i];
    }
    pthread_cond_signal(&heard.arrived);
    pthread_mutex_unlock(&heard.lock);
  }
  pthread_mutex_lock(&heard.lock);
  heard.error = errno;
  pthread_cond_signal(&heard.arrived);
  pthread_mutex_unlock(&heard.lock);
  return NULL;
}

int main(int argc, char **argv) {
  const char *model = argc > 1 ? argv[1] : "/usr/share/dolly/speech/moonshine-streaming-tiny.gguf";
  static dolly_microphone microphone;
  static float frame[FRAME];
  // Asked first: the browser's question shows while the model loads.
  if (dolly_microphone_open(&microphone) != 0) { perror("speech-to-text: the microphone"); return 1; }
  puts("Loading the model...");
  transcribe_log_set(NULL, NULL);
  struct transcribe_session_params parameters;
  transcribe_session_params_init(&parameters);
  parameters.n_threads = 4;
  const transcribe_status status = transcribe_open(model, NULL, &parameters, &session);
  if (status != TRANSCRIBE_OK) fail(model, status);
  design_low_pass();

  dolly_microphone_status asked;
  for (int told = 0;; usleep(50000)) {
    if (dolly_microphone_get_status(&microphone, &asked) != 0) { perror("speech-to-text: the microphone"); return 1; }
    if (asked.state != DOLLY_MICROPHONE_WAITING) break;
    if (!told++) puts("Waiting for the browser's permission to use the microphone...");
  }
  if (asked.state == DOLLY_MICROPHONE_CAPTURING) puts("Listening. Each pause ends a line; Ctrl+C stops.");
  pthread_t listener;
  if (pthread_create(&listener, NULL, listen, &microphone) != 0) { perror("speech-to-text: a thread"); return 1; }
  for (;;) {
    pthread_mutex_lock(&heard.lock);
    while (heard.count < FRAME && !heard.error) pthread_cond_wait(&heard.arrived, &heard.lock);
    const int error = heard.count < FRAME ? heard.error : 0;
    for (int i = 0; !error && i < FRAME; ++i) frame[i] = heard.samples[(heard.start + i) % QUEUE];
    if (!error) { heard.start = (heard.start + FRAME) % QUEUE; heard.count -= FRAME; }
    const int more = heard.count >= FRAME;
    pthread_mutex_unlock(&heard.lock);
    if (error) {
      fprintf(stderr, "\rspeech-to-text: %s\n", error == EACCES ? "the browser refused the microphone"
          : error == ENODEV ? "no microphone is available" : strerror(error));
      return 1;
    }
    frame_arrived(frame, more);
  }
}
