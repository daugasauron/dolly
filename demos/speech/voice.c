// voice MENU [MODEL] -- PROGRAM [ARG...]: stands in for a keyboard where
// there is none. PROGRAM runs on a pseudo-terminal in all but the terminal's
// last rows, where voice shows what it hears; the buttons MENU names are the
// page's, below the terminal (touch@0). A press of one types what it says
// into PROGRAM's terminal, and while one of them listens, what the
// microphone hears. The keyboard still types, and a paste reaches PROGRAM as
// it would without voice. PROGRAM may ask the same of voice, one
// line each, on the pipe VOICE_CONTROL_FD names: "speak", "page NAME", or
// "type TEXT" (the menu's escapes); text it shows can ask nothing.
#define _GNU_SOURCE
#include <dolly/runtime.h>
#include <dolly/touch.h>
#include <errno.h>
#include <fcntl.h>
#include <poll.h>
#include <pthread.h>
#include <pty.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/ioctl.h>
#include <termios.h>
#include <unistd.h>
#include "hearing.h"

enum { PAGES = 8, KEYS = 12, LABEL = 24, CAPTION = 480, NAME = 32, TEXT = 256,
       WAIT = 0 /* the byte that stands for \w in a key's text */,
       CAPTION_ROWS = 2 };
enum action { TYPE, SPEAK, PAGE };
struct key {
  char label[LABEL], text[TEXT], target[NAME];
  size_t length;
  enum action action;
  int page;
};
static struct page {
  char name[NAME], caption[CAPTION];
  struct key keys[KEYS];
  int count;
} pages[PAGES];
static int page_count, current;

static dolly_microphone microphone;
// The model loads on a thread of its own while the program starts.
static const char *model_path;
static transcribe_status loaded = TRANSCRIBE_ERR_OOM;
static _Atomic int loading = 1;
static enum { RESTING, ASKING, LISTENING, ENDING } state;
static int sending; // Enter after what was said
static char said[sizeof(line.text)], note[CAPTION];
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
// text may stand ":speak" or ":page NAME". The menu's own comment says what
// they do. False names the line at fault.
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
    if (!page_count || !equals || equals - start >= LABEL || pages[page_count - 1].count == KEYS) {
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
    else if (!strncmp(action, ":page ", 6)) { key->action = PAGE; snprintf(key->target, sizeof(key->target), "%s", action + 6); }
    else { fprintf(stderr, "voice: %s:%d: %s is not an action\n", path, number, action); return 0; }
  }
  fclose(file);
  for (int at = 0; at < page_count; ++at) {
    for (int index = 0; index < pages[at].count; ++index) {
      struct key *key = &pages[at].keys[index];
      if (!*key->target) { key->page = at; continue; }
      for (key->page = 0; key->page < page_count && strcmp(pages[key->page].name, key->target); ++key->page) {}
      if (key->page == page_count) { fprintf(stderr, "voice: %s: no page %s\n", path, key->target); return 0; }
    }
  }
  return page_count > 0;
}

// The terminal and the program's part of it: the CAPTION_ROWS below `top` are voice's.
static int master = -1, program = -1;
// The read end of PROGRAM's pipe to voice, and its lines not yet obeyed.
static int control = -1;
static char orders[1024];
static size_t ordered;
static struct termios cooked;
static unsigned rows, columns, top;
// The touch lease the page's buttons are voice's under, and which buttons it
// shows: a page's, or (-1) the three ways to end listening.
static uint64_t lease;
static int shown = -2;
static const char *const ends[] = {"Send", "Done", "Cancel"};

static void out(const char *bytes, size_t length) {
  while (length) {
    const ssize_t written = write(1, bytes, length);
    if (written < 0 && errno == EINTR) continue;
    if (written <= 0) return;
    bytes += written;
    length -= (size_t)written;
  }
}

// The buttons of the page or of listening, given to the page when they change.
static void show_buttons(void) {
  const int buttons = state == RESTING ? current : -1;
  if (!lease || buttons == shown) return;
  const char *labels[KEYS];
  const int count = buttons < 0 ? 3 : pages[buttons].count;
  for (int index = 0; index < count; ++index) labels[index] = buttons < 0 ? ends[index] : pages[buttons].keys[index].label;
  if (dolly_touch_buttons(lease, labels, (size_t)count) == 0) shown = buttons;
}

