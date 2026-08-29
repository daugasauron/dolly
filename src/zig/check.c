#include <stdio.h>

extern unsigned dolly_zig_answer(void);

int main(void) {
  const unsigned answer = dolly_zig_answer();
  if (answer != 42) {
    fprintf(stderr, "zig-check: expected 42, got %u\n", answer);
    return 1;
  }
  puts("zig-check: Zig stage1 generated Dolly-compatible C inside WasmFS");
  return 0;
}
