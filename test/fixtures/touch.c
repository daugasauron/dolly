#include <dolly/input.h>
#include <dolly/touch.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <termios.h>
#include <unistd.h>

static void check(int ok, const char *what) {
  if (ok) return;
  printf("TOUCH-FAILED %s\n", what);
  exit(1);
}

/* touch wheel | refuse | idle | busy | buttons | hold [input]. buttons shows
   One and Two, then Three alone after a press, prints each press's label and
   exits after the second. wheel asks for the
   mouse, as tmux does, and prints the first report it reads. busy is refused beside a
   foreground program, which idle is for three seconds. hold prints each finger's down and end
   and exits once two went down and every one has ended; with input it also
   holds the input lease, prints the presses and releases it reads, and exits after
   the pointer's release instead. */
int main(int argc, char **argv) {
  const char *mode = argc > 1 ? argv[1] : "";
  uint64_t touch = 0, input = 0;
  dolly_touch_record records[DOLLY_TOUCH_READ_RECORDS];
  if (!strcmp(mode, "wheel")) {
    struct termios saved, raw;
    check(tcgetattr(0, &saved) == 0, "the terminal's mode");
    raw = saved;
    raw.c_lflag &= ~(ICANON | ECHO);
    check(tcsetattr(0, TCSANOW, &raw) == 0, "raw mode");
    fputs("\033[?1000h\033[?1006hTOUCH-WHEEL-READY\r\n", stdout);
    fflush(stdout);
    char report[32];
    size_t length = 0;
    for (char byte = 0; byte != 'M' && byte != 'm'; byte = report[length++]) {
      check(length < sizeof(report) - 1 && read(0, &report[length], 1) == 1, "a report");
    }
    report[length] = 0;
    unsigned button, column, row;
    check(sscanf(report, "\033[<%u;%u;%u", &button, &column, &row) == 3, "an SGR report");
    fputs("\033[?1006l\033[?1000l", stdout);
    printf("TOUCH-WHEEL %u %u;%u\n", button, column, row);
    fflush(stdout);
    /* The rest of the drag is not the shell's input. */
    tcflush(0, TCIFLUSH);
    return tcsetattr(0, TCSANOW, &saved) != 0;
  }
  if (!strcmp(mode, "idle")) {
    sleep(3);
    return 0;
  }
  if (!strcmp(mode, "busy")) {
    /* A moment for the foreground program started after it. */
    sleep(1);
    check(dolly_touch_acquire(&touch) == -EPERM, "a process beside the foreground acquired");
    puts("TOUCH-BUSY");
    return 0;
  }
  check(dolly_touch_acquire(&touch) == 0, "acquire");
  if (!strcmp(mode, "refuse")) {
    uint64_t second;
    check(dolly_touch_acquire(&second) == -EBUSY, "a second acquire");
    check(dolly_touch_read(touch + 1, records, 4, 0) == -ESTALE, "a stale lease read");
    check(dolly_touch_read(touch, records, 0, 0) == -EINVAL, "a read of no records");
    check(dolly_touch_read(touch, records, 4, 0) == 0, "a read with no finger");
    char too_long[DOLLY_TOUCH_LABEL_SIZE + 1];
    memset(too_long, 'x', DOLLY_TOUCH_LABEL_SIZE);
    too_long[DOLLY_TOUCH_LABEL_SIZE] = 0;
    const char *const labels[] = {"One", "", too_long};
    check(dolly_touch_buttons(touch, labels + 1, 1) == -EINVAL, "an empty label");
    check(dolly_touch_buttons(touch, labels + 2, 1) == -EINVAL, "a label too long");
    check(dolly_touch_buttons(touch, labels, DOLLY_TOUCH_BUTTON_COUNT + 1) == -EINVAL, "too many labels");
    check(dolly_touch_buttons(touch + 1, labels, 1) == -ESTALE, "a stale lease's buttons");
    check(dolly_touch_release(touch) == 0, "release");
    check(dolly_touch_read(touch, records, 4, 0) == -ESTALE, "a read after release");
    check(dolly_touch_acquire(&second) == 0 && second > touch, "a new lease");
    puts("TOUCH_REFUSALS_OK");
    return 0;
  }
  if (!strcmp(mode, "buttons")) {
    const char *const pair[] = {"One", "Two"}, *const last[] = {"Three"};
    const char *const *shown = pair;
    check(dolly_touch_buttons(touch, pair, 2) == 0, "two buttons");
    for (;;) {
      const int count = dolly_touch_read(touch, records, DOLLY_TOUCH_READ_RECORDS, -1);
      check(count >= 0, "read");
      for (int index = 0; index < count; ++index) {
        if (records[index].phase != DOLLY_TOUCH_PRESS) continue;
        printf("TOUCH-PRESS %s\n", shown[records[index].id]);
        fflush(stdout);
        if (shown == last) return 0;
        check(dolly_touch_buttons(touch, last, 1) == 0, "one button");
        shown = last;
        /* The presses after it were of buttons gone. */
        break;
      }
    }
  }
  if (argc > 2) check(dolly_input_acquire(&input) == 0, "input");
  unsigned downs = 0, down = 0, moves = 0, dropped = 0, released = 0;
  while (input ? !released : downs < 2 || down) {
    const int count = dolly_touch_read(touch, records, DOLLY_TOUCH_READ_RECORDS, input ? 10 : -1);
    check(count >= 0, "read");
    for (int index = 0; index < count; ++index) {
      const dolly_touch_record *record = &records[index];
      dropped += record->dropped;
      if (record->phase == DOLLY_TOUCH_MOVE) {
        ++moves;
        continue;
      }
      static const char *const phases[] = {"", "DOWN", "MOVE", "UP", "CANCEL"};
      check(record->phase <= DOLLY_TOUCH_CANCEL && record->id != 0, "a record");
      if (record->phase == DOLLY_TOUCH_DOWN) ++downs, ++down;
      else --down;
      printf("TOUCH-%s %u %d %d %u\n", phases[record->phase], record->id, record->x, record->y, record->pressure);
    }
    dolly_input_event event;
    while (input && dolly_input_next_event(input, &event, 0) == 1) {
      if (event.type != DOLLY_INPUT_EVENT_POINTER || event.action == DOLLY_POINTER_ACTION_DRAG) continue;
      printf("POINTER %u %d %d\n", event.action, event.x, event.y);
      released = event.action == DOLLY_POINTER_ACTION_RELEASE;
    }
    fflush(stdout);
  }
  printf("TOUCH-END %u moves %u dropped\n", moves, dropped);
  return 0;
}
