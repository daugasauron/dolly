#define _XOPEN_SOURCE 700
#include <dolly/runtime.h>
#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

enum { CHILDREN = 8, BYTES = 16384, LOOPS = 10000 };
static unsigned char bytes[BYTES];

static void fail(const char *operation, const char *path) {
  fprintf(stderr, "process %d: %s %s: %s\n", getpid(), operation, path, strerror(errno));
  exit(1);
}

static void publish(const char *temporary, const char *target) {
  int fd = open(temporary, O_WRONLY | O_CREAT | O_TRUNC, 0600);
  if (fd < 0) fail("open", temporary);
  if (write(fd, bytes, sizeof(bytes)) != sizeof(bytes)) fail("write", temporary);
  struct stat metadata;
  if (fstat(fd, &metadata)) fail("stat", temporary);
  if (metadata.st_size != sizeof(bytes)) {
    errno = EIO;
    fail("write executed more than once", temporary);
  }
  if (close(fd)) fail("close", temporary);
  if (rename(temporary, target)) fail("rename", temporary);
}

int main(int argc, char **argv) {
  if (argc == 1) {
    char executable[PATH_MAX];
    if (!realpath(argv[0], executable)) fail("realpath", argv[0]);
    if (mkdir("/tmp/process-io-stress", 0700)) fail("mkdir", "/tmp/process-io-stress");
    for (int n = 0; n < CHILDREN; ++n) {
      char path[80];
      snprintf(path, sizeof(path), "/tmp/process-io-stress/file-%d", n);
      publish("/tmp/process-io-stress/seed", path);
    }
    int pids[CHILDREN];
    for (int n = 0; n < CHILDREN; ++n) {
      char number[16];
      snprintf(number, sizeof(number), "%d", n);
      char *arguments[] = {argv[0], number, NULL};
      pids[n] = dolly_spawn(executable, 2, arguments, 0, 1, 2);
      if (pids[n] < 0) { errno = -pids[n]; fail("spawn", executable); }
    }
    int result = 0;
    for (int n = 0; n < CHILDREN; ++n) {
      int status;
      if (dolly_wait(pids[n], &status)) fail("wait", argv[0]);
      if (status) result = status;
    }
    puts(result ? "concurrent IO failed" : "80000 concurrent IO cycles passed");
    return result;
  }
  unsigned id = (unsigned)atoi(argv[1]);
  char temporary[80], target[80], neighbor[80];
  snprintf(temporary, sizeof(temporary), "/tmp/process-io-stress/tmp-%u", id);
  snprintf(target, sizeof(target), "/tmp/process-io-stress/file-%u", id);
  snprintf(neighbor, sizeof(neighbor), "/tmp/process-io-stress/file-%u", (id + 1) % CHILDREN);
  for (unsigned n = 1; n <= LOOPS; ++n) {
    memset(bytes, n % 251, sizeof(bytes));
    publish(temporary, target);
    int fd = open(neighbor, O_RDONLY);
    if (fd < 0) fail("open reader", neighbor);
    if (read(fd, bytes, sizeof(bytes)) != sizeof(bytes)) fail("read", neighbor);
    if (close(fd)) fail("close reader", neighbor);
    for (unsigned k = 1; k < sizeof(bytes); ++k) {
      if (bytes[k] != bytes[0]) { errno = EIO; fail("inconsistent data", neighbor); }
    }
  }
  return 0;
}