// The caption's rows: the start of the note or the page's caption, or the end
// of what is being heard, each row a terminal row's characters.
static void caption(char rows_text[CAPTION_ROWS][CAPTION + 8]) {
  const char *text = state == RESTING ? (*note ? note : pages[current].caption)
      : *said ? said : state == ASKING ? "Allow the microphone." : "Listening.";
  // Room for " ..." after the last row.
  const size_t room = columns > 6 ? columns - 5 : 1, length = strlen(text);
  size_t characters = 0, at;
  for (at = 0; at < length; ++at) characters += (text[at] & 0xc0) != 0x80;
  // While it is heard, the rows hold its end.
  at = 0;
  for (size_t skip = state == RESTING || characters <= room * CAPTION_ROWS ? 0 : characters - room * CAPTION_ROWS; skip; ++at)
    if ((text[at + 1] & 0xc0) != 0x80) --skip;
  for (int row = 0; row < CAPTION_ROWS; ++row) {
    size_t start = at, count = 0;
    while (at < length && (count < room || (text[at] & 0xc0) == 0x80)) count += (text[at++] & 0xc0) != 0x80;
    snprintf(rows_text[row], CAPTION + 8, "%.*s%s", (int)(at - start), text + start,
             row == CAPTION_ROWS - 1 && state == ENDING ? " ..." : "");
  }
}

// voice's rows, drawn over whatever the program left there; the cursor, its
// attributes and the scroll region that keeps the program above them stay
// the program's.
static void draw(void) {
  show_buttons();
  if (!rows) return;
  char text[CAPTION_ROWS][CAPTION + 8];
  caption(text);
  char *frame = NULL;
  size_t size = 0;
  FILE *bytes = open_memstream(&frame, &size);
  fprintf(bytes, "\0337\033[1;%ur", top);
  for (int row = 0; row < CAPTION_ROWS; ++row)
    fprintf(bytes, "\033[%u;1H\033[0;2m%s\033[0m\033[K", top + 1 + row, text[row]);
  fputs("\033[0m\0338", bytes);
  fclose(bytes);
  out(frame, size);
  free(frame);
}

// The terminal's size, and the program's: all of it but voice's rows.
static void measure(void) {
  struct winsize size;
  if (ioctl(1, TIOCGWINSZ, &size) != 0 || (size.ws_row == rows && size.ws_col == columns)) return;
  rows = size.ws_row;
  columns = size.ws_col;
  top = rows > CAPTION_ROWS + 1 ? rows - CAPTION_ROWS : 1;
  const struct winsize part = {(unsigned short)top, (unsigned short)columns, 0, 0};
  ioctl(master, TIOCSWINSZ, &part);
  draw();
}

// Where the program's output may be cut for voice's rows: not inside an
// escape sequence, a character or a synchronized update (DEC mode 2026).
static struct {
  enum { GROUND, ESCAPE, CSI, STRING, STRING_ESCAPE } state;
  char parameters[16];
  size_t length;
  int continuation, synchronized;
} parse;

static void follow_output(unsigned char byte) {
  switch (parse.state) {
    case GROUND:
      if (byte == 27) parse.state = ESCAPE;
      else if (byte >= 0xc0) parse.continuation = byte >= 0xf0 ? 3 : byte >= 0xe0 ? 2 : 1;
      else if (byte >= 0x80 && parse.continuation) --parse.continuation;
      break;
    case ESCAPE:
      parse.state = byte == '[' ? CSI : byte == ']' || byte == 'P' || byte == '_' || byte == '^' || byte == 'X' ? STRING
          : byte >= 0x20 && byte < 0x30 ? ESCAPE : GROUND;
      parse.length = 0;
      break;
    case CSI:
      if (byte >= 0x40 && byte <= 0x7e) {
        parse.parameters[parse.length] = 0;
        if (!strcmp(parse.parameters, "?2026")) parse.synchronized = byte == 'h' ? 1 : byte == 'l' ? 0 : parse.synchronized;
        parse.state = GROUND;
      } else if (parse.length + 1 < sizeof(parse.parameters)) {
        parse.parameters[parse.length++] = (char)byte;
      }
      break;
    case STRING:
      if (byte == 7) parse.state = GROUND;
      else if (byte == 27) parse.state = STRING_ESCAPE;
      break;
    case STRING_ESCAPE:
      parse.state = byte == '\\' ? GROUND : STRING;
      break;
  }
}

static int between(void) { return parse.state == GROUND && !parse.continuation && !parse.synchronized; }

