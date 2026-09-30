#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>

static int produce(void) {
  static const char message[] = "PROCESS-PIPE-DATA\n";
  return write(STDOUT_FILENO, message, sizeof(message) - 1) ==
      (ssize_t)(sizeof(message) - 1) ? 0 : 30;
}

/* The standard stream paths name this process's own pipe descriptors. */
static int consume(void) {
  static const char expected[] = "PROCESS-PIPE-DATA\n";
  char bytes[sizeof(expected)] = {0};
  const int input = open("/dev/stdin", O_RDONLY);
  const int output = open("/dev/stdout", O_WRONLY);
  if (input < 0 || output < 0) return 34;
  size_t offset = 0;
  while (offset < sizeof(expected) - 1) {
    const ssize_t count = read(input, bytes + offset,
                               sizeof(expected) - 1 - offset);
    if (count < 0) return 31;
    if (count == 0) break;
    offset += (size_t)count;
  }
  if (offset != sizeof(expected) - 1 ||
      memcmp(bytes, expected, sizeof(expected) - 1) != 0) {
    fprintf(stderr, "process-pipe-check: received %zu bytes:", offset);
    for (size_t index = 0; index < offset; ++index) {
      fprintf(stderr, " %02x", (unsigned char)bytes[index]);
    }
    fputc('\n', stderr);
    return 32;
  }
  return write(output, "PROCESS-PIPE-OK\n", 16) == 16 ? 0 : 33;
}

/* A write without readers fails with EPIPE and raises no SIGPIPE. */
static int broken(void) {
  int descriptors[2];
  if (pipe(descriptors) != 0 || close(descriptors[0]) != 0) return 35;
  return write(descriptors[1], "x", 1) == -1 && errno == EPIPE ? 0 : 37;
}

int main(int argc, char **argv) {
  if (argc != 2) return 2;
  if (strcmp(argv[1], "produce") == 0) return produce();
  if (strcmp(argv[1], "consume") == 0) return consume();
  if (strcmp(argv[1], "broken") == 0) return broken();
  return 2;
}
