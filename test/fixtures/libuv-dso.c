#include <uv.h>
#include <assert.h>
#include <dlfcn.h>
#include <stdio.h>
#include <string.h>

int main(void) {
  void *library = dlopen("./libuv.so", RTLD_NOW | RTLD_LOCAL);
  if (!library) { fprintf(stderr, "libuv DSO: %s\n", dlerror()); return 1; }
  void *symbol = dlsym(library, "uv_version");
  assert(symbol);
  unsigned (*version)(void);
  _Static_assert(sizeof(version) == sizeof(symbol), "function pointer representation");
  memcpy(&version, &symbol, sizeof(version));
  assert(version() == UV_VERSION_HEX);
  assert(dlclose(library) == 0);
  return 0;
}
