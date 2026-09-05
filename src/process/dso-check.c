#include <dolly/runtime.h>

#include <dlfcn.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>

int main(int argc, char **argv) {
  if (argc != 2) return 2;
  void *handle = dolly_dlopen(argv[1], RTLD_NOW | RTLD_LOCAL);
  if (handle == NULL) {
    const char *error = dolly_dlerror();
    fprintf(stderr, "process-dso-check: open failed: %s\n",
            error == NULL ? "unknown error" : error);
    return 60;
  }
  void *symbol = dolly_dlsym(handle, "dolly_process_dso_answer");
  if (symbol == NULL) {
    const char *error = dolly_dlerror();
    fprintf(stderr, "process-dso-check: symbol failed: %s\n",
            error == NULL ? "unknown error" : error);
    return 61;
  }
  int (*answer)(int) = NULL;
  _Static_assert(sizeof(answer) == sizeof(symbol), "function pointer representation");
  memcpy(&answer, &symbol, sizeof(answer));
  if (answer(41) != 42) return 62;
  if (dolly_dlclose(handle) != 0) return 63;
  return write(STDOUT_FILENO, "PROCESS-DSO-OK\n", 15) == 15 ? 0 : 64;
}
