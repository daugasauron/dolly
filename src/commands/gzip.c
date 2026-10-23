#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <zlib.h>

enum { BUFFER_SIZE = 64 * 1024 };

static void usage(FILE *stream) {
  fputs("usage: gzip -dc [FILE|-]\nWithout FILE, or with -, gzip reads stdin; -cdf, as tar -z passes it, is the same.\n", stream);
}

// -d and -c in one word, in any order, and -f, which changes nothing when the output is stdout.
static int decompress_to_stdout(const char *option) {
  return strcmp(option, "--decompress-stdout") == 0 || (option[0] == '-' &&
      strspn(option + 1, "cdf") == strlen(option + 1) && strchr(option, 'c') && strchr(option, 'd'));
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
  if (argc < 2 || argc > 3 || !decompress_to_stdout(argv[1])) {
    usage(stderr);
    fputs("gzip: this gzip only decompresses to stdout; pigz compresses (amy install pigz)\n", stderr);
    return 2;
  }

  gzFile input;
  const char *name = argc == 3 ? argv[2] : "-";
  if (strcmp(name, "-") == 0) {
    const int descriptor = dup(STDIN_FILENO);
    input = descriptor < 0 ? NULL : gzdopen(descriptor, "rb");
    if (input == NULL && descriptor >= 0) close(descriptor);
  } else {
    input = gzopen(name, "rb");
  }
  if (input == NULL) {
    fprintf(stderr, "gzip: %s: could not open gzip stream\n", name);
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
      fprintf(stderr, "gzip: %s: %s\n", name,
              message == NULL ? "decompression failed" : message);
      status = 1;
    }
    break;
  }
  free(buffer);
  if (gzclose(input) != Z_OK && status == 0) {
    fprintf(stderr, "gzip: %s: invalid or incomplete gzip stream\n", name);
    status = 1;
  }
  return status;
}
