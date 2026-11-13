#include <dolly/download.h>
#include <dolly/host.h>
#include <dolly/runtime.h>
#include <errno.h>

DOLLY_HOST_REQUIRE(download, 0, DOLLY_DOWNLOAD_ABI_DIGEST);

int dolly_download_file(const char *path) {
  const int64_t result = dolly_path_call(DOLLY_DOWNLOAD_FILE, path, NULL, 0);
  return result < 0 ? (int)result : result == 0 ? 0 : -EIO;
}
