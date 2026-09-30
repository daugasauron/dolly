// Native test host for Slop. Never linked into Dolly or used by browser tests.
// Children inherit every non-CLOEXEC descriptor, as with Dolly's
// DOLLY_PROCESS_INHERIT_FDS_ALL, and receive exactly the given environment.
#include <errno.h>
#include <spawn.h>
#include <dolly/runtime.h>
int dolly_spawn_mapped(const char *path, int argc, char **argv,
                       char *const envp[], const char *cwd,
                       uint32_t descriptor_inheritance,
                       const dolly_process_fd_mapping *mappings,
                       uint32_t mapping_count, double timeout_milliseconds) {
  if (cwd != NULL || descriptor_inheritance != DOLLY_PROCESS_INHERIT_FDS_ALL ||
      mapping_count != 0 || timeout_milliseconds >= 0) return -ENOSYS;
  pid_t pid;
  const int error = posix_spawn(&pid, path, NULL, NULL, argv, envp);
  return error != 0 ? -error : pid;
}
uint32_t dolly_terminal_columns(void) { return 80; }
void dolly_terminal_publish_result(int status) {}
int dolly_terminal_read_raw_timeout(double timeout) { return -1; }
