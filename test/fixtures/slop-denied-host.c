// Native diagnostic only. Never linked into Dolly or used by browser tests.
#include <errno.h>
#include <dolly/runtime.h>
int dolly_spawn(const char *path, int argc, char **argv, int in, int out, int err) {
  return -ENOSYS;
}
int dolly_wait(int pid, int *status) { return -ENOSYS; }
uint32_t dolly_terminal_columns(void) { return 80; }
void dolly_terminal_publish_result(int status) {}
int dolly_terminal_read_raw_timeout(double timeout) { return -1; }
