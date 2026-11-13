#include <dolly/upload.h>
#include <dolly/host.h>
#include <dolly/runtime.h>
#include <errno.h>

DOLLY_HOST_REQUIRE(upload, 0, DOLLY_UPLOAD_ABI_DIGEST);

int dolly_upload_file(const char *path) {
  const int64_t result = dolly_path_call(DOLLY_UPLOAD_FILE, path, NULL, 0);
  return result < 0 ? (int)result : result == 0 ? 0 : -EIO;
}
