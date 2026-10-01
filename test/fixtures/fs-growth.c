// fs-growth append|size PATH MIB grows PATH to MIB mebibytes by appending, or
// by sizing it first and writing in place, then checks its last byte. A write
// the filesystem refuses exits with its errno.
#define _POSIX_C_SOURCE 200809L
#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

enum { CHUNK = 64 << 20 };

int main(int argc, char **argv) {
  if (argc != 4) return 64;
  const int sized = strcmp(argv[1], "size") == 0;
  const off_t total = (off_t)strtoll(argv[3], NULL, 10) << 20;
  unsigned char *chunk = malloc(CHUNK);
  if (chunk == NULL) return 68;
  memset(chunk, 0xa5, CHUNK);
  const int descriptor = open(argv[2], O_RDWR | O_CREAT | O_TRUNC, 0644);
  if (descriptor < 0 || total <= 0) return 65;
  if (sized && ftruncate(descriptor, total) != 0) return errno;
  for (off_t offset = 0; offset < total;) {
    const size_t length = total - offset < CHUNK ? (size_t)(total - offset) : CHUNK;
    const ssize_t written = sized ? pwrite(descriptor, chunk, length, offset)
                                  : write(descriptor, chunk, length);
    if (written <= 0) {
      fprintf(stderr, "fs-growth: write at %lld: %s\n", (long long)offset, strerror(errno));
      return errno;
    }
    offset += written;
  }
  unsigned char last = 0;
  if (pread(descriptor, &last, 1, total - 1) != 1 || last != 0xa5) return 66;
  return close(descriptor) == 0 ? 0 : 67;
}
