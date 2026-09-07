#include <errno.h>
#include <stddef.h>
#include <stdatomic.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>
#include <emscripten/emscripten.h>

#include "process-kernel.h"
#include "upload.h"

// upload mailbox v0; layout and authority are defined in abi/dolly-upload-0.wat.
typedef struct {
  _Atomic uint32_t request, cancelled, completed, chunk, consumed;
  _Atomic uint32_t length, error, eof;
  _Atomic uint32_t enabled;
  unsigned char reserved[28];
  unsigned char data[65536];
} UploadMailbox;
_Static_assert(offsetof(UploadMailbox, data) == 64, "upload mailbox layout");
_Alignas(64) static UploadMailbox mailbox;
static int owner;
static int descriptor = -1;
static char *temporary;
static char *destination;
static size_t received;

EMSCRIPTEN_KEEPALIVE
uintptr_t dolly_upload_mailbox_address(void) { return (uintptr_t)&mailbox; }
EMSCRIPTEN_KEEPALIVE
uint32_t dolly_upload_mailbox_version(void) { return 0; }

void dolly_upload_cancel_process(int pid) {
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

int64_t dolly_upload_process_file(int pid, const char *path) {
  if (atomic_load(&mailbox.enabled) != 1) {
    dolly_upload_cancel_process(pid);
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
      dolly_upload_cancel_process(pid);
      return -ENOMEM;
    }
    descriptor = mkstemp(temporary);
    if (descriptor < 0) {
      const int status = -errno;
      dolly_upload_cancel_process(pid);
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
  dolly_upload_cancel_process(pid);
  return status;
}
