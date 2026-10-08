#include <errno.h>
#include <limits.h>
#include <pthread.h>
#include <stdint.h>
#include <string.h>

/* Rust's std prepares thread attributes before pthread_create, which a
 * process linked without threads refuses. libc carries these three only in
 * its threaded variant; they are musl's, with zero for its default sizes. */
int pthread_attr_init(pthread_attr_t *attributes) {
  memset(attributes, 0, sizeof(*attributes));
  return 0;
}

int pthread_attr_setstacksize(pthread_attr_t *attributes, size_t size) {
  if (size - PTHREAD_STACK_MIN > SIZE_MAX / 4) return EINVAL;
  attributes->__u.__s[0] = size;
  return 0;
}

int pthread_attr_destroy(pthread_attr_t *attributes) {
  (void)attributes;
  return 0;
}
