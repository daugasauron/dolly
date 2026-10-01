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

#include <dolly/process.h>
#include <dolly/upload.h>

_Static_assert(offsetof(dolly_upload_mailbox, data) == 64, "upload mailbox layout");
_Alignas(64) static dolly_upload_mailbox mailbox;
static int owner;
static int descriptor = -1;
static char *temporary;
static char *destination;
static size_t received;

uintptr_t dolly_upload_mailbox_address(void) { return (uintptr_t)&mailbox; }
uint32_t dolly_upload_mailbox_version(void) { return 0; }

static void upload_cancel(int pid) {
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

static int64_t upload_file(int pid, const char *path) {
  if (atomic_load(&mailbox.enabled) != 1) {
    upload_cancel(pid);
    return -ENOSYS;
  }
  if (owner != 0 && owner != pid) return -EBUSY;
  if (owner == 0) {
    const uint32_t previous = atomic_load(&mailbox.request);
    if (previous != atomic_load(&mailbox.completed)) return -EBUSY;
    struct stat metadata;
    if (lstat(path, &metadata) == 0) return -EEXIST;
    if (errno != ENOENT) return -errno;
    owner = pid;
    destination = strdup(path);
    temporary = strdup("/tmp/dolly-upload-XXXXXX");
    if (destination == NULL || temporary == NULL) {
      upload_cancel(pid);
      return -ENOMEM;
    }
    descriptor = mkstemp(temporary);
    if (descriptor < 0) {
      const int status = -errno;
      upload_cancel(pid);
      return status;
    }
    atomic_store(&mailbox.consumed, atomic_load(&mailbox.chunk));
    atomic_store(&mailbox.cancelled, previous);
    atomic_store(&mailbox.request, previous + 1);
    return DOLLY_PROCESS_DISPATCH_DEFERRED;
  }
  if (strcmp(destination, path) != 0) return -EBUSY;
  const uint32_t chunk = atomic_load(&mailbox.chunk);
  if (chunk == atomic_load(&mailbox.consumed)) return DOLLY_PROCESS_DISPATCH_DEFERRED;
  const uint32_t length = atomic_load(&mailbox.length);
  const uint32_t eof = atomic_load(&mailbox.eof);
  int status = -(int)atomic_load(&mailbox.error);
  if (length > sizeof(mailbox.data) || length > 64u * 1024u * 1024u - received ||
      eof > 1 || (!eof && length == 0)) status = -EIO;
  size_t offset = 0;
  while (status == 0 && offset < length) {
    const ssize_t written = write(descriptor, mailbox.data + offset, length - offset);
    if (written < 0 && errno == EINTR) continue;
    if (written <= 0) { status = written == 0 ? -EIO : -errno; break; }
    offset += (size_t)written;
  }
  received += offset;
  atomic_store(&mailbox.consumed, chunk);
  if (!eof && status == 0) return DOLLY_PROCESS_DISPATCH_DEFERRED;
  if (status == 0) {
    if (close(descriptor) != 0) status = -errno;
    descriptor = -1;
    // Kernel filesystem calls are serialized: no yield between check and rename.
    // Recheck because another process may have created the path during selection.
    if (status == 0) {
      struct stat metadata;
      if (lstat(destination, &metadata) == 0) status = -EEXIST;
      else if (errno != ENOENT) status = -errno;
      else if (rename(temporary, destination) != 0) status = -errno;
    }
  }
  upload_cancel(pid);
  return status;
}

static int64_t upload_call(int pid, int tid, uint32_t operation, unsigned char *packet,
                           uintptr_t request_size, uintptr_t response_capacity) {
  char path[PATH_MAX + 1];
  const int64_t result = dolly_kernel_request_path(pid, request_size, path, sizeof(path));
  return result != 0 ? result : upload_file(pid, path);
}

static void upload_release(int pid, int tid) {
  if (tid == 0) upload_cancel(pid);
}

const dolly_kernel_module dolly_upload_kernel = {
    DOLLY_UPLOAD_FILE, DOLLY_UPLOAD_FILE, upload_call, upload_release};
