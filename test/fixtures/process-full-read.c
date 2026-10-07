// A read of a regular file fills the request up to end of file, as on Linux,
// although the process gate moves at most 1 MiB a packet: one read of 16 MiB
// returns a 3,424,516-byte file whole, pread crosses the megabyte boundary,
// readv gathers past it, one write lands whole, and a pipe still returns what
// is there. Builds and passes on Linux unchanged.
#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/uio.h>
#include <unistd.h>

#define CHECK(condition) do { if (!(condition)) { \
  fprintf(stderr, "FULL-READ FAIL line %d: %s (errno %d)\n", __LINE__, #condition, errno); \
  exit(1); \
} } while (0)

enum { FILE_SIZE = 3424516, MEGABYTE = 1024 * 1024, REQUEST = 16 * MEGABYTE, WINDOW = 64 * 1024 };

int main(void) {
  unsigned char *bytes = malloc(FILE_SIZE);
  unsigned char *buffer = malloc(REQUEST);
  CHECK(bytes != NULL && buffer != NULL);
  for (size_t index = 0; index < FILE_SIZE; index++) bytes[index] = (unsigned char)(index * 7 + (index >> 10));

  char path[] = "/tmp/process-full-read-XXXXXX";
  const int fd = mkstemp(path);
  CHECK(fd >= 0);
  CHECK(write(fd, bytes, FILE_SIZE) == FILE_SIZE);
  CHECK(lseek(fd, 0, SEEK_SET) == 0);
  CHECK(read(fd, buffer, REQUEST) == FILE_SIZE);
  CHECK(memcmp(buffer, bytes, FILE_SIZE) == 0);
  CHECK(read(fd, buffer, REQUEST) == 0);

  memset(buffer, 0, WINDOW);
  CHECK(pread(fd, buffer, WINDOW, MEGABYTE - WINDOW / 2) == WINDOW);
  CHECK(memcmp(buffer, bytes + MEGABYTE - WINDOW / 2, WINDOW) == 0);

  const size_t first = MEGABYTE + 1234;
  struct iovec vectors[2] = {{buffer, first}, {buffer + first, REQUEST - first}};
  memset(buffer, 0, FILE_SIZE);
  CHECK(lseek(fd, 0, SEEK_SET) == 0);
  CHECK(readv(fd, vectors, 2) == FILE_SIZE);
  CHECK(memcmp(buffer, bytes, FILE_SIZE) == 0);
  CHECK(lseek(fd, 0, SEEK_CUR) == FILE_SIZE);
  CHECK(close(fd) == 0 && unlink(path) == 0);

  int fds[2];
  CHECK(pipe(fds) == 0);
  CHECK(write(fds[1], "pipe", 4) == 4);
  CHECK(read(fds[0], buffer, REQUEST) == 4);
  CHECK(memcmp(buffer, "pipe", 4) == 0);
  CHECK(close(fds[1]) == 0 && read(fds[0], buffer, REQUEST) == 0 && close(fds[0]) == 0);

  puts("FULL-READ-OK");
  return 0;
}
