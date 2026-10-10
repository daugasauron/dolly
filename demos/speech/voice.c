// voice MENU [MODEL]: stands in for a keyboard where there is none. It shows
// the buttons MENU names in the page, types what each one says into the
// terminal, and while one of them listens, types what the microphone hears.
// It writes nothing to the terminal itself: another program has the screen.
#define _GNU_SOURCE
#include <ctype.h>
#include <dolly/buttons.h>
#include <errno.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include "hearing.h"

enum { PAGES = 8, NAME = 32, TEXT = 256, WAIT = 0 /* the byte that stands for \w in a key's text */ };
enum action { TYPE, SPEAK, WORD, PASTE, PAGE };
struct key {
  char label[DOLLY_BUTTONS_LABEL_BYTES], text[TEXT], target[NAME];
  size_t length;
  enum action action;
  int page;
};
static struct page {
  char name[NAME], caption[DOLLY_BUTTONS_CAPTION_BYTES];
  struct key keys[DOLLY_BUTTONS_MAX];
  uint32_t count;
} pages[PAGES];
static int page_count, current;

static dolly_buttons buttons;
static dolly_microphone microphone;
static int layout;
static enum { RESTING, ASKING, LISTENING, ENDING } state;
static enum action speaking; // SPEAK types what was said; WORD types it as a search word
static int sending;          // and Enter after it
static char said[sizeof(line.text)], note[DOLLY_BUTTONS_CAPTION_BYTES];
static unsigned seen;

// "\r \e \t \\ \xHH" are the bytes, "\w" a wait.
static size_t unescape(const char *from, const char *end, char *text) {
  size_t length = 0;
  for (; from < end && length < TEXT; ++from) {
    if (*from != '\\' || from + 1 == end) { text[length++] = *from; continue; }
    switch (*++from) {
      case 'r': text[length++] = '\r'; break;
      case 'e': text[length++] = 27; break;
      case 't': text[length++] = '\t'; break;
      case 'w': text[length++] = WAIT; break;
      case 'x': if (end - from > 2) { const char hex[3] = {from[1], from[2], 0}; text[length++] = (char)strtol(hex, NULL, 16); from += 2; } break;
      default: text[length++] = *from;
    }
  }
  return length;
}

// "[NAME] caption" begins a page; "LABEL = TEXT" is a button, and after its
// text may stand ":speak", ":word", ":page NAME" or ":paste [NAME]". The menu's
// own comment says what they do. False names the line at fault.
static int read_menu(const char *path) {
  FILE *file = fopen(path, "r");
  if (!file) { perror(path); return 0; }
  char row[512];
  for (int number = 1; fgets(row, sizeof(row), file); ++number) {
    char *start = row + strspn(row, " \t"), *end = start + strcspn(start, "\r\n");
    while (end > start && end[-1] == ' ') --end;
    *end = 0;
    if (!*start || *start == '#') continue;
    char *close = strchr(start, ']'), *equals = strstr(start, " = ");
    if (*start == '[' && close && close - start <= NAME && page_count < PAGES) {
      struct page *page = &pages[page_count++];
      snprintf(page->name, sizeof(page->name), "%.*s", (int)(close - start - 1), start + 1);
      snprintf(page->caption, sizeof(page->caption), "%s", close + 1 + strspn(close + 1, " "));
      continue;
    }
    if (!page_count || !equals || equals - start >= DOLLY_BUTTONS_LABEL_BYTES || pages[page_count - 1].count == DOLLY_BUTTONS_MAX) {
      fprintf(stderr, "voice: %s:%d: not a page or a button\n", path, number);
      return 0;
    }
    struct page *page = &pages[page_count - 1];
    struct key *key = &page->keys[page->count++];
    snprintf(key->label, sizeof(key->label), "%.*s", (int)(equals - start), start);
    const char *text = equals + 3, *action = *text == ':' ? text : strstr(text, " :");
    key->length = unescape(text, action ? action : end, key->text);
    if (!action) continue;
    action += *action == ' ';
    if (!strcmp(action, ":speak")) key->action = SPEAK;
    else if (!strcmp(action, ":word")) key->action = WORD;
    else if (!strcmp(action, ":paste")) key->action = PASTE;
    else if (!strncmp(action, ":paste ", 7)) { key->action = PASTE; snprintf(key->target, sizeof(key->target), "%s", action + 7); }
    else if (!strncmp(action, ":page ", 6)) { key->action = PAGE; snprintf(key->target, sizeof(key->target), "%s", action + 6); }
    else { fprintf(stderr, "voice: %s:%d: %s is not an action\n", path, number, action); return 0; }
  }
  fclose(file);
  for (int at = 0; at < page_count; ++at) {
    for (uint32_t index = 0; index < pages[at].count; ++index) {
      struct key *key = &pages[at].keys[index];
      if (!*key->target) { key->page = at; continue; }
      for (key->page = 0; key->page < page_count && strcmp(pages[key->page].name, key->target); ++key->page) {}
      if (key->page == page_count) { fprintf(stderr, "voice: %s: no page %s\n", path, key->target); return 0; }
    }
  }
  return page_count > 0;
}

// The end of text that fits a caption with room for more bytes, from the start of one of its characters.
static const char *fitting(const char *text, size_t more) {
  const size_t length = strlen(text), room = DOLLY_BUTTONS_CAPTION_BYTES - 1 - more;
  const char *tail = text + (length > room ? length - room : 0);
  while ((*tail & 0xc0) == 0x80) ++tail;
  return tail;
}

