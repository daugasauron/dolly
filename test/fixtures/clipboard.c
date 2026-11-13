#include <dolly/clipboard.h>
#include <dolly/input.h>
#include <errno.h>
#include <spawn.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/wait.h>
#include <termios.h>
#include <unistd.h>

extern char **environ;

static void check(int ok, const char *what) {
  if (ok) return;
  printf("CLIPBOARD-FAILED %s\n", what);
  exit(1);
}

/* clipboard refuse | busy | idle | nest | copy TEXT | unprompted TEXT. busy is
   refused beside a foreground program, which idle is for three seconds. nest
   writes, runs itself as nest-child, which takes the clipboard over and writes,
   and reads the child's text once it exited. copy holds the clipboard and the
   input lease, writes TEXT at Ctrl+C and prints the clipboard at Ctrl+V, then
   exits; it prints any text record it reads. Its Ctrl+C is a key, not the
   terminal's interrupt (ISIG off), as a window's on a desktop. unprompted writes TEXT eight
   seconds after it starts, with no key pressed. */
int main(int argc, char **argv) {
  const char *mode = argc > 1 ? argv[1] : "";
  uint64_t clipboard = 0;
  char text[64];
  if (!strcmp(mode, "idle")) {
    sleep(3);
    return 0;
  }
  if (!strcmp(mode, "busy")) {
    /* A moment for the foreground program started after it. */
    sleep(1);
    check(dolly_clipboard_acquire(&clipboard) == -EPERM, "a process beside the foreground acquired");
    puts("CLIPBOARD-BUSY");
    return 0;
  }
  check(dolly_clipboard_acquire(&clipboard) == 0, "acquire");
  if (!strcmp(mode, "refuse")) {
    uint64_t second;
    static char too_long[DOLLY_CLIPBOARD_CAPACITY + 1];
    check(dolly_clipboard_acquire(&second) == -EBUSY, "a second acquire");
    check(dolly_clipboard_write(clipboard + 1, "x", 1) == -ESTALE, "a stale lease's write");
    check(dolly_clipboard_write(clipboard, too_long, sizeof(too_long)) == -EFBIG, "a write too long");
    check(dolly_clipboard_write(clipboard, "REFUSE-TEXT", 11) == 0, "a write");
    check(dolly_clipboard_read(clipboard, text, 4) == 11 && !memcmp(text, "REFU", 4), "a read of four bytes");
    check(dolly_clipboard_release(clipboard) == 0, "release");
    check(dolly_clipboard_read(clipboard, text, sizeof(text)) == -ESTALE, "a read after release");
    check(dolly_clipboard_acquire(&second) == 0 && second > clipboard, "a new lease");
    check(dolly_clipboard_read(second, text, sizeof(text)) == 11, "the text outlives its writer's lease");
    puts("CLIPBOARD_REFUSALS_OK");
    return 0;
  }
  if (!strcmp(mode, "nest-child")) {
    check(dolly_clipboard_write(clipboard, "FROM-CHILD", 10) == 0, "the child's write");
    return 0;
  }
  if (!strcmp(mode, "nest")) {
    check(dolly_clipboard_write(clipboard, "FROM-PARENT", 11) == 0, "the parent's write");
    pid_t child;
    char *child_argv[] = {argv[0], "nest-child", NULL};
    int status;
    check(posix_spawn(&child, argv[0], NULL, NULL, child_argv, environ) == 0 &&
          waitpid(child, &status, 0) == child && WIFEXITED(status) && WEXITSTATUS(status) == 0, "the child");
    const int64_t length = dolly_clipboard_read(clipboard, text, sizeof(text));
    check(length == 10 && !memcmp(text, "FROM-CHILD", 10), "the child's text");
    puts("CLIPBOARD-NESTED-OK");
    return 0;
  }
  if (!strcmp(mode, "unprompted") && argc > 2) {
    sleep(8);
    check(dolly_clipboard_write(clipboard, argv[2], strlen(argv[2])) == 0, "a write");
    puts("CLIPBOARD-UNPROMPTED");
    return 0;
  }
  check(!strcmp(mode, "copy") && argc > 2, "usage: clipboard refuse|busy|idle|nest|copy TEXT|unprompted TEXT");
  uint64_t input;
  struct termios modes;
  check(tcgetattr(0, &modes) == 0, "the terminal's modes");
  modes.c_lflag &= ~ISIG;
  check(tcsetattr(0, TCSANOW, &modes) == 0, "ISIG off");
  check(dolly_input_acquire(&input) == 0, "the input lease");
  puts("CLIPBOARD-READY");
  fflush(stdout);
  for (;;) {
    dolly_input_event event;
    check(dolly_input_next_event(input, &event, -1) == 1, "an input record");
    if (event.type == DOLLY_INPUT_EVENT_TEXT) {
      printf("CLIPBOARD-TEXT %.*s\n", event.text_length, (const char *)event.data + event.key_length + event.code_length);
    }
    if (event.type != DOLLY_INPUT_EVENT_KEY || event.action != DOLLY_KEY_ACTION_PRESS ||
        !(event.modifiers & DOLLY_INPUT_MOD_CONTROL) || event.key_length != 1) continue;
    if (event.data[0] == 'c') {
      check(dolly_clipboard_write(clipboard, argv[2], strlen(argv[2])) == 0, "the copy");
      puts("CLIPBOARD-COPIED");
    } else if (event.data[0] == 'v') {
      const int64_t length = dolly_clipboard_read(clipboard, text, sizeof(text) - 1);
      check(length >= 0 && length < (int64_t)sizeof(text), "the paste");
      printf("CLIPBOARD-PASTE %.*s\n", (int)length, text);
      return 0;
    }
    fflush(stdout);
  }
}
