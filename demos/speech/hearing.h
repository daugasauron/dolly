// What speech-to-text and voice share: the microphone at the model's rate, and
// a line of speech that a second thread transcribes again, whole, whenever the
// model is free. The model is not a streaming one: hearing a line from its
// start each time costs less than a streaming model of the same accuracy.
#include <dolly/microphone.h>
#include <math.h>
#include <pthread.h>
#include <string.h>
#include <transcribe.h>

enum {
  RATE = 16000,
  TAPS = 48,
  LINE_SECONDS = 60,
  FRESH = RATE / 4, // the model hears a line again once this much of it is new
};

// 48 kHz to 16 kHz: a low-pass at 7 kHz, then every third sample.
static float taps[TAPS];

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

// What the microphone has queued, at 16 kHz, into room for
// DOLLY_MICROPHONE_MAX_FRAMES / 3 + 1 samples: their count, or -1 and errno.
static int microphone_read_16_khz(dolly_microphone *microphone, float *output) {
  static float window[TAPS + DOLLY_MICROPHONE_MAX_FRAMES];
  static size_t held;
  const int count = dolly_microphone_read(microphone, window + held, DOLLY_MICROPHONE_MAX_FRAMES);
  if (count <= 0) return count;
  held += (size_t)count;
  size_t at = 0;
  int made = 0;
  for (; at + TAPS <= held; at += 3) {
    float sample = 0;
    for (int tap = 0; tap < TAPS; ++tap) sample += taps[tap] * window[at + tap];
    output[made++] = sample;
  }
  held -= at;
  memmove(window, window + at, held * sizeof(float));
  return made;
}

// The line being spoken. Samples are only added while it lasts, so the model
// reads the start of them without the lock.
static struct {
  pthread_mutex_t lock;
  pthread_cond_t changed;
  struct transcribe_session *session;
  float samples[RATE * LINE_SECONDS];
  size_t count, heard; // samples, and how many of them the text is of
  char text[4096];
  unsigned texts;      // counts them, for a reader to notice the next
  int ending, ended;   // no more sound will come; the text is of all of it
  int busy;
  transcribe_status failed;
} line = {PTHREAD_MUTEX_INITIALIZER, PTHREAD_COND_INITIALIZER};

static void *recognise(void *unused) {
  (void)unused;
  pthread_mutex_lock(&line.lock);
  for (;;) {
    while (line.ended || (line.count - line.heard < FRESH && !line.ending)) pthread_cond_wait(&line.changed, &line.lock);
    const size_t count = line.count;
    line.busy = 1;
    pthread_mutex_unlock(&line.lock);
    const transcribe_status status = count ? transcribe_run(line.session, line.samples, (int)count, NULL) : TRANSCRIBE_OK;
    const char *text = count && status == TRANSCRIBE_OK ? transcribe_full_text(line.session) : "";
    pthread_mutex_lock(&line.lock);
    line.busy = 0;
    // A line begun meanwhile has fewer samples than this text is of: the text is dropped.
    if (count <= line.count && !line.ended) {
      text += strspn(text, " ");
      line.texts += strcmp(line.text, text) != 0;
      snprintf(line.text, sizeof(line.text), "%s", text);
      line.failed = status;
      line.heard = count;
      line.ended = line.ending && count == line.count;
    }
    pthread_cond_broadcast(&line.changed);
  }
  return NULL;
}

// Loads the model and starts the thread that reads lines; 0, or the model's refusal.
static transcribe_status hearing_open(const char *model, int threads) {
  transcribe_log_set(NULL, NULL);
  struct transcribe_session_params parameters;
  transcribe_session_params_init(&parameters);
  parameters.n_threads = threads;
  const transcribe_status status = transcribe_open(model, NULL, &parameters, &line.session);
  if (status != TRANSCRIBE_OK) return status;
  design_low_pass();
  line.ended = 1;
  pthread_t thread;
  return pthread_create(&thread, NULL, recognise, NULL) == 0 ? TRANSCRIBE_OK : TRANSCRIBE_ERR_OOM;
}

// A new line; waits for the model to let go of the last one.
static void line_begin(void) {
  pthread_mutex_lock(&line.lock);
  line.ended = 1;
  while (line.busy) pthread_cond_wait(&line.changed, &line.lock);
  line.count = line.heard = 0;
  line.text[0] = 0;
  line.ending = line.ended = 0;
  pthread_mutex_unlock(&line.lock);
}

// More of the line; returns how much of it there was room for.
static size_t line_add(const float *samples, size_t count) {
  pthread_mutex_lock(&line.lock);
  const size_t room = sizeof(line.samples) / sizeof(line.samples[0]) - line.count;
  if (count > room) count = room;
  memcpy(line.samples + line.count, samples, count * sizeof(float));
  line.count += count;
  pthread_cond_broadcast(&line.changed);
  pthread_mutex_unlock(&line.lock);
  return count;
}

static void line_end(void) {
  pthread_mutex_lock(&line.lock);
  line.ending = 1;
  pthread_cond_broadcast(&line.changed);
  pthread_mutex_unlock(&line.lock);
}

// Copies the text when it is not the one numbered *seen; says whether it is the line's last.
static int line_read(char *text, size_t size, unsigned *seen, transcribe_status *failed) {
  pthread_mutex_lock(&line.lock);
  if (*seen != line.texts) snprintf(text, size, "%s", line.text);
  *seen = line.texts;
  *failed = line.failed;
  const int ended = line.ended;
  pthread_mutex_unlock(&line.lock);
  return ended;
}
