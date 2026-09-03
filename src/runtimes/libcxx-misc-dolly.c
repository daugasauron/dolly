/* Small no-exception libc++/Itanium ABI boundaries used by build tools. */

#define _POSIX_C_SOURCE 200809L

#include <stdarg.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <time.h>

typedef union {
  struct {
    uint64_t capacity_and_long;
    uint64_t size;
    char *data;
  } long_string;
  unsigned char bytes[24];
} dolly_libcxx_string;

extern void dolly_string_init(dolly_libcxx_string *, const char *, uint64_t)
    __asm__("_ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE6__initEPKcm");

void dolly_to_string_int(dolly_libcxx_string *result, int value)
    __asm__("_ZNSt3__29to_stringEi");
void dolly_to_string_int(dolly_libcxx_string *result, int value) {
  char buffer[32];
  int length = snprintf(buffer, sizeof(buffer), "%d", value);
  if (length < 0 || (size_t)length >= sizeof(buffer))
    abort();
  dolly_string_init(result, buffer, (uint64_t)length);
}

int64_t dolly_steady_clock_now(void)
    __asm__("_ZNSt3__26chrono12steady_clock3nowEv");
int64_t dolly_steady_clock_now(void) {
  struct timespec value;
  if (clock_gettime(CLOCK_MONOTONIC, &value) != 0)
    abort();
  return (int64_t)value.tv_sec * INT64_C(1000000) + value.tv_nsec / 1000;
}

void dolly_libcpp_verbose_abort(const char *format, ...)
    __asm__("_ZNSt3__222__libcpp_verbose_abortEPKcz");
void dolly_libcpp_verbose_abort(const char *format, ...) {
  va_list arguments;
  va_start(arguments, format);
  fputs("libc++: ", stderr);
  vfprintf(stderr, format, arguments);
  fputc('\n', stderr);
  va_end(arguments);
  abort();
}

/* Emscripten's optimized driver normally lowers integer-only printf calls to
 * iprintf. Dolly intentionally builds bootstrap tools at -O0, so retain the
 * ordinary symbol locally and terminate it at the already-contracted vprintf. */
int dolly_printf(const char *format, ...) __asm__("printf");
int dolly_printf(const char *format, ...) {
  va_list arguments;
  va_start(arguments, format);
  int result = vprintf(format, arguments);
  va_end(arguments);
  return result;
}

int dolly_fprintf(FILE *stream, const char *format, ...) __asm__("fprintf");
int dolly_fprintf(FILE *stream, const char *format, ...) {
  va_list arguments;
  va_start(arguments, format);
  int result = vfprintf(stream, format, arguments);
  va_end(arguments);
  return result;
}

int dolly_cxa_guard_acquire(uint64_t *guard) __asm__("__cxa_guard_acquire");
int dolly_cxa_guard_acquire(uint64_t *guard) {
  unsigned char *bytes = (unsigned char *)guard;
  if (bytes[0] != 0)
    return 0;
  if (bytes[1] != 0)
    abort();
  bytes[1] = 1;
  return 1;
}

void dolly_cxa_guard_release(uint64_t *guard) __asm__("__cxa_guard_release");
void dolly_cxa_guard_release(uint64_t *guard) {
  unsigned char *bytes = (unsigned char *)guard;
  bytes[0] = 1;
  bytes[1] = 0;
}

void dolly_cxa_guard_abort(uint64_t *guard) __asm__("__cxa_guard_abort");
void dolly_cxa_guard_abort(uint64_t *guard) {
  ((unsigned char *)guard)[1] = 0;
}

void dolly_cxa_pure_virtual(void) __asm__("__cxa_pure_virtual");
void dolly_cxa_pure_virtual(void) { abort(); }

void dolly_cxa_deleted_virtual(void) __asm__("__cxa_deleted_virtual");
void dolly_cxa_deleted_virtual(void) { abort(); }
