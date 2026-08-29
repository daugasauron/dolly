#include <stdio.h>
#include <string.h>

#include <dolly/abi.h>

int dolly_main(int argc, char **argv) {
  static const char message[] = "written by an independently linked wasm64 module\n";

  if (argc != 2) {
    fputs("usage: writer FILE\n", stderr);
    return 64;
  }

  FILE *file = fopen(argv[1], "wb");
  if (file == NULL) {
    perror("writer: fopen");
    return 1;
  }

  size_t written = fwrite(message, 1, sizeof(message) - 1, file);
  if (written != sizeof(message) - 1) {
    perror("writer: fwrite");
    fclose(file);
    return 2;
  }
  if (fclose(file) != 0) {
    perror("writer: fclose");
    return 3;
  }

  printf("writer: stored %zu bytes in %s\n", written, argv[1]);
  return 0;
}
