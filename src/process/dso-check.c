#include <dolly/runtime.h>

#include <dlfcn.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

int main(int argc, char **argv) {
  if (argc != 2 && argc != 3) return 2;
  void *handle = dolly_dlopen(argv[1], RTLD_NOW | RTLD_LOCAL);
  if (handle == NULL) {
    const char *error = dolly_dlerror();
    fprintf(stderr, "process-dso-check: open failed: %s\n",
            error == NULL ? "unknown error" : error);
    return 60;
  }
  void *symbol;
  if (argc == 3) {
    symbol = dolly_dlsym(handle, "dolly_process_dso_exit");
    if (symbol == NULL) return 68;
    void (*finish)(int);
    _Static_assert(sizeof(finish) == sizeof(symbol), "function pointer representation");
    memcpy(&finish, &symbol, sizeof(finish));
    finish(atoi(argv[2]));
    return 69;
  }
  symbol = dolly_dlsym(handle, "dolly_process_dso_answer");
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
  symbol = dolly_dlsym(handle, "\uFEFFdolly_process_dso_answer");
  if (symbol == NULL) return 65;
  memcpy(&answer, &symbol, sizeof(answer));
  if (answer(41) != 43) {
    fputs("process-dso-check: literal symbol name resolved to a different export\n", stderr);
    return 66;
  }
  if (dolly_dlsym(handle, "\uFEFF\uFEFFdolly_process_dso_answer") != NULL ||
      dolly_dlerror() == NULL) return 67;
  int *data = dolly_dlsym(handle, "dolly_process_dso_data");
  symbol = dolly_dlsym(handle, "dolly_process_dso_data_address");
  int *(*data_address)(void);
  memcpy(&data_address, &symbol, sizeof(data_address));
  if (data == NULL || symbol == NULL || data != data_address() || *data != 41) return 70;
  *data = 42;
  if (*data_address() != 42) return 71;
  if (dolly_dlclose(handle) != 0) return 63;
  return write(STDOUT_FILENO, "PROCESS-DSO-OK\n", 15) == 15 ? 0 : 64;
}
