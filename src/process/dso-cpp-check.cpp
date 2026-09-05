#include <dolly/runtime.h>

#include <dlfcn.h>
#include <stdio.h>

int main(int argc, char **argv) {
  if (argc != 2) return 2;
  void *handle = dolly_dlopen(
      argv[1], RTLD_NOW | RTLD_LOCAL);
  if (handle == nullptr) {
    fprintf(stderr, "process-cpp-dso-check: open failed: %s\n",
            dolly_dlerror());
    return 70;
  }
  void *symbol = dolly_dlsym(handle, "dolly_process_cpp_dso_answer");
  if (symbol == nullptr) {
    fprintf(stderr, "process-cpp-dso-check: symbol failed: %s\n",
            dolly_dlerror());
    return 71;
  }
  auto answer = reinterpret_cast<int (*)(void)>(symbol);
  if (answer() != 42) return 72;
  if (dolly_dlclose(handle) != 0) return 73;
  return 0;
}
