// download@0 kernel side: stream one file to the page, which saves it only
// after the user clicks Save.
#include "process-kernel.h"

#include <dolly/download.h>
#include <dolly/process.h>
#include <emscripten/emscripten.h>
#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

DOLLY_BROWSER_IMPORT(dolly_download_dispatch)
int dolly_download_dispatch(uint32_t operation, const unsigned char *bytes, uintptr_t length);

// The one open stream: its process, source path and descriptor.
static int owner;
static char *source;
static int descriptor = -1;
static unsigned char chunk[DOLLY_DOWNLOAD_CHUNK_CAPACITY];

static int download_end(uint32_t operation) {
  const int status = dolly_download_dispatch(operation, NULL, 0);
  close(descriptor);
  free(source);
  source = NULL;
  descriptor = -1;
  owner = 0;
  return status;
}

static int download_open(int pid, const char *path) {
  const char *name = strrchr(path, '/');
  name = name == NULL ? path : name + 1;
  const size_t name_length = strlen(name);
  if (name_length == 0 || name_length > 255 || strcmp(name, ".") == 0 ||
      strcmp(name, "..") == 0) return -EINVAL;
  const int file = open(path, O_RDONLY);
  if (file < 0) return -errno;
  struct stat metadata;
  int status = fstat(file, &metadata) != 0 ? -errno
      : !S_ISREG(metadata.st_mode) ? -EINVAL
      : (uint64_t)metadata.st_size > DOLLY_DOWNLOAD_MAX_SIZE ? -EFBIG : 0;
  char *copy = status == 0 ? strdup(path) : NULL;
  if (status == 0 && copy == NULL) status = -ENOMEM;
  if (status == 0) {
    status = dolly_download_dispatch(DOLLY_DOWNLOAD_OPEN, (const unsigned char *)name, name_length);
  }
  if (status != 0) {
    free(copy);
    close(file);
    return status;
  }
  owner = pid;
  source = copy;
  descriptor = file;
  return 0;
}

// Sends one chunk per call; the supervisor retries the deferred call each
// scheduling turn, so the browser copies at most one chunk at a time.
static int64_t download_file(int pid, const char *path) {
  if (owner != 0 && owner != pid) return DOLLY_PROCESS_DISPATCH_DEFERRED;
  if (owner == 0) {
    const int status = download_open(pid, path);
    if (status != 0) return status;
  } else if (strcmp(source, path) != 0) {
    return -EBUSY;
  }
  const ssize_t count = read(descriptor, chunk, sizeof(chunk));
  if (count == 0) return download_end(DOLLY_DOWNLOAD_CLOSE);
  const int status = count < 0 ? -errno
      : dolly_download_dispatch(DOLLY_DOWNLOAD_WRITE, chunk, (uintptr_t)count);
  if (status == 0) return DOLLY_PROCESS_DISPATCH_DEFERRED;
  download_end(DOLLY_DOWNLOAD_ABORT);
  return status;
}

static int64_t download_call(int pid, int tid, uint32_t operation, unsigned char *mailbox,
                             uintptr_t request_size, uintptr_t response_capacity) {
  char path[PATH_MAX + 1];
  const int64_t result = dolly_kernel_request_path(pid, request_size, path, sizeof(path));
  return result != 0 ? result : download_file(pid, path);
}

static void download_release(int pid, int tid) {
  if (tid == 0 && owner == pid) download_end(DOLLY_DOWNLOAD_ABORT);
}

const dolly_kernel_module dolly_download_kernel = {
    DOLLY_DOWNLOAD_FILE, DOLLY_DOWNLOAD_FILE, download_call, download_release};
