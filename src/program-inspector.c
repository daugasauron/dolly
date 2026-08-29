#include <stdio.h>
#include <string.h>

int main(int argc, char **argv) {
  static const char expected[] = "written by an independently linked wasm64 module\n";
  char buffer[sizeof(expected)] = {0};

  if (argc != 2 || strcmp(argv[1], "--verify") != 0) {
    fputs("usage: inspector --verify\n", stderr);
    return 64;
  }

  FILE *file = fopen("/workspace/shared.txt", "rb");
  if (file == NULL) {
    perror("inspector: fopen");
    return 1;
  }
  size_t received = fread(buffer, 1, sizeof(buffer) - 1, file);
  if (fclose(file) != 0) {
    perror("inspector: fclose");
    return 2;
  }
  if (received != sizeof(expected) - 1 || memcmp(buffer, expected, sizeof(expected)) != 0) {
    fprintf(stderr, "inspector: shared file contents did not match\n");
    return 3;
  }

  printf("inspector: dlopen module observed %zu bytes from WasmFS\n", received);
  return 0;
}
