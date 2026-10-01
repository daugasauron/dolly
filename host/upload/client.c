#include <dolly/upload.h>
#include <dolly/process.h>
#include <dolly/host.h>
#include <errno.h>
#include <limits.h>
#include <stdlib.h>
#include <string.h>

DOLLY_HOST_REQUIRE(upload, 0, DOLLY_UPLOAD_ABI_DIGEST);

int dolly_upload_file(const char *path) {
  if (path == NULL) return -EFAULT;
  const size_t path_size = strnlen(path, PATH_MAX + 1u);
  if (path_size == 0) return -ENOENT;
  if (path_size > PATH_MAX) return -ENAMETOOLONG;
  const size_t packet_size = sizeof(dolly_process_path_request) + path_size;
  unsigned char *packet = malloc(packet_size);
  if (packet == NULL) return -ENOMEM;
  const dolly_process_path_request request = {
      .directory_descriptor = UINT32_MAX,
      .path_size = (uint32_t)path_size,
  };
  memcpy(packet, &request, sizeof(request));
  memcpy(packet + sizeof(request), path, path_size);
  const int64_t result = dolly_process_call(
      DOLLY_UPLOAD_FILE, packet, packet_size, NULL, 0);
  free(packet);
  return result < 0 ? (int)result : result == 0 ? 0 : -EIO;
}

