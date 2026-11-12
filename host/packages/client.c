#include <dolly/packages.h>
#include <dolly/process.h>
#include <dolly/host.h>
#include <errno.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

DOLLY_HOST_REQUIRE(packages, 0, DOLLY_PACKAGES_ABI_DIGEST);

int dolly_packages_fetch(uint32_t kind, const char *directory, const char *pin, const char *destination) {
  if (destination == NULL) return -EFAULT;
  // The kernel takes an absolute path: a relative one is the working directory's.
  char absolute[PATH_MAX + 1];
  if (*destination != '/') {
    if (getcwd(absolute, sizeof(absolute)) == NULL) return -errno;
    const size_t prefix = strlen(absolute);
    if (prefix + 1 + strlen(destination) > PATH_MAX) return -ENAMETOOLONG;
    snprintf(absolute + prefix, sizeof(absolute) - prefix, "%s%s", prefix > 1 ? "/" : "", destination);
    destination = absolute;
  }
  const size_t destination_size = strnlen(destination, PATH_MAX + 1u);
  const size_t directory_size = directory == NULL ? 0 : strnlen(directory, DOLLY_PACKAGES_DIRECTORY_CAPACITY + 1u);
  if (destination_size == 0) return -ENOENT;
  if (destination_size > PATH_MAX || directory_size > DOLLY_PACKAGES_DIRECTORY_CAPACITY) return -ENAMETOOLONG;
  dolly_packages_request request = {.kind = kind, .destination_size = (uint32_t)destination_size,
                                    .directory_size = (uint32_t)directory_size};
  if (pin != NULL) {
    if (strlen(pin) != DOLLY_PACKAGES_PIN_BYTES) return -EINVAL;
    memcpy(request.pin, pin, DOLLY_PACKAGES_PIN_BYTES);
  }
  const size_t packet_size = sizeof(request) + destination_size + directory_size;
  unsigned char *packet = malloc(packet_size);
  if (packet == NULL) return -ENOMEM;
  memcpy(packet, &request, sizeof(request));
  memcpy(packet + sizeof(request), destination, destination_size);
  if (directory_size != 0) memcpy(packet + sizeof(request) + destination_size, directory, directory_size);
  const int64_t result = dolly_process_call(DOLLY_PACKAGES_FETCH, packet, packet_size, NULL, 0);
  free(packet);
  return result < 0 ? (int)result : result == 0 ? 0 : -EIO;
}
