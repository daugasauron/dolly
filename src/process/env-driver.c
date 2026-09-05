#include <dolly/runtime.h>

#include <stdlib.h>
#include <string.h>

extern char **environ;

int main(void) {
  if (setenv("DOLLY_PROCESS_CHECK", "private-memory", 1) != 0) return 100;

  int present = 0;
  for (char **entry = environ; entry != NULL && *entry != NULL; ++entry) {
    if (strcmp(*entry, "DOLLY_PROCESS_CHECK=private-memory") == 0) {
      present = 1;
      break;
    }
  }
  if (!present) return 101;

  char *arguments[] = {
      "/bin/process-check",
      "fresh",
      NULL,
  };
  const int pid = dolly_spawn(
      "/usr/libexec/dolly/process-bin/process-check", 2, arguments, 0, 1, 2);
  if (pid < 0) return 102;
  int status = 126;
  if (dolly_wait(pid, &status) != 0) return 103;
  if (status != 0) return status;

  char *environment[] = {
      "DOLLY_PROCESS_CHECK=private-memory",
      NULL,
  };
  const int timed_pid = dolly_spawn_env_timeout(
      "/usr/libexec/dolly/process-bin/process-check", 2, arguments, environment,
      0, 1, 2, 1000.0);
  if (timed_pid < 0) return 104;
  status = 126;
  return dolly_wait(timed_pid, &status) == 0 ? status : 105;
}
