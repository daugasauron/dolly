#define _GNU_SOURCE
#include <assert.h>
#include <fcntl.h>
#include <stdlib.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <unistd.h>

static void check_size(int fd, off_t expected) {
  struct stat metadata;
  assert(fstat(fd, &metadata) == 0 && metadata.st_size == expected);
}

int main(void) {
  char path[] = "/tmp/dolly-mmap-bounds-XXXXXX";
  int fd = mkstemp(path);
  assert(fd >= 0 && write(fd, "A", 1) == 1);
  const size_t length = 65536;
  char *shared = mmap(NULL, length, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
  assert(shared != MAP_FAILED && shared[0] == 'A' && shared[127] == 0);
  shared[0] = 'B';
  shared[127] = 'X';
  assert(msync(shared, length, MS_SYNC) == 0);
  check_size(fd, 1);
  char value;
  assert(pread(fd, &value, 1, 0) == 1 && value == 'B');
  shared[0] = 'C';
  shared[127] = 'Y';
  assert(munmap(shared, length) == 0);
  check_size(fd, 1);
  assert(pread(fd, &value, 1, 0) == 1 && value == 'C');

  assert(ftruncate(fd, length + 1) == 0 && pwrite(fd, "D", 1, length) == 1);
  shared = mmap(NULL, length, PROT_READ | PROT_WRITE, MAP_SHARED, fd, length);
  assert(shared != MAP_FAILED && shared[0] == 'D' && close(fd) == 0);
  shared[0] = 'E';
  shared[127] = 'Z';
  assert(msync(shared, length, MS_SYNC) == 0);
  fd = open(path, O_RDWR);
  assert(fd >= 0);
  check_size(fd, length + 1);
  assert(pread(fd, &value, 1, length) == 1 && value == 'E');
  assert(ftruncate(fd, 1) == 0 && munmap(shared, length) == 0);
  check_size(fd, 1);

  shared = mmap(NULL, length, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
  assert(shared != MAP_FAILED);
  shared[0] = 'F';
  assert(ftruncate(fd, 0) == 0 && msync(shared, length, MS_SYNC) == 0);
  assert(munmap(shared, length) == 0);
  check_size(fd, 0);
  assert(close(fd) == 0 && unlink(path) == 0);
}
