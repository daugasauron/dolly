/*
 * Minimal libc++ string ABI needed by Dolly's bootstrap build tools.
 *
 * This is deliberately C, not a second implementation of std::string.  Most
 * libc++ string operations are inline in the pinned headers.  The headers
 * leave a small set of allocation and mutation paths out of line, and
 * compiling the full upstream string.cpp inside the browser would instantiate
 * hundreds of unrelated conversions and wide-string operations. These
 * definitions implement the paths required by the source-built bootstrap
 * tools against libc++ ABI version 2's wasm64 basic_string<char> layout.
 *
 * Keep this file coupled to the pinned Emscripten/libc++ source revision.  A
 * Dolly's source-built C++ fixture exercises the archive before it is retained.
 */

#include <stdint.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
  uint64_t capacity_and_long;
  uint64_t size;
  char *data;
} dolly_libcxx_long_string;

typedef union {
  dolly_libcxx_long_string long_string;
  unsigned char bytes[24];
} dolly_libcxx_string;

static int dolly_libcxx_string_is_long(const dolly_libcxx_string *self) {
  return (self->bytes[0] & 1U) != 0;
}

static uint64_t dolly_libcxx_string_size(const dolly_libcxx_string *self) {
  return dolly_libcxx_string_is_long(self) ? self->long_string.size
                                           : self->bytes[0] >> 1;
}

static uint64_t dolly_libcxx_string_capacity(const dolly_libcxx_string *self) {
  return dolly_libcxx_string_is_long(self)
             ? (self->long_string.capacity_and_long & ~UINT64_C(1)) - 1
             : 22;
}

static char *dolly_libcxx_string_data(dolly_libcxx_string *self) {
  return dolly_libcxx_string_is_long(self) ? self->long_string.data
                                           : (char *)(self->bytes + 1);
}

static void dolly_libcxx_string_set_size(dolly_libcxx_string *self,
                                         uint64_t size) {
  if (dolly_libcxx_string_is_long(self))
    self->long_string.size = size;
  else
    self->bytes[0] = (unsigned char)(size << 1);
}

static char *dolly_libcxx_string_reserve(dolly_libcxx_string *self,
                                         uint64_t requested) {
  if (requested <= dolly_libcxx_string_capacity(self))
    return dolly_libcxx_string_data(self);
  if (requested == UINT64_MAX)
    abort();

  uint64_t allocation = (requested + 1 + 7) & ~UINT64_C(7);
  uint64_t old_allocation = dolly_libcxx_string_is_long(self)
                                ? self->long_string.capacity_and_long & ~UINT64_C(1)
                                : 24;
  if (old_allocation <= UINT64_MAX / 2 && allocation < old_allocation * 2)
    allocation = old_allocation * 2;
  if (allocation < requested + 1 || allocation > (uint64_t)SIZE_MAX)
    abort();

  uint64_t old_size = dolly_libcxx_string_size(self);
  char *old_data = dolly_libcxx_string_data(self);
  char *new_data = (char *)malloc((size_t)allocation);
  if (new_data == NULL)
    abort();
  memcpy(new_data, old_data, (size_t)old_size + 1);
  if (dolly_libcxx_string_is_long(self))
    free(old_data);
  self->long_string.capacity_and_long = allocation | UINT64_C(1);
  self->long_string.size = old_size;
  self->long_string.data = new_data;
  return new_data;
}

static char *dolly_libcxx_string_init(dolly_libcxx_string *self,
                                      const char *source,
                                      uint64_t size) {
  /* libc++'s ABI-v2 char SSO stores a shifted size byte and 23 bytes of data. */
  if (size < 23) {
    self->bytes[0] = (unsigned char)(size << 1);
    if (size != 0)
      memcpy(self->bytes + 1, source, (size_t)size);
    self->bytes[size + 1] = 0;
    return (char *)(self->bytes + 1);
  }

  if (size == UINT64_MAX)
    abort();
  uint64_t allocation = (size + 1 + 7) & ~UINT64_C(7);
  if (allocation < size + 1)
    abort();
  char *data = (char *)malloc((size_t)allocation);
  if (data == NULL)
    abort();
  memcpy(data, source, (size_t)size);
  data[size] = 0;

  /* Little-endian libc++ stores is_long in bit zero and cap/count above it. */
  self->long_string.capacity_and_long = allocation | UINT64_C(1);
  self->long_string.size = size;
  self->long_string.data = data;
  return data;
}

