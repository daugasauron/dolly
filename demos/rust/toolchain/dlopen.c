#include <dolly/runtime.h>

void *__wrap_dlopen(const char *path, int flags) {
  return dolly_dlopen(path, flags);
}

void *__wrap_dlsym(void *handle, const char *name) {
  return dolly_dlsym(handle, name);
}

char *__wrap_dlerror(void) {
  return dolly_dlerror();
}

int __wrap_dlclose(void *handle) {
  return dolly_dlclose(handle);
}
