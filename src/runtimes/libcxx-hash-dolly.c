/* Dolly's deterministic libc++ hash boundary, exposed with ABI-v2 names. */

#include <stddef.h>
#include <stdint.h>

size_t dolly_hash_memory(const void *pointer, size_t size)
    __asm__("_ZNSt3__213__hash_memoryEPKvm");
size_t dolly_hash_memory(const void *pointer, size_t size) {
  const unsigned char *bytes = (const unsigned char *)pointer;
  size_t hash = UINT64_C(14695981039346656037);
  for (size_t index = 0; index < size; ++index) {
    hash ^= bytes[index];
    hash *= UINT64_C(1099511628211);
  }
  return hash;
}

static int dolly_is_prime(size_t candidate) {
  if (candidate < 2)
    return 0;
  if ((candidate & 1) == 0)
    return candidate == 2;
  for (size_t divisor = 3; divisor <= candidate / divisor; divisor += 2) {
    if (candidate % divisor == 0)
      return 0;
  }
  return 1;
}

size_t dolly_next_prime(size_t value) __asm__("_ZNSt3__212__next_primeEm");
size_t dolly_next_prime(size_t value) {
  if (value <= 2)
    return 2;
  size_t candidate = value | 1;
  while (!dolly_is_prime(candidate)) {
    if (candidate > SIZE_MAX - 2)
      return candidate;
    candidate += 2;
  }
  return candidate;
}