// The program's output to the terminal, and the keyboard's input to it;
// voice's rows again after output, once the output can be cut. Waits up to
// `milliseconds` for either. Returns 0 once the program has closed its terminal.
static int pump(int milliseconds) {
  struct pollfd ready[3] = {{master, POLLIN, 0}, {0, POLLIN, 0}, {control, POLLIN, 0}};
  if (poll(ready, 3, milliseconds) < 0 && errno != EINTR) return 1;
  int wrote = 0;
  if (ready[2].revents) {
    const ssize_t count = read(control, orders + ordered, sizeof(orders) - ordered);
    if (count > 0) ordered += (size_t)count;
    // A closed pipe ends the orders, and so does a line longer than the buffer.
    if (count == 0 || ordered == sizeof(orders)) close(control), control = -1;
    if (ordered == sizeof(orders)) ordered = 0;
  }
  if (ready[0].revents) {
    unsigned char bytes[4096];
    const ssize_t count = read(master, bytes, sizeof(bytes));
    if (count <= 0 && !(count < 0 && (errno == EAGAIN || errno == EINTR))) return 0;
    for (ssize_t at = 0; at < count; ++at) follow_output(bytes[at]);
    if (count > 0) out((char *)bytes, (size_t)count), wrote = 1;
  }
  if (ready[1].revents & POLLIN) {
    char bytes[512];
    const ssize_t count = read(0, bytes, sizeof(bytes));
    if (count > 0) for (ssize_t at = 0; at < count;) {
      const ssize_t written = write(master, bytes + at, (size_t)(count - at));
      if (written > 0) at += written;
      else if (!pump(10)) return 0;
    }
  }
  static int pending;
  pending |= wrote;
  if (pending && between()) { pending = 0; draw(); }
  measure();
  return 1;
}

// Each run between waits in one write, as a keyboard's burst arrives: Pi
// reads a command and its Enter together.
static void type(const char *bytes, size_t length) {
  for (size_t at = 0; at < length;) {
    if (bytes[at] == WAIT) {
      for (int waited = 0; waited < 400; waited += 20) pump(20);
      ++at;
      continue;
    }
    size_t run = 0;
    while (at + run < length && bytes[at + run] != WAIT) ++run;
    const ssize_t written = write(master, bytes + at, run);
    if (written > 0) at += (size_t)written;
    else pump(10);
  }
}

static void rest(const char *why) {
  if (state == ASKING || state == LISTENING) dolly_microphone_close(&microphone);
  state = RESTING;
  snprintf(note, sizeof(note), "%s", why);
  draw();
}

static void listen(void) {
  if (loading) { rest("The speech model is still loading."); return; }
  if (loaded != TRANSCRIBE_OK) { rest("The speech model did not load."); return; }
  if (dolly_microphone_open(&microphone) != 0) { rest(strerror(errno)); return; }
  line_begin();
  said[0] = 0;
  state = ASKING;
  draw();
}

// Send, Done or Cancel; a full line ends as Done.
static void end(int button) {
  if (button == 2) { rest(""); return; }
  dolly_microphone_close(&microphone);
  line_end();
  sending = button == 0;
  state = ENDING;
  draw();
}

static void heard(void) {
  transcribe_status failed;
  const unsigned before = seen;
  const int ended = line_read(said, sizeof(said), &seen, &failed);
  if (failed != TRANSCRIBE_OK) { rest(transcribe_status_string(failed)); return; }
  if (state == ENDING && ended) {
    type(said, strlen(said));
    if (sending) type("\r", 1);
    else if (*said) type(" ", 1);
    rest(*said ? said : "Nothing was heard.");
  } else if (seen != before) draw();
}

static void capture(void) {
  static float samples[DOLLY_MICROPHONE_MAX_FRAMES / 3 + 1];
  dolly_microphone_status status;
  int count = dolly_microphone_get_status(&microphone, &status);
  if (count == 0 && state == ASKING && status.state == DOLLY_MICROPHONE_CAPTURING) { state = LISTENING; draw(); }
  while (count == 0 && (count = microphone_read_16_khz(&microphone, samples)) > 0) {
    if (line_add(samples, (size_t)count) < (size_t)count) { end(1); return; }
    count = 0;
  }
  if (count < 0) rest(errno == EACCES ? "The browser refused the microphone." : errno == ENODEV ? "No microphone is available." : strerror(errno));
}

static void pressed(int button) {
  if (state != RESTING) { end(button); return; }
  const struct key *key = &pages[current].keys[button];
  note[0] = 0;
  type(key->text, key->length);
  current = key->page;
  if (key->action == SPEAK) listen();
  else draw();
}

