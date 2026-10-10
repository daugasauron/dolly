#include <dolly/buttons.h>
#include <dolly/process.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

static dolly_buttons buttons;
static void check(int ok, const char *what) {
  if (!ok) { perror(what); exit(1); }
}
static void type(const char *text) {
  while (dolly_buttons_type(&buttons, text, (uint32_t)strlen(text)) != 0) {
    check(errno == EAGAIN, "typing");
    usleep(10000);
  }
}

/* What the client and the kernel refuse, and how layouts are numbered. */
static int refusals(void) {
  static dolly_buttons second;
  static const dolly_button many[DOLLY_BUTTONS_MAX + 1], invalid = {DOLLY_BUTTON_PRESS, "\xff"}, unknown = {7, "x"},
    one = {DOLLY_BUTTON_PRESS, "One"}, other = {DOLLY_BUTTON_PRESS, "Other"};
  static char caption[DOLLY_BUTTONS_CAPTION_BYTES + 2], bytes[DOLLY_BUTTONS_TYPE_BYTES + 1];
  dolly_buttons_event event;
  uint64_t scope = buttons.scope;
  check(dolly_buttons_open(&buttons) == -1 && errno == EBUSY && buttons.scope == scope, "reopening lost the lease");
  check(dolly_buttons_open(&second) == -1 && errno == EBUSY, "a second open");
  check(dolly_buttons_show(&buttons, NULL, many, DOLLY_BUTTONS_MAX + 1) == -1 && errno == EINVAL, "too many buttons");
  check(dolly_buttons_show(&buttons, NULL, &invalid, 1) == -1 && errno == EILSEQ, "a label that is not UTF-8");
  check(dolly_buttons_show(&buttons, NULL, &unknown, 1) == -1 && errno == EINVAL, "an unknown kind");
  memset(caption, 'c', sizeof(caption) - 1);
  check(dolly_buttons_show(&buttons, caption, NULL, 0) == -1 && errno == EINVAL, "a caption beyond the packet");
  check(dolly_buttons_read(&buttons, &event) == 0, "a read with nothing pressed");
  check(dolly_buttons_type(&buttons, bytes, sizeof(bytes)) == -1 && errno == EINVAL, "typing beyond the packet");
  int first = dolly_buttons_show(&buttons, "a", &one, 1);
  check(first > 0 && dolly_buttons_show(&buttons, "b", &one, 1) == first, "a caption began a layout");
  check(dolly_buttons_show(&buttons, "b", &other, 1) > first, "other buttons kept the layout");
  check(dolly_buttons_close(&buttons) == 0, "close");
  check(dolly_buttons_read(&buttons, &event) == -1 && errno == EBADF, "a read after close");
  check(dolly_process_call(DOLLY_BUTTONS_TYPE_OP, "x", 1, NULL, 0) == -EBADF, "typing without the buttons");
  check(dolly_buttons_open(&buttons) == 0 && buttons.scope > scope && dolly_buttons_close(&buttons) == 0, "reopen");
  puts("BUTTONS_REFUSALS_OK");
  return 0;
}

/* buttons refuse | busy | hold. hold types a shell command naming each press;
   "Stop" types Ctrl+C, "More" shows twelve buttons and their "Quit" exits. */
int main(int argc, char **argv) {
  const char *mode = argc > 1 ? argv[1] : "";
  if (!strcmp(mode, "busy")) {
    check(dolly_buttons_open(&buttons) == -1 && errno == EBUSY, "another process opened held buttons");
    check(dolly_process_call(DOLLY_BUTTONS_TYPE_OP, "x", 1, NULL, 0) == -EBADF, "another process typed");
    puts("BUTTONS_BUSY");
    return 0;
  }
  check(dolly_buttons_open(&buttons) == 0, "buttons open");
  if (!strcmp(mode, "refuse")) return refusals();
  static const dolly_button four[] = {{DOLLY_BUTTON_PRESS, "One"}, {DOLLY_BUTTON_PASTE, "ignored"},
    {DOLLY_BUTTON_PRESS, "Stop"}, {DOLLY_BUTTON_PRESS, "More"}};
  dolly_button twelve[DOLLY_BUTTONS_MAX] = {0};
  for (unsigned i = 0; i < DOLLY_BUTTONS_MAX; ++i) {
    twelve[i].kind = DOLLY_BUTTON_PRESS;
    snprintf(twelve[i].label, sizeof(twelve[i].label), i + 1 < DOLLY_BUTTONS_MAX ? "Key %u" : "Quit", i);
  }
  int layout = dolly_buttons_show(&buttons, "<b>Four</b> buttons", four, 4), more = 0;
  check(layout > 0, "buttons show");
  for (;;) {
    dolly_buttons_event event;
    char line[96];
    int got = dolly_buttons_read(&buttons, &event);
    check(got >= 0, "buttons read");
    if (!got) { usleep(20000); continue; }
    if ((int)event.layout != layout) continue;
    if (event.kind == DOLLY_BUTTON_PASTE) {
      if (event.status) snprintf(line, sizeof(line), "echo PASTE-REFUSED-%u\r", event.status);
      else snprintf(line, sizeof(line), "echo PASTED-%.*s\r", event.length < 64 ? (int)event.length : 64, event.text);
    } else if (more && event.button + 1 == DOLLY_BUTTONS_MAX) {
      return 0;
    } else if (!more && event.button == 2) {
      strcpy(line, "\x03");
    } else if (!more && event.button == 3) {
      more = 1;
      layout = dolly_buttons_show(&buttons, "Twelve buttons", twelve, DOLLY_BUTTONS_MAX);
      check(layout > 0, "twelve buttons");
      continue;
    } else {
      snprintf(line, sizeof(line), "echo PRESSED-%u\r", event.button);
      /* A new caption keeps the buttons and their layout. */
      if (!more) check(dolly_buttons_show(&buttons, "One was pressed", four, 4) == layout, "a caption began a layout");
    }
    type(line);
  }
}
