// download@0 kernel side: offer one file from the filesystem to the page,
// which saves it only after the user clicks Save.
#include "fs-record.h"
#include "process-kernel.h"

#include <dolly/download.h>
#include <dolly/process.h>
#include <emscripten/emscripten.h>
#include <errno.h>
#include <limits.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

// The trusted host registry supplies this typed import. The generated
// Emscripten binding fails closed if a host omits that step.
DOLLY_EM_JS(int, dolly_download_dispatch,
      (const unsigned char *name, uintptr_t name_length,
       const unsigned char *bytes, uintptr_t length), { return -ENOSYS; });

int dolly_download_file(const char *path) {
  if (path == NULL || path[0] == '\0') return -EINVAL;
  const char *name = strrchr(path, '/');
  name = name == NULL ? path : name + 1;
  const size_t name_length = strlen(name);
  if (name_length == 0 || name_length > 255 || strcmp(name, ".") == 0 ||
      strcmp(name, "..") == 0) return -EINVAL;
  unsigned char *contents;
  uintptr_t length;
  if (dolly_fs_read_file(path, 64 * 1024 * 1024, &contents, &length) != 0) return -errno;
  const int status = dolly_download_dispatch((const unsigned char *)name, name_length,
                                             contents, length);
  free(contents);
  return status;
}


static int64_t download_call(int pid, int tid, uint32_t operation, unsigned char *mailbox,
                             uintptr_t request_size, uintptr_t response_capacity) {
  char path[PATH_MAX + 1];
  const int64_t result = dolly_kernel_request_path(pid, request_size, path, sizeof(path));
  return result != 0 ? result : dolly_download_file(path);
}

const dolly_kernel_module dolly_download_kernel = {
    DOLLY_DOWNLOAD_FILE, DOLLY_DOWNLOAD_FILE, download_call, NULL};