void dolly_libcxx_string_init_abi(dolly_libcxx_string *self,
                                  const char *source,
                                  uint64_t size)
    __asm__("_ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE6__initEPKcm");

void dolly_libcxx_string_init_abi(dolly_libcxx_string *self,
                                  const char *source,
                                  uint64_t size) {
  (void)dolly_libcxx_string_init(self, source, size);
}

void dolly_libcxx_string_copy_abi(dolly_libcxx_string *self,
                                  const char *source,
                                  uint64_t size)
    __asm__("_ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE25__init_copy_ctor_externalEPKcm");

void dolly_libcxx_string_copy_abi(dolly_libcxx_string *self,
                                  const char *source,
                                  uint64_t size) {
  (void)dolly_libcxx_string_init(self, source, size);
}

dolly_libcxx_string *dolly_libcxx_string_destroy_abi(dolly_libcxx_string *self)
    __asm__("_ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED1Ev");

dolly_libcxx_string *dolly_libcxx_string_destroy_abi(dolly_libcxx_string *self) {
  if ((self->bytes[0] & 1U) != 0)
    free(self->long_string.data);
  return self;
}

static dolly_libcxx_string *dolly_libcxx_string_assign(
    dolly_libcxx_string *self, const char *source, uint64_t size) {
  char *old_data = dolly_libcxx_string_data(self);
  uint64_t old_size = dolly_libcxx_string_size(self);
  char *temporary = NULL;
  uintptr_t source_address = (uintptr_t)source;
  uintptr_t begin = (uintptr_t)old_data;
  if (source_address >= begin && source_address <= begin + old_size) {
    temporary = (char *)malloc((size_t)size);
    if (temporary == NULL && size != 0)
      abort();
    if (size != 0)
      memcpy(temporary, source, (size_t)size);
    source = temporary;
  }
  char *destination = dolly_libcxx_string_reserve(self, size);
  if (size != 0)
    memmove(destination, source, (size_t)size);
  destination[size] = 0;
  dolly_libcxx_string_set_size(self, size);
  free(temporary);
  return self;
}

static dolly_libcxx_string *dolly_libcxx_string_replace(
    dolly_libcxx_string *self, uint64_t position, uint64_t removed,
    const char *source, uint64_t inserted) {
  uint64_t old_size = dolly_libcxx_string_size(self);
  if (position > old_size)
    abort();
  if (removed > old_size - position)
    removed = old_size - position;
  if (inserted > UINT64_MAX - (old_size - removed))
    abort();
  uint64_t new_size = old_size - removed + inserted;

  char *old_data = dolly_libcxx_string_data(self);
  char *temporary = NULL;
  uintptr_t source_address = (uintptr_t)source;
  uintptr_t begin = (uintptr_t)old_data;
  if (source_address >= begin && source_address <= begin + old_size) {
    temporary = (char *)malloc((size_t)inserted);
    if (temporary == NULL && inserted != 0)
      abort();
    if (inserted != 0)
      memcpy(temporary, source, (size_t)inserted);
    source = temporary;
  }

  char *data = dolly_libcxx_string_reserve(self, new_size);
  memmove(data + position + inserted, data + position + removed,
          (size_t)(old_size - position - removed));
  if (inserted != 0)
    memcpy(data + position, source, (size_t)inserted);
  data[new_size] = 0;
  dolly_libcxx_string_set_size(self, new_size);
  free(temporary);
  return self;
}

dolly_libcxx_string *dolly_string_assign_no_alias_true(
    dolly_libcxx_string *self, const char *source, uint64_t size)
    __asm__("_ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE17__assign_no_aliasILb1EEERS5_PKcm");
dolly_libcxx_string *dolly_string_assign_no_alias_true(
    dolly_libcxx_string *self, const char *source, uint64_t size) {
  return dolly_libcxx_string_assign(self, source, size);
}

dolly_libcxx_string *dolly_string_assign_no_alias_false(
    dolly_libcxx_string *self, const char *source, uint64_t size)
    __asm__("_ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE17__assign_no_aliasILb0EEERS5_PKcm");
dolly_libcxx_string *dolly_string_assign_no_alias_false(
    dolly_libcxx_string *self, const char *source, uint64_t size) {
  return dolly_libcxx_string_assign(self, source, size);
}

dolly_libcxx_string *dolly_string_assign_external_size(
    dolly_libcxx_string *self, const char *source, uint64_t size)
    __asm__("_ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE17__assign_externalEPKcm");
