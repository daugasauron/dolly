// Touches argv[1] MiB and exits; with "thread", a second thread touches it,
// so the memory was taken to its maximum first (tasks/20261101-102515).
#include <pthread.h>
#include <stdlib.h>
#include <string.h>

static size_t bytes;

static void *touch(void *block) {
  memset(block, 1, bytes);
  return ((char *)block)[bytes - 1] == 1 ? NULL : block;
}

int main(int argc, char **argv) {
  if (argc < 2) return 64;
  bytes = (size_t)atoi(argv[1]) << 20;
  void *block = malloc(bytes), *result = block;
  if (block == NULL) return 1;
  if (argc > 2 && strcmp(argv[2], "thread") == 0) {
    pthread_t thread;
    if (pthread_create(&thread, NULL, touch, block) || pthread_join(thread, &result)) return 2;
  } else {
    result = touch(block);
  }
  return result == NULL ? 0 : 3;
}