// The page's buttons and its caption, or what is being heard and the three ways to end it.
static void show(void) {
  static const dolly_button ends[] = {{DOLLY_BUTTON_PRESS, "Send"}, {DOLLY_BUTTON_PRESS, "Done"}, {DOLLY_BUTTON_PRESS, "Cancel"}};
  dolly_button list[DOLLY_BUTTONS_MAX];
  const struct page *page = &pages[current];
  for (uint32_t index = 0; index < page->count; ++index) {
    list[index].kind = page->keys[index].action == PASTE ? DOLLY_BUTTON_PASTE : DOLLY_BUTTON_PRESS;
    memcpy(list[index].label, page->keys[index].label, sizeof(list[index].label));
  }
  char hearing[sizeof(note)];
  snprintf(hearing, sizeof(hearing), "%s%s", *said ? fitting(said, 4) : state == ASKING ? "Allow the microphone." : "Listening.", state == ENDING ? " ..." : "");
  layout = state == RESTING ? dolly_buttons_show(&buttons, *note ? note : page->caption, list, page->count)
                            : dolly_buttons_show(&buttons, hearing, ends, 3);
}

static void type(const char *bytes, size_t length) {
  for (size_t at = 0; at < length;) {
    if (bytes[at] == WAIT) { usleep(400000); ++at; continue; }
    size_t run = 0;
    while (at + run < length && bytes[at + run] != WAIT && run < DOLLY_BUTTONS_TYPE_BYTES) ++run;
    while (dolly_buttons_type(&buttons, bytes + at, (uint32_t)run) != 0 && errno == EAGAIN) usleep(10000);
    at += run;
  }
}

static void rest(const char *why) {
  if (state == ASKING || state == LISTENING) dolly_microphone_close(&microphone);
  state = RESTING;
  snprintf(note, sizeof(note), "%s", fitting(why, 0));
  show();
}

static void listen(enum action how) {
  if (line.session == NULL) { rest("The speech model did not load."); return; }
  if (dolly_microphone_open(&microphone) != 0) { rest(strerror(errno)); return; }
  line_begin();
  said[0] = 0;
  speaking = how;
  state = ASKING;
  show();
}

// Send, Done or Cancel; a full line ends as Done.
static void end(uint32_t button) {
  if (button == 2) { rest(""); return; }
  dolly_microphone_close(&microphone);
  line_end();
  sending = button == 0;
  state = ENDING;
  show();
}

// A search word: small letters and digits, nothing a sentence adds.
static void plain(char *text) {
  char *to = text;
  for (const char *from = text; *from; ++from) {
    if (!strchr(".,!?;:\"", *from)) *to++ = (char)tolower((unsigned char)*from);
  }
  *to = 0;
}

static void heard(void) {
  transcribe_status failed;
  const unsigned before = seen;
  const int ended = line_read(said, sizeof(said), &seen, &failed);
  if (failed != TRANSCRIBE_OK) { rest(transcribe_status_string(failed)); return; }
  if (state == ENDING && ended) {
    if (speaking == WORD) plain(said);
    type(said, strlen(said));
    if (sending) type("\r", 1);
    else if (speaking == SPEAK && *said) type(" ", 1);
    rest(*said ? said : "Nothing was heard.");
  } else if (seen != before) show();
}

static void capture(void) {
  static float samples[DOLLY_MICROPHONE_MAX_FRAMES / 3 + 1];
  dolly_microphone_status status;
  int count = dolly_microphone_get_status(&microphone, &status);
  if (count == 0 && state == ASKING && status.state == DOLLY_MICROPHONE_CAPTURING) { state = LISTENING; show(); }
  while (count == 0 && (count = microphone_read_16_khz(&microphone, samples)) > 0) {
    if (line_add(samples, (size_t)count) < (size_t)count) { end(1); return; }
    count = 0;
  }
  if (count < 0) rest(errno == EACCES ? "The browser refused the microphone." : errno == ENODEV ? "No microphone is available." : strerror(errno));
}

static void pressed(const dolly_buttons_event *event) {
  if (event->layout != (uint32_t)layout) return;
  if (state != RESTING) { end(event->button); return; }
  if (event->button >= pages[current].count) return;
  const struct key *key = &pages[current].keys[event->button];
  note[0] = 0;
  if (key->action == PASTE) {
    if (event->status) { rest(event->status == E2BIG ? "The clipboard holds too much." : "The browser did not let the clipboard be read."); return; }
    size_t length = event->length;
    while (length && isspace((unsigned char)event->text[length - 1])) --length;
    type(event->text, length);
  }
  type(key->text, key->length);
  current = key->page;
  if (key->action == SPEAK || key->action == WORD) listen(key->action);
  else show();
}

int main(int argc, char **argv) {
  if (argc < 2 || !read_menu(argv[1])) { fprintf(stderr, "usage: voice MENU [MODEL]\n"); return 2; }
  if (dolly_buttons_open(&buttons) != 0) { perror("voice: the buttons"); return 1; }
  // Ctrl+C is for the program that has the terminal; it reaches every program its shell started.
  signal(SIGINT, SIG_IGN);
  rest("Loading the speech model.");
  const transcribe_status status = hearing_open(argc > 2 ? argv[2] : "/usr/share/dolly/speech/parakeet-tdt_ctc-110m.gguf", 4);
  rest(status == TRANSCRIBE_OK ? "" : "The speech model did not load.");
  for (;; usleep(20000)) {
    dolly_buttons_event event;
    while (dolly_buttons_read(&buttons, &event) == 1) pressed(&event);
    if (state == ASKING || state == LISTENING) capture();
    if (state != RESTING) heard();
  }
}