dolly_libcxx_string *dolly_string_assign_external_size(
    dolly_libcxx_string *self, const char *source, uint64_t size) {
  return dolly_libcxx_string_assign(self, source, size);
}

dolly_libcxx_string *dolly_string_assign_external(
    dolly_libcxx_string *self, const char *source)
    __asm__("_ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE17__assign_externalEPKc");
dolly_libcxx_string *dolly_string_assign_external(
    dolly_libcxx_string *self, const char *source) {
  return dolly_libcxx_string_assign(self, source, strlen(source));
}

dolly_libcxx_string *dolly_string_insert(
    dolly_libcxx_string *self, uint64_t position, const char *source)
    __asm__("_ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE6insertEmPKc");
dolly_libcxx_string *dolly_string_insert(
    dolly_libcxx_string *self, uint64_t position, const char *source) {
  return dolly_libcxx_string_replace(self, position, 0, source, strlen(source));
}

void dolly_string_resize(dolly_libcxx_string *self, uint64_t size, int value)
    __asm__("_ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE6resizeEmc");
void dolly_string_resize(dolly_libcxx_string *self, uint64_t size, int value) {
  uint64_t old_size = dolly_libcxx_string_size(self);
  char *data = dolly_libcxx_string_reserve(self, size);
  if (size > old_size)
    memset(data + old_size, value, (size_t)(size - old_size));
  data[size] = 0;
  dolly_libcxx_string_set_size(self, size);
}

void dolly_string_reserve(dolly_libcxx_string *self, uint64_t capacity)
    __asm__("_ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE7reserveEm");
void dolly_string_reserve(dolly_libcxx_string *self, uint64_t capacity) {
  (void)dolly_libcxx_string_reserve(self, capacity);
}

dolly_libcxx_string *dolly_string_replace_cstr(
    dolly_libcxx_string *self, uint64_t position, uint64_t removed,
    const char *source)
    __asm__("_ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE7replaceEmmPKc");
dolly_libcxx_string *dolly_string_replace_cstr(
    dolly_libcxx_string *self, uint64_t position, uint64_t removed,
    const char *source) {
  return dolly_libcxx_string_replace(self, position, removed, source,
                                     strlen(source));
}

dolly_libcxx_string *dolly_string_replace_span(
    dolly_libcxx_string *self, uint64_t position, uint64_t removed,
    const char *source, uint64_t inserted)
    __asm__("_ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE7replaceEmmPKcm");
dolly_libcxx_string *dolly_string_replace_span(
    dolly_libcxx_string *self, uint64_t position, uint64_t removed,
    const char *source, uint64_t inserted) {
  return dolly_libcxx_string_replace(self, position, removed, source, inserted);
}

dolly_libcxx_string *dolly_string_replace_chars(
    dolly_libcxx_string *self, uint64_t position, uint64_t removed,
    uint64_t inserted, int value)
    __asm__("_ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE7replaceEmmmc");
dolly_libcxx_string *dolly_string_replace_chars(
    dolly_libcxx_string *self, uint64_t position, uint64_t removed,
    uint64_t inserted, int value) {
  uint64_t old_size = dolly_libcxx_string_size(self);
  if (position > old_size)
    abort();
  if (removed > old_size - position)
    removed = old_size - position;
  if (inserted > UINT64_MAX - (old_size - removed))
    abort();
  uint64_t new_size = old_size - removed + inserted;
  char *data = dolly_libcxx_string_reserve(self, new_size);
  memmove(data + position + inserted, data + position + removed,
          (size_t)(old_size - position - removed));
  memset(data + position, value, (size_t)inserted);
  data[new_size] = 0;
  dolly_libcxx_string_set_size(self, new_size);
  return self;
}

dolly_libcxx_string *dolly_string_append_chars(
    dolly_libcxx_string *self, uint64_t count, int value)
    __asm__("_ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE6appendEmc");
dolly_libcxx_string *dolly_string_append_chars(
    dolly_libcxx_string *self, uint64_t count, int value) {
  uint64_t old_size = dolly_libcxx_string_size(self);
  if (count > UINT64_MAX - old_size)
    abort();
  uint64_t new_size = old_size + count;
  char *data = dolly_libcxx_string_reserve(self, new_size);
  memset(data + old_size, value, (size_t)count);
  data[new_size] = 0;
  dolly_libcxx_string_set_size(self, new_size);
  return self;
}

dolly_libcxx_string *dolly_string_append_span(
    dolly_libcxx_string *self, const char *source, uint64_t count)
    __asm__("_ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE6appendEPKcm");
