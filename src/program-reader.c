#include <stdio.h>
#include <string.h>

#include <dolly/abi.h>

int dolly_main(int argc, char **argv) {
  static const char expected[] = "written by an independently linked wasm64 module\n";
  char buffer[sizeof(expected)] = {0};

  if (argc != 2) {
    fputs("usage: reader FILE\n", stderr);
    return 64;
  }

  FILE *file = fopen(argv[1], "rb");
  if (file == NULL) {
    perror("reader: fopen");
    return 1;
  }

  size_t received = fread(buffer, 1, sizeof(buffer) - 1, file);
  if (fclose(file) != 0) {
    perror("reader: fclose");
    return 2;
  }
  if (received != sizeof(expected) - 1 || memcmp(buffer, expected, sizeof(expected)) != 0) {
    fprintf(stderr, "reader: shared file contents did not match\n");
    return 3;
  }

  printf("reader: observed %zu bytes written by the other module\n", received);
  return 0;
}
