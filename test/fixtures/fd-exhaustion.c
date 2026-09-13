#define _GNU_SOURCE
#include <assert.h>
#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/resource.h>
#include <sys/stat.h>
#include <unistd.h>

int main(void) {
#ifndef __wasm__
  struct rlimit limit = {256, 256};
  assert(setrlimit(RLIMIT_NOFILE, &limit) == 0);
#endif
  char directory[] = "/tmp/dolly-fd-exhaustion-XXXXXX";
  assert(mkdtemp(directory));
  int parent = open(directory, O_RDONLY | O_DIRECTORY);
  assert(parent >= 0);
  int fd = openat(parent, "existing", O_CREAT | O_TRUNC | O_WRONLY, 0600);
  assert(fd >= 0 && write(fd, "KEEP", 4) == 4 && close(fd) == 0);
  int descriptors[1024], count = 0;
  while (count < 1024 && (fd = open("/dev/null", O_RDONLY)) >= 0) descriptors[count++] = fd;
  assert(count > 0 && count < 1024 && errno == EMFILE);
  assert(openat(parent, "existing", O_WRONLY | O_TRUNC) == -1 && errno == EMFILE);
  assert(openat(parent, "created", O_WRONLY | O_CREAT | O_EXCL, 0600) == -1 && errno == EMFILE);
  struct stat metadata;
  assert(fstatat(parent, "existing", &metadata, 0) == 0 && metadata.st_size == 4);
  assert(fstatat(parent, "created", &metadata, 0) == -1 && errno == ENOENT);
  assert(close(descriptors[--count]) == 0);
  fd = openat(parent, "created", O_WRONLY | O_CREAT | O_EXCL, 0600);
  assert(fd >= 0 && write(fd, "NEW", 3) == 3 && close(fd) == 0);
  fd = openat(parent, "existing", O_RDONLY);
  char bytes[4];
  assert(fd >= 0 && read(fd, bytes, 4) == 4 && memcmp(bytes, "KEEP", 4) == 0);
  assert(close(fd) == 0);
  for (int index = 0; index < count; ++index) assert(close(descriptors[index]) == 0);
  assert(unlinkat(parent, "existing", 0) == 0 && unlinkat(parent, "created", 0) == 0);
  assert(close(parent) == 0 && rmdir(directory) == 0);
  puts("descriptor exhaustion preserves files; closing a descriptor permits retry");
}
