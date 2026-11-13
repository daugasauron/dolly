#include <assert.h>
#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <sys/mman.h>
#include <unistd.h>

int main(void) {
  const char *path = "/tmp/dolly-mmap-probe";
  int fd = open(path, O_CREAT | O_RDWR | O_TRUNC, 0600);
  assert(fd >= 0 && write(fd, "A", 1) == 1 && close(fd) == 0);
  void *copies[1024];
  for (size_t i = 0; i < 1024; ++i) {
    fd = open(path, O_RDONLY);
    assert(fd >= 0);
    copies[i] = mmap(NULL, 1, PROT_READ | PROT_WRITE, MAP_PRIVATE, fd, 0);
    if (copies[i] == MAP_FAILED) {
      printf("MMAP-FAILED index=%zu errno=%d\n", i, errno);
      return 1;
    }
    assert(close(fd) == 0 && *(char *)copies[i] == 'A');
    *(char *)copies[i] = 'P';
  }
  fd = open(path, O_RDWR);
  assert(fd >= 0);
  char *shared = mmap(NULL, 1, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
  assert(shared != MAP_FAILED && *shared == 'A' && close(fd) == 0);
  *shared = 'S';
  assert(msync(shared, 1, MS_SYNC) == 0 && munmap(shared, 1) == 0);
  for (size_t i = 0; i < 1024; ++i) {
    assert(*(char *)copies[i] == 'P' && munmap(copies[i], 1) == 0);
  }
  char result;
  fd = open(path, O_RDONLY);
  assert(fd >= 0 && read(fd, &result, 1) == 1 && result == 'S');
  assert(close(fd) == 0 && unlink(path) == 0);
  puts("MMAP-DESCRIPTORS-PASSED");
}
