#define _GNU_SOURCE

#include <dolly/dso.h>
#include <dolly/host.h>
#include <dolly/process.h>

#include <dlfcn.h>
#include <errno.h>
#include <fcntl.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

/* The loader's client, linked into a host of loadable modules: cc -rdynamic
 * exports __dolly_dso_allocate, which selects this object and its record. */
DOLLY_HOST_REQUIRE(dso, 0, DOLLY_DSO_ABI_DIGEST);
_Static_assert(sizeof(dolly_dso_open_request) == 16, "DSO open packet");
_Static_assert(sizeof(dolly_dso_symbol_request) == 16, "DSO symbol packet");
_Static_assert(sizeof(dolly_dso_close_request) == 8, "DSO close packet");
_Static_assert(sizeof(dolly_dso_response) == 16 + DOLLY_DSO_ERROR_CAPACITY, "DSO response packet");

static _Thread_local char dso_error[DOLLY_DSO_ERROR_CAPACITY + 1];
static _Thread_local int dso_error_pending;

static void clear_dso_error(void) {
  dso_error[0] = 0;
  dso_error_pending = 0;
}

static void set_dso_error(const dolly_dso_response *response,
                          int fallback) {
  size_t size = response == NULL ? 0 : response->message_size;
  if (size > DOLLY_DSO_ERROR_CAPACITY) size = 0;
  if (size != 0) memcpy(dso_error, response->message, size);
  if (size == 0) {
    const char *message = strerror(fallback > 0 ? fallback : ENOEXEC);
    size = strlen(message);
    if (size > DOLLY_DSO_ERROR_CAPACITY) {
      size = DOLLY_DSO_ERROR_CAPACITY;
    }
    memcpy(dso_error, message, size);
  }
  dso_error[size] = 0;
  dso_error_pending = 1;
}

static int decode_dso_response(int64_t result,
                               dolly_dso_response *response) {
  if (result < 0) {
    set_dso_error(NULL, (int)-result);
    return -1;
  }
  if ((uint64_t)result != sizeof(*response) ||
      response->message_size > DOLLY_DSO_ERROR_CAPACITY) {
    set_dso_error(NULL, EIO);
    return -1;
  }
  if (response->error != 0) {
    set_dso_error(response, response->error);
    errno = response->error;
    return -1;
  }
  return 0;
}

__attribute__((used, visibility("default")))
uintptr_t __dolly_dso_allocate(uint64_t size, uint64_t alignment) {
  if (size > SIZE_MAX || alignment > SIZE_MAX || alignment == 0 ||
      (alignment & (alignment - 1)) != 0) return 0;
  size_t native_alignment = (size_t)alignment;
  if (native_alignment < sizeof(void *)) native_alignment = sizeof(void *);
  void *allocation = NULL;
  const size_t native_size = size == 0 ? 1 : (size_t)size;
  if (posix_memalign(&allocation, native_alignment, native_size) != 0) return 0;
  memset(allocation, 0, native_size);
  return (uintptr_t)allocation;
}

void *dolly_dlopen(const char *path, int flags) {
  clear_dso_error();
  int known_flags = RTLD_LAZY | RTLD_NOW | RTLD_LOCAL | RTLD_GLOBAL;
#ifdef RTLD_NODELETE
  known_flags |= RTLD_NODELETE;
#endif
  if ((flags & ~known_flags) != 0 ||
      ((flags & RTLD_LAZY) != 0 && (flags & RTLD_NOW) != 0)) {
    set_dso_error(NULL, EINVAL);
    errno = EINVAL;
    return NULL;
  }

  unsigned char *packet = NULL;
  size_t packet_size = sizeof(dolly_dso_open_request);
  uint64_t image_size = 0;
  int descriptor = -1;
  if (path != NULL) {
    descriptor = open(path, O_RDONLY);
    struct stat metadata;
    if (descriptor < 0 || fstat(descriptor, &metadata) != 0 ||
        !S_ISREG(metadata.st_mode) || metadata.st_size <= 0 ||
        (uint64_t)metadata.st_size > DOLLY_DSO_LIMIT) {
      const int error = descriptor < 0 ? errno : ENOEXEC;
      if (descriptor >= 0) close(descriptor);
      set_dso_error(NULL, error);
      errno = error;
      return NULL;
    }
    image_size = (uint64_t)metadata.st_size;
    packet_size += (size_t)image_size;
  }
  packet = malloc(packet_size);
  if (packet == NULL) {
    if (descriptor >= 0) close(descriptor);
    set_dso_error(NULL, ENOMEM);
    return NULL;
  }
  const dolly_dso_open_request request = {
      (flags & RTLD_GLOBAL) != 0 ? DOLLY_DSO_GLOBAL : 0,
      0,
      image_size,
  };
  memcpy(packet, &request, sizeof(request));
  size_t offset = sizeof(request);
  while (offset < packet_size) {
    ssize_t count = read(descriptor, packet + offset, packet_size - offset);
    if (count < 0 && errno == EINTR) continue;
    if (count <= 0) {
      const int error = count == 0 ? EIO : errno;
      close(descriptor);
      free(packet);
      set_dso_error(NULL, error);
      errno = error;
      return NULL;
    }
    offset += (size_t)count;
  }
  if (descriptor >= 0) close(descriptor);
  dolly_dso_response response = {0};
  const int64_t result = dolly_process_call(
      DOLLY_DSO_OPEN, packet, packet_size,
      &response, sizeof(response));
  free(packet);
  if (decode_dso_response(result, &response) != 0 || response.value == 0) {
    if (!dso_error_pending) set_dso_error(NULL, ENOEXEC);
    return NULL;
  }
  return (void *)(uintptr_t)response.value;
}

void *dolly_dlsym(void *handle, const char *name) {
  clear_dso_error();
  if (name == NULL || name[0] == 0) {
    set_dso_error(NULL, EINVAL);
    errno = EINVAL;
    return NULL;
  }
  const size_t name_size = strlen(name);
  if (name_size > UINT32_MAX ||
      name_size > SIZE_MAX - sizeof(dolly_dso_symbol_request)) {
    set_dso_error(NULL, E2BIG);
    errno = E2BIG;
    return NULL;
  }
  const size_t packet_size = sizeof(dolly_dso_symbol_request) + name_size;
  unsigned char *packet = malloc(packet_size);
  if (packet == NULL) {
    set_dso_error(NULL, ENOMEM);
    return NULL;
  }
  const dolly_dso_symbol_request request = {
      (uint64_t)(uintptr_t)handle, (uint32_t)name_size, 0,
  };
  memcpy(packet, &request, sizeof(request));
  memcpy(packet + sizeof(request), name, name_size);
  dolly_dso_response response = {0};
  const int64_t result = dolly_process_call(
      DOLLY_DSO_SYMBOL, packet, packet_size,
      &response, sizeof(response));
  free(packet);
  if (decode_dso_response(result, &response) != 0 || response.value == 0) {
    if (!dso_error_pending) set_dso_error(NULL, ENOENT);
    return NULL;
  }
  return (void *)(uintptr_t)response.value;
}

char *dolly_dlerror(void) {
  if (!dso_error_pending) return NULL;
  dso_error_pending = 0;
  return dso_error;
}

int dolly_dlclose(void *handle) {
  clear_dso_error();
  if (handle == NULL) return 0;
  const dolly_dso_close_request request = {
      (uint64_t)(uintptr_t)handle,
  };
  dolly_dso_response response = {0};
  const int64_t result = dolly_process_call(
      DOLLY_DSO_CLOSE, &request, sizeof(request),
      &response, sizeof(response));
  return decode_dso_response(result, &response);
}
