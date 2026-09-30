#include <errno.h>
#include <stddef.h>

char *emscripten_run_script_string(const char *script) {
  (void)script;
  errno = ENOTSUP;
  return NULL;
}
