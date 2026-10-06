#include <errno.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <termios.h>
#include <time.h>
#include <unistd.h>
extern char **environ;
static volatile sig_atomic_t interrupts;
static void on_interrupt(int signal_number) { (void)signal_number; interrupts++; }
int main(int argc, char **argv) {
  char cwd[1024];
  setvbuf(stdout, NULL, _IONBF, 0);
  printf("PROBE-START pid=%d ppid=%d argc=%d argv0=%s\n", (int)getpid(), (int)getppid(), argc, argv[0]);
  printf("PROBE isatty=%d,%d,%d\n", isatty(0), isatty(1), isatty(2));
  struct winsize size = {0};
  const int sized = ioctl(1, TIOCGWINSZ, &size);
  printf("PROBE winsize=%d rows=%d cols=%d errno=%d\n", sized, size.ws_row, size.ws_col, sized ? errno : 0);
  printf("PROBE cwd=%s\n", getcwd(cwd, sizeof cwd) ? cwd : strerror(errno));
  struct termios mode;
  if (tcgetattr(0, &mode) == 0)
    printf("PROBE termios isig=%d icanon=%d echo=%d opost=%d\n", !!(mode.c_lflag & ISIG),
           !!(mode.c_lflag & ICANON), !!(mode.c_lflag & ECHO), !!(mode.c_oflag & OPOST));
  else printf("PROBE termios error=%s\n", strerror(errno));
  for (char **entry = environ; entry && *entry; entry++) printf("PROBE env %s\n", *entry);
  printf("PROBE workspace=%d home=%d\n", access("/workspace", F_OK), access("/home/dolly", F_OK));
  printf("PROBE-READY\n");
  for (;;) {
    unsigned char byte;
    const ssize_t count = read(0, &byte, 1);
    if (count == 0) { printf("PROBE eof\n"); return 0; }
    if (count < 0) { printf("PROBE read errno=%d (%s) interrupts=%d\n", errno, strerror(errno), (int)interrupts); if (errno != EINTR) return 9; continue; }
    if (byte == 'q') { printf("PROBE exit 0\n"); return 0; }
    if (byte == 'x') { printf("PROBE exit 3\n"); return 3; }
    if (byte == 'a') { printf("PROBE abort\n"); abort(); }
    if (byte == 't') { printf("PROBE trap\n"); __builtin_trap(); }
    if (byte == 'h') { signal(SIGINT, on_interrupt); printf("PROBE handler installed\n"); continue; }
    if (byte == 'i') { printf("PROBE interrupts=%d\n", (int)interrupts); continue; }
    if (byte == 'c') { printf("PROBE cpu-loop\n"); for (volatile unsigned long spin = 0;; spin++) {} }
    if (byte == 's') { printf("PROBE sleep\n"); const unsigned left = sleep(30); printf("PROBE slept left=%u interrupts=%d\n", left, (int)interrupts); continue; }
    printf("PROBE got 0x%02x\n", byte);
  }
}