// PROGRAM's whole lines, each as a button that says the same would do. A
// line leaves the buffer before it is obeyed: typing reads the pipe again.
static void obey(void) {
  char *newline;
  while ((newline = memchr(orders, '\n', ordered))) {
    char line[sizeof(orders)];
    const size_t length = (size_t)(newline - orders);
    memcpy(line, orders, length);
    line[length] = 0;
    ordered -= length + 1;
    memmove(orders, newline + 1, ordered);
    if (!strcmp(line, "speak")) { if (state == RESTING) note[0] = 0, listen(); }
    else if (!strncmp(line, "page ", 5)) {
      for (int at = 0; at < page_count; ++at) if (!strcmp(pages[at].name, line + 5)) current = at, draw();
    } else if (!strncmp(line, "type ", 5)) {
      char text[TEXT];
      type(text, unescape(line + 5, line + length, text));
    }
  }
}

// The presses of the page's buttons. Those read after a press changed the
// buttons were of buttons no longer shown.
static void touched(void) {
  dolly_touch_record records[DOLLY_TOUCH_READ_RECORDS];
  const int count = dolly_touch_read(lease, records, DOLLY_TOUCH_READ_RECORDS, 0);
  const int buttons = shown;
  for (int index = 0; index < count && shown == buttons; ++index)
    if (records[index].phase == DOLLY_TOUCH_PRESS) pressed((int)records[index].id);
}

static void *load(void *unused) {
  (void)unused;
  loaded = hearing_open(model_path, 4);
  loading = 0;
  return NULL;
}

// The terminal as it was, voice's rows cleared, and the program's status.
static int leave(int status) {
  printf("\033[r\033[%u;1H\033[J", top + 1);
  fflush(stdout);
  tcsetattr(0, TCSANOW, &cooked);
  return status;
}

int main(int argc, char **argv) {
  int dashes = 1;
  while (dashes < argc && strcmp(argv[dashes], "--")) ++dashes;
  if (dashes < 2 || dashes > 3 || dashes + 1 >= argc || !read_menu(argv[1])) {
    fprintf(stderr, "usage: voice MENU [MODEL] -- PROGRAM [ARG...]\n");
    return 2;
  }
  model_path = dashes == 3 ? argv[2] : "/usr/share/dolly/speech/parakeet-tdt_ctc-110m.gguf";
  int slave;
  if (tcgetattr(0, &cooked) != 0 || openpty(&master, &slave, NULL, NULL, NULL) != 0) {
    perror("voice: a pseudo-terminal");
    return 1;
  }
  struct termios raw = cooked;
  cfmakeraw(&raw);
  tcsetattr(0, TCSANOW, &raw);
  fcntl(master, F_SETFL, fcntl(master, F_GETFL) | O_NONBLOCK);
  snprintf(note, sizeof(note), "Loading the speech model.");
  measure();
  int pipe_ends[2];
  if (pipe(pipe_ends) != 0) {
    perror("voice: a pipe");
    return leave(1);
  }
  control = pipe_ends[0];
  fcntl(control, F_SETFL, fcntl(control, F_GETFL) | O_NONBLOCK);
  setenv("VOICE_CONTROL_FD", "3", 1);
  const dolly_process_fd_mapping mappings[] = {{(uint32_t)slave, 0}, {(uint32_t)slave, 1}, {(uint32_t)slave, 2},
                                               {(uint32_t)pipe_ends[1], 3}};
  program = dolly_spawn_mapped(argv[dashes + 1], argc - dashes - 1, argv + dashes + 1, environ, NULL,
                               DOLLY_PROCESS_INHERIT_FDS_NONE, mappings, 4, -1);
  close(slave);
  close(pipe_ends[1]);
  // The program's Ctrl+C is the keyboard's byte 3, which its terminal makes SIGINT.
  signal(SIGINT, SIG_IGN);
  if (program < 0) {
    errno = -program;
    perror(argv[dashes + 1]);
    return leave(127);
  }
  if (dolly_touch_acquire(&lease) == 0) show_buttons();
  else {
    lease = 0;
    snprintf(note, sizeof(note), "No touchscreen: the keyboard types.");
  }
  pthread_t loader;
  pthread_create(&loader, NULL, load, NULL);
  int was_loading = 1;
  while (pump(20)) {
    if (was_loading && !loading) {
      was_loading = 0;
      if (state == RESTING) rest(loaded == TRANSCRIBE_OK ? "" : "The speech model did not load.");
    }
    if (lease) touched();
    obey();
    if (state == ASKING || state == LISTENING) capture();
    if (state != RESTING) heard();
  }
  int status = 1;
  dolly_wait(program, &status);
  return leave(status);
}
