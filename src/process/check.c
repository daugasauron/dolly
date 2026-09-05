#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

static unsigned invocation_count;
extern char **environ;

int main(int argc, char **argv) {
  ++invocation_count;
  if (invocation_count != 1) return 90;
  const char *program = argc > 0 ? strrchr(argv[0], '/') : NULL;
  program = program == NULL ? (argc > 0 ? argv[0] : NULL) : program + 1;
  if (argc != 2 || program == NULL || strcmp(program, "process-check") != 0 ||
      strcmp(argv[1], "fresh") != 0) return 91;
  const char *value = getenv("DOLLY_PROCESS_CHECK");
  if (value == NULL || strcmp(value, "private-memory") != 0) {
    int exact_entry = 0;
    fprintf(stderr, "process-check: getenv returned %s\n",
            value == NULL ? "<unset>" : value);
    for (char **entry = environ; entry != NULL && *entry != NULL; ++entry) {
      if (strncmp(*entry, "DOLLY_PROCESS_CHECK=", 20) == 0) {
        fprintf(stderr, "process-check: environment contains %s\n", *entry);
        if (strcmp(*entry, "DOLLY_PROCESS_CHECK=private-memory") == 0) {
          exact_entry = 1;
        }
      }
    }
    if (value == NULL) return exact_entry ? 95 : 92;
    return exact_entry ? 96 : 94;
  }
  if (write(STDOUT_FILENO, "PROCESS-PRIVATE-OK\n", 19) != 19) return 93;
  return 0;
}
