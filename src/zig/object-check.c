#include <stdint.h>
#include <stdio.h>
#include <string.h>

int main(int argc, char **argv) {
  static const unsigned char wasm_header[8] = {
      0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
  };
  unsigned char header[8] = {0};

  if (argc != 2) {
    fputs("usage: zig-object-check FILE\n", stderr);
    return 64;
  }
  FILE *file = fopen(argv[1], "rb");
  if (file == NULL) {
    perror("zig-object-check: fopen");
    return 1;
  }
  size_t received = fread(header, 1, sizeof(header), file);
  if (fclose(file) != 0) {
    perror("zig-object-check: fclose");
    return 1;
  }
  if (received != sizeof(header) || memcmp(header, wasm_header, sizeof(header)) != 0) {
    fprintf(stderr,
            "zig-object-check: invalid header (%zu bytes read): "
            "%02x %02x %02x %02x %02x %02x %02x %02x\n",
            received, header[0], header[1], header[2], header[3], header[4],
            header[5], header[6], header[7]);
    return 1;
  }
  puts("zig-object-check: native Zig emitted a Wasm object");
  return 0;
}
