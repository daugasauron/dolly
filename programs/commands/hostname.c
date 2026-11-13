#include <stdio.h>
#include <string.h>

int main(int argc, char **argv) {
  if (argc == 2 && strcmp(argv[1], "--help") == 0) {
    fputs("usage: hostname [-s|-f]\n", stdout);
    return 0;
  }
  if (argc > 2 ||
      (argc == 2 && strcmp(argv[1], "-s") != 0 &&
       strcmp(argv[1], "-f") != 0)) {
    fputs("hostname: Dolly's deterministic hostname is read-only\n", stderr);
    return 2;
  }
  puts("dolly");
  return 0;
}
