#include <dolly/runtime.h>
#include <dolly/display.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>

int main(int argc, char **argv) {
  if (argc > 1 && strcmp(argv[1], "lease") == 0) {
    dolly_display_surface surface;
    if (dolly_display_acquire(&surface) != 0) return 7;
    sleep(1);
    const unsigned types[] = {DOLLY_INPUT_EVENT_POINTER, DOLLY_INPUT_EVENT_POINTER,
                              DOLLY_INPUT_EVENT_POINTER, DOLLY_INPUT_EVENT_SCROLL};
    int status = 0;
    for (size_t i = 0; i < sizeof(types) / sizeof(types[0]); ++i) {
      dolly_input_event event;
      if (dolly_display_next_event(surface.generation, &event, 1000) != 1 ||
          event.type != types[i]) { status = 8; break; }
    }
    if (dolly_display_release(surface.generation) != 0) status = 9;
    return status;
  }
  const int mode = dolly_terminal_mode_get(STDIN_FILENO);
  if (mode < 0 || dolly_terminal_mode_set(STDIN_FILENO, 0) != 0) return 1;
  const int query = argc > 1 && strcmp(argv[1], "query") == 0;
  const int partial = argc > 1 && strcmp(argv[1], "partial") == 0;
  fputs("\033[?2004lDOLLY-UI-PREFIX\n", stdout);
  if (query) fputs("\033[6n", stdout);
  fflush(stdout);
  int status = 0;
  if (partial) {
    if (dolly_terminal_read_raw_timeout(5000) != 't') status = 6;
    puts("DOLLY-UI-PRIMED");
    fflush(stdout);
  }
  sleep(8);
  if (query) {
    char response[64];
    size_t length = 0;
    do {
      int byte = dolly_terminal_read_raw_timeout(1000);
      if (byte < 0 || length == sizeof(response) - 1) { status = 2; break; }
      response[length++] = (char)byte;
    } while (response[length - 1] != 'R');
    response[length] = 0;
    unsigned row, column;
    if (!status && sscanf(response, "\033[%u;%uR", &row, &column) != 2) status = 3;
  }
  const char expected[] = "typedPASTED";
  for (size_t i = partial ? 1 : 0; !status && i < strlen(expected); ++i) {
    if (dolly_terminal_read_raw_timeout(1000) != expected[i]) status = 4;
  }
  if (dolly_terminal_mode_set(STDIN_FILENO, (unsigned)mode) != 0) status = 5;
  puts("DOLLY-UI-DONE");
  return status;
}