dolly_libcxx_string *dolly_string_append_span(
    dolly_libcxx_string *self, const char *source, uint64_t count) {
  return dolly_libcxx_string_replace(
      self, dolly_libcxx_string_size(self), 0, source, count);
}

dolly_libcxx_string *dolly_string_append_cstr(
    dolly_libcxx_string *self, const char *source)
    __asm__("_ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE6appendEPKc");
dolly_libcxx_string *dolly_string_append_cstr(
    dolly_libcxx_string *self, const char *source) {
  return dolly_string_append_span(self, source, strlen(source));
}

void dolly_string_push_back(dolly_libcxx_string *self, int value)
    __asm__("_ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE9push_backEc");
void dolly_string_push_back(dolly_libcxx_string *self, int value) {
  (void)dolly_string_append_chars(self, 1, value);
}

void dolly_string_concat_cstr(dolly_libcxx_string *result, const char *left,
                              const dolly_libcxx_string *right)
    __asm__("_ZNSt3__2plIcNS_11char_traitsIcEENS_9allocatorIcEEEENS_12basic_stringIT_T0_T1_EEPKS6_RKS9_");
void dolly_string_concat_cstr(dolly_libcxx_string *result, const char *left,
                              const dolly_libcxx_string *right) {
  uint64_t left_size = strlen(left);
  uint64_t right_size = dolly_libcxx_string_size(right);
  (void)dolly_libcxx_string_init(result, left, left_size);
  (void)dolly_libcxx_string_replace(
      result, left_size, 0,
      dolly_libcxx_string_data((dolly_libcxx_string *)right), right_size);
}

int dolly_string_compare_span(const dolly_libcxx_string *self,
                              uint64_t position, uint64_t count,
                              const char *other, uint64_t other_size)
    __asm__("_ZNKSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE7compareEmmPKcm");
int dolly_string_compare_span(const dolly_libcxx_string *self,
                              uint64_t position, uint64_t count,
                              const char *other, uint64_t other_size) {
  uint64_t size = dolly_libcxx_string_size(self);
  if (position > size)
    abort();
  if (count > size - position)
    count = size - position;
  uint64_t common = count < other_size ? count : other_size;
  int comparison = memcmp(
      dolly_libcxx_string_data((dolly_libcxx_string *)self) + position,
      other, (size_t)common);
  if (comparison != 0)
    return comparison;
  return count < other_size ? -1 : count > other_size ? 1 : 0;
}

dolly_libcxx_string *dolly_string_substring_constructor(
    dolly_libcxx_string *self, const dolly_libcxx_string *source,
    uint64_t position, uint64_t count, const void *allocator)
    __asm__("_ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEC1ERKS5_mmRKS4_");
dolly_libcxx_string *dolly_string_substring_constructor(
    dolly_libcxx_string *self, const dolly_libcxx_string *source,
    uint64_t position, uint64_t count, const void *allocator) {
  (void)allocator;
  uint64_t source_size = dolly_libcxx_string_size(source);
  if (position > source_size)
    abort();
  if (count > source_size - position)
    count = source_size - position;
  dolly_libcxx_string_init(
      self, dolly_libcxx_string_data((dolly_libcxx_string *)source) + position,
      count);
  return self;
}

uint64_t dolly_string_find_char(const dolly_libcxx_string *self, int value,
                                uint64_t position)
    __asm__("_ZNKSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE4findEcm");
uint64_t dolly_string_find_char(const dolly_libcxx_string *self, int value,
                                uint64_t position) {
  uint64_t size = dolly_libcxx_string_size(self);
  if (position >= size)
    return UINT64_MAX;
  const char *begin =
      dolly_libcxx_string_data((dolly_libcxx_string *)self) + position;
  const char *found = (const char *)memchr(begin, value, (size_t)(size - position));
  return found == NULL ? UINT64_MAX : (uint64_t)(found - begin) + position;
}

void dolly_string_init_chars(dolly_libcxx_string *self, uint64_t count,
                             int value)
    __asm__("_ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE6__initEmc");
void dolly_string_init_chars(dolly_libcxx_string *self, uint64_t count,
                             int value) {
  if (count < 23) {
    self->bytes[0] = (unsigned char)(count << 1);
    memset(self->bytes + 1, value, (size_t)count);
    self->bytes[count + 1] = 0;
    return;
  }
  char *temporary = (char *)malloc((size_t)count);
  if (temporary == NULL)
    abort();
  memset(temporary, value, (size_t)count);
  dolly_libcxx_string_init(self, temporary, count);
  free(temporary);
}
