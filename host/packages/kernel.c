// packages@0 kernel side: one request at a time, written into a temporary file
// chunk by chunk as the page answers and renamed to its destination at the end
// (dolly-packages-0.wat), as upload@0 writes a file the user picked.
#include <errno.h>
#include <limits.h>
#include <stddef.h>
#include <stdatomic.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

#include "process-kernel.h"

#include <emscripten/atomic.h>
#include <dolly/process.h>
#include <dolly/packages.h>

_Static_assert(
    offsetof(dolly_packages_mailbox, request) == 4 * DOLLY_PACKAGES_WORD_REQUEST &&
    offsetof(dolly_packages_mailbox, cancelled) == 4 * DOLLY_PACKAGES_WORD_CANCELLED &&
    offsetof(dolly_packages_mailbox, completed) == 4 * DOLLY_PACKAGES_WORD_COMPLETED &&
    offsetof(dolly_packages_mailbox, chunk) == 4 * DOLLY_PACKAGES_WORD_CHUNK &&
    offsetof(dolly_packages_mailbox, consumed) == 4 * DOLLY_PACKAGES_WORD_CONSUMED &&
    offsetof(dolly_packages_mailbox, length) == 4 * DOLLY_PACKAGES_WORD_LENGTH &&
    offsetof(dolly_packages_mailbox, error) == 4 * DOLLY_PACKAGES_WORD_ERROR &&
    offsetof(dolly_packages_mailbox, eof) == 4 * DOLLY_PACKAGES_WORD_EOF &&
    offsetof(dolly_packages_mailbox, enabled) == 4 * DOLLY_PACKAGES_WORD_ENABLED &&
    offsetof(dolly_packages_mailbox, size) == 4 * DOLLY_PACKAGES_WORD_SIZE &&
    offsetof(dolly_packages_mailbox, kind) == 4 * DOLLY_PACKAGES_WORD_KIND &&
    offsetof(dolly_packages_mailbox, directory_length) == 4 * DOLLY_PACKAGES_WORD_DIRECTORY_LENGTH &&
    offsetof(dolly_packages_mailbox, directory) == DOLLY_PACKAGES_DIRECTORY_OFFSET &&
    offsetof(dolly_packages_mailbox, pin) == DOLLY_PACKAGES_PIN_OFFSET &&
    offsetof(dolly_packages_mailbox, data) == DOLLY_PACKAGES_CHUNK_OFFSET,
    "packages mailbox layout differs from dolly-packages-0.wat");
_Alignas(64) static dolly_packages_mailbox mailbox;
static int owner;
static int descriptor = -1;
static char *temporary;
static char *destination;
static size_t received;

uintptr_t dolly_packages_mailbox_address(void) { return (uintptr_t)&mailbox; }

static void packages_cancel(int pid) {
  if (owner != pid || pid <= 0) return;
  atomic_store(&mailbox.cancelled, atomic_load(&mailbox.request));
  if (descriptor >= 0) close(descriptor);
  if (temporary != NULL) unlink(temporary);
  free(temporary);
  free(destination);
  temporary = destination = NULL;
  descriptor = -1;
  owner = 0;
  received = 0;
}

static int valid_pin(const char *pin) {
  for (size_t index = 0; index < DOLLY_PACKAGES_PIN_BYTES; ++index) {
    const char digit = pin[index];
    if (!((digit >= '0' && digit <= '9') || (digit >= 'a' && digit <= 'f'))) return 0;
  }
  return 1;
}

// A new request: its destination must not exist; the page learns its kind,
// directory and pin from the mailbox.
static int64_t packages_begin(int pid, const dolly_packages_request *request, const char *path, const char *directory) {
  const uint32_t previous = atomic_load(&mailbox.request);
  if (previous != atomic_load(&mailbox.completed)) return -EBUSY;
  struct stat metadata;
  if (lstat(path, &metadata) == 0) return -EEXIST;
  if (errno != ENOENT) return -errno;
  owner = pid;
  destination = strdup(path);
  temporary = strdup("/tmp/dolly-package-XXXXXX");
  if (destination == NULL || temporary == NULL) {
    packages_cancel(pid);
    return -ENOMEM;
  }
  descriptor = mkstemp(temporary);
  if (descriptor < 0) {
    const int status = -errno;
    packages_cancel(pid);
    return status;
  }
  atomic_store(&mailbox.kind, request->kind);
  memcpy(mailbox.directory, directory, request->directory_size);
  atomic_store(&mailbox.directory_length, request->directory_size);
  memcpy(mailbox.pin, request->pin, sizeof(mailbox.pin));
  atomic_store(&mailbox.consumed, atomic_load(&mailbox.chunk));
  atomic_store(&mailbox.cancelled, previous);
  atomic_store(&mailbox.request, previous + 1);
  return DOLLY_PROCESS_DISPATCH_DEFERRED;
}

