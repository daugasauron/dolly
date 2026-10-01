// Native diagnostic only. Never linked into Dolly or used by browser tests.
#include <errno.h>
#include <dolly/runtime.h>
int dolly_spawn_mapped(const char *path, int argc, char **argv,
                       char *const envp[], const char *cwd,
                       uint32_t descriptor_inheritance,
                       const dolly_process_fd_mapping *mappings,
                       uint32_t mapping_count, double timeout_milliseconds) {
  return -ENOSYS;
}
uint32_t dolly_terminal_columns(void) { return 80; }
void dolly_terminal_publish_result(int status) {}
int dolly_terminal_read_raw_timeout(double timeout) { return -1; }
int dolly_terminal_mode_get(int descriptor) { return -ENOTTY; }
int dolly_terminal_mode_set(int descriptor, uint32_t flags) { return -ENOTTY; }
int dolly_interrupt_poll(void) { return 0; }
