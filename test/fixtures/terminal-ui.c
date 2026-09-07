#include <dolly/runtime.h>
#include <dolly/display.h>
#include <stdio.h>
#include <fcntl.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/stat.h>
#include <termios.h>
#include <unistd.h>

static int check_discipline(void) {
  struct termios saved, mode, observed;
  if (tcgetattr(0, &saved) != 0) return 10;
  for (int fd = 0; fd < 3; ++fd) {
    struct stat metadata;
    if (!isatty(fd) || fstat(fd, &metadata) || !S_ISCHR(metadata.st_mode)) return 15;
  }
  int input_copy = dup(0), output_copy = dup(1), null_fd = open("/dev/null", O_RDONLY);
  if (input_copy < 0 || output_copy < 0 || null_fd < 0) return 16;
  struct winsize before = {0}, after = {0};
  int descriptor_status = ioctl(output_copy, TIOCGWINSZ, &before);
  descriptor_status |= dup2(null_fd, 0) < 0 || isatty(0) || isatty(null_fd);
  descriptor_status |= ioctl(output_copy, TIOCGWINSZ, &after);
  descriptor_status |= before.ws_row != after.ws_row || before.ws_col != after.ws_col;
  descriptor_status |= dup2(input_copy, 0) < 0;
  close(input_copy); close(output_copy); close(null_fd);
  if (descriptor_status) return 17;
  int status = 0;
  const unsigned flags[] = {0, OPOST, ONLCR, OPOST | ONLCR};
  for (unsigned i = 0; i < sizeof(flags) / sizeof(flags[0]); ++i) {
    mode = saved;
    mode.c_lflag &= ~(ICANON | ECHO);
    mode.c_oflag = flags[i];
    if (tcsetattr(0, TCSANOW, &mode) || tcgetattr(0, &observed) ||
        observed.c_oflag != flags[i]) { status = 11; break; }
    fputs("\033[2J\033[HAB\nZ\033[6n", stdout);
    fflush(stdout);
    char response[64];
    size_t length = 0;
    int byte;
    do {
      byte = dolly_terminal_read_raw_timeout(1000);
      if (byte < 0 || length == sizeof(response) - 1) { status = 12; break; }
      response[length++] = (char)byte;
    } while (byte != 'R');
    response[length] = 0;
    unsigned row, column;
    unsigned expected = flags[i] == (OPOST | ONLCR) ? 2 : 4;
    if (status || sscanf(response, "\033[%u;%uR", &row, &column) != 2 ||
        row != 2 || column != expected) { status = 13; break; }
  }
  if (tcsetattr(0, TCSANOW, &saved) != 0) return 14;
  return status;
}

int main(int argc, char **argv) {
  if (argc > 1 && strcmp(argv[1], "discipline") == 0) return check_discipline();
  if (argc > 1 && strcmp(argv[1], "keys") == 0) {
    const int saved = dolly_terminal_mode_get(0);
    if (saved < 0 || dolly_terminal_mode_set(0, 0) != 0) return 1;
    fputs("\033[>1uDOLLY-KEYS-READY\r\n", stdout);
    fflush(stdout);
    int status = 0;
    const char expected[] = ":A?_\033[27u";
    for (size_t i = 0; i < sizeof(expected) - 1; ++i) {
      if (dolly_terminal_read_raw_timeout(5000) != expected[i]) {
        status = 2;
        break;
      }
    }
    fputs("\033[<u", stdout);
    fflush(stdout);
    if (dolly_terminal_mode_set(0, (unsigned)saved) != 0) status = 3;
    return status;
  }
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