static int64_t packages_fetch(int pid, const dolly_packages_request *request, const char *path, const char *directory) {
  if (atomic_load(&mailbox.enabled) != 1) {
    packages_cancel(pid);
    return -ENOSYS;
  }
  if (owner != 0 && owner != pid) return -EBUSY;
  if (owner == 0) return packages_begin(pid, request, path, directory);
  if (strcmp(destination, path) != 0) return -EBUSY;
  const uint32_t chunk = atomic_load(&mailbox.chunk);
  if (chunk == atomic_load(&mailbox.consumed)) return DOLLY_PROCESS_DISPATCH_DEFERRED;
  const uint32_t length = atomic_load(&mailbox.length);
  const uint32_t eof = atomic_load(&mailbox.eof);
  const uint32_t size = atomic_load(&mailbox.size);
  int status = -(int)atomic_load(&mailbox.error);
  if (length > sizeof(mailbox.data) || size > DOLLY_PACKAGES_MAX_SIZE || length > size - received ||
      eof > 1 || (!eof && length == 0) || (eof && status == 0 && received + length != size)) status = -EIO;
  // One allocation of the final size instead of repeated growth.
  if (status == 0 && received == 0 && ftruncate(descriptor, size) != 0) status = -errno;
  size_t offset = 0;
  while (status == 0 && offset < length) {
    const ssize_t written = write(descriptor, mailbox.data + offset, length - offset);
    if (written < 0 && errno == EINTR) continue;
    if (written <= 0) { status = written == 0 ? -EIO : -errno; break; }
    offset += (size_t)written;
  }
  received += offset;
  // The page awaits this word before it sends the next chunk.
  atomic_store(&mailbox.consumed, chunk);
  emscripten_atomic_notify((void *)&mailbox.consumed, EMSCRIPTEN_NOTIFY_ALL_WAITERS);
  if (!eof && status == 0) return DOLLY_PROCESS_DISPATCH_DEFERRED;
  if (status == 0) {
    if (close(descriptor) != 0) status = -errno;
    descriptor = -1;
    // Kernel filesystem calls are serialized: no yield between check and rename.
    if (status == 0) {
      struct stat metadata;
      if (lstat(destination, &metadata) == 0) status = -EEXIST;
      else if (errno != ENOENT) status = -errno;
      else if (rename(temporary, destination) != 0) status = -errno;
    }
  }
  packages_cancel(pid);
  return status;
}

static int64_t packages_call(int pid, int tid, uint32_t operation, unsigned char *packet,
                             uintptr_t request_size, uintptr_t response_capacity) {
  (void)tid;
  (void)operation;
  dolly_packages_request request;
  if (request_size < sizeof(request) || response_capacity != 0) return -EINVAL;
  memcpy(&request, packet, sizeof(request));
  if (request.reserved != 0 || request.destination_size == 0 || request.destination_size > PATH_MAX ||
      request.directory_size > DOLLY_PACKAGES_DIRECTORY_CAPACITY ||
      request_size != sizeof(request) + request.destination_size + request.directory_size) return -EINVAL;
  if (request.kind == DOLLY_PACKAGES_KIND_DIRECTORY ? request.directory_size != 0
      : request.kind == DOLLY_PACKAGES_KIND_INDEX ? request.directory_size == 0
      : request.kind != DOLLY_PACKAGES_KIND_SNAPSHOT || request.directory_size == 0 || !valid_pin(request.pin)) return -EINVAL;
  char path[PATH_MAX + 1], directory[DOLLY_PACKAGES_DIRECTORY_CAPACITY];
  memcpy(path, packet + sizeof(request), request.destination_size);
  path[request.destination_size] = '\0';
  memcpy(directory, packet + sizeof(request) + request.destination_size, request.directory_size);
  if (strlen(path) != request.destination_size || path[0] != '/' ||
      memchr(directory, '\0', request.directory_size) != NULL) return -EINVAL;
  return packages_fetch(pid, &request, path, directory);
}

static void packages_release(int pid, int tid) {
  if (tid == 0) packages_cancel(pid);
}

const dolly_kernel_module dolly_packages_kernel = {
    DOLLY_PACKAGES_FETCH, DOLLY_PACKAGES_FETCH, packages_call, packages_release};
