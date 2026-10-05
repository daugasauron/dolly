#include <stdio.h>
#include <unistd.h>

// The processor count libc reports, for `make -j$(nproc)`.
int main(void) {
  return printf("%ld\n", sysconf(_SC_NPROCESSORS_ONLN)) < 0;
}
