#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <zlib.h>

enum { BUFFER_SIZE = 64 * 1024 };

static void usage(FILE *stream) {
  fputs("usage: gzip -dc [FILE|-]\n", stream);
}

static int write_all(const unsigned char *bytes, size_t length) {
  while (length != 0) {
    const ssize_t count = write(STDOUT_FILENO, bytes, length);
    if (count < 0 && errno == EINTR) continue;
    if (count <= 0) return -1;
    bytes += (size_t)count;
    length -= (size_t)count;
  }
  return 0;
}

int main(int argc, char **argv) {
  if (argc == 2 && strcmp(argv[1], "--help") == 0) {
    usage(stdout);
    return 0;
  }
  if (argc != 3 ||
      (strcmp(argv[1], "-dc") != 0 && strcmp(argv[1], "-cd") != 0 &&
       strcmp(argv[1], "--decompress-stdout") != 0)) {
    usage(stderr);
    fputs("gzip: Dolly version 0 intentionally implements decompression to stdout only\n",
          stderr);
    return 2;
  }

  gzFile input;
  if (strcmp(argv[2], "-") == 0) {
    const int descriptor = dup(STDIN_FILENO);
    input = descriptor < 0 ? NULL : gzdopen(descriptor, "rb");
    if (input == NULL && descriptor >= 0) close(descriptor);
  } else {
    input = gzopen(argv[2], "rb");
  }
  if (input == NULL) {
    fprintf(stderr, "gzip: %s: could not open gzip stream\n", argv[2]);
    return 1;
  }

  unsigned char *buffer = malloc(BUFFER_SIZE);
  if (buffer == NULL) {
    gzclose(input);
    fputs("gzip: out of memory\n", stderr);
    return 1;
  }
  int status = 0;
  for (;;) {
    const int count = gzread(input, buffer, BUFFER_SIZE);
    if (count > 0) {
      if (write_all(buffer, (size_t)count) != 0) {
        fprintf(stderr, "gzip: stdout: %s\n", strerror(errno));
        status = 1;
        break;
      }
      continue;
    }
    if (count < 0) {
      int code = Z_OK;
      const char *message = gzerror(input, &code);
      fprintf(stderr, "gzip: %s: %s\n", argv[2],
              message == NULL ? "decompression failed" : message);
      status = 1;
    }
    break;
  }
  free(buffer);
  if (gzclose(input) != Z_OK && status == 0) {
    fprintf(stderr, "gzip: %s: invalid or incomplete gzip stream\n", argv[2]);
    status = 1;
  }
  return status;
}
