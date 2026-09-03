/* Dolly's no-exception C++ allocation ABI, implemented without C++ headers. */

#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>

typedef void (*dolly_new_handler)(void);
static dolly_new_handler current_handler;

static void *dolly_allocate(size_t size) {
  if (size == 0)
    size = 1;
  for (;;) {
    void *result = malloc(size);
    if (result != NULL)
      return result;
    if (current_handler == NULL)
      abort();
    current_handler();
  }
}

static void *dolly_allocate_nothrow(size_t size) {
  if (size == 0)
    size = 1;
  for (;;) {
    void *result = malloc(size);
    if (result != NULL || current_handler == NULL)
      return result;
    current_handler();
  }
}

static void *dolly_allocate_aligned(size_t size, size_t alignment,
                                    int abort_on_failure) {
  if (size == 0)
    size = 1;
  if (alignment < sizeof(void *))
    alignment = sizeof(void *);
  size_t remainder = size % alignment;
  if (remainder != 0) {
    size_t padding = alignment - remainder;
    if (size > SIZE_MAX - padding) {
      if (abort_on_failure)
        abort();
      return NULL;
    }
    size += padding;
  }
  for (;;) {
    void *result = aligned_alloc(alignment, size);
    if (result != NULL)
      return result;
    if (current_handler == NULL) {
      if (abort_on_failure)
        abort();
      return NULL;
    }
    current_handler();
  }
}

/* std::nothrow_t is empty; callers use this object's address only as a tag. */
const unsigned char dolly_nothrow __asm__("_ZSt7nothrow") = 0;

dolly_new_handler dolly_set_new_handler(dolly_new_handler handler)
    __asm__("_ZSt15set_new_handlerPFvvE");
dolly_new_handler dolly_set_new_handler(dolly_new_handler handler) {
  dolly_new_handler previous = current_handler;
  current_handler = handler;
  return previous;
}

dolly_new_handler dolly_get_new_handler(void)
    __asm__("_ZSt15get_new_handlerv");
dolly_new_handler dolly_get_new_handler(void) { return current_handler; }

void dolly_throw_bad_alloc(void) __asm__("_ZSt17__throw_bad_allocv");
void dolly_throw_bad_alloc(void) { abort(); }

void *dolly_operator_new(size_t size) __asm__("_Znwm");
void *dolly_operator_new(size_t size) { return dolly_allocate(size); }
void *dolly_operator_new_array(size_t size) __asm__("_Znam");
void *dolly_operator_new_array(size_t size) { return dolly_allocate(size); }

void *dolly_operator_new_nothrow(size_t size, const void *tag)
    __asm__("_ZnwmRKSt9nothrow_t");
void *dolly_operator_new_nothrow(size_t size, const void *tag) {
  (void)tag;
  return dolly_allocate_nothrow(size);
}
void *dolly_operator_new_array_nothrow(size_t size, const void *tag)
    __asm__("_ZnamRKSt9nothrow_t");
void *dolly_operator_new_array_nothrow(size_t size, const void *tag) {
  (void)tag;
  return dolly_allocate_nothrow(size);
}

void *dolly_operator_new_aligned(size_t size, size_t alignment)
    __asm__("_ZnwmSt11align_val_t");
void *dolly_operator_new_aligned(size_t size, size_t alignment) {
  return dolly_allocate_aligned(size, alignment, 1);
}
void *dolly_operator_new_array_aligned(size_t size, size_t alignment)
    __asm__("_ZnamSt11align_val_t");
void *dolly_operator_new_array_aligned(size_t size, size_t alignment) {
  return dolly_allocate_aligned(size, alignment, 1);
}
void *dolly_operator_new_aligned_nothrow(size_t size, size_t alignment,
                                         const void *tag)
    __asm__("_ZnwmSt11align_val_tRKSt9nothrow_t");
void *dolly_operator_new_aligned_nothrow(size_t size, size_t alignment,
                                         const void *tag) {
  (void)tag;
  return dolly_allocate_aligned(size, alignment, 0);
}
void *dolly_operator_new_array_aligned_nothrow(size_t size, size_t alignment,
                                               const void *tag)
    __asm__("_ZnamSt11align_val_tRKSt9nothrow_t");
void *dolly_operator_new_array_aligned_nothrow(size_t size, size_t alignment,
                                               const void *tag) {
  (void)tag;
  return dolly_allocate_aligned(size, alignment, 0);
}

#define DOLLY_DELETE(name, symbol, arguments) \
  void name arguments __asm__(symbol);         \
  void name arguments { free(pointer); }

DOLLY_DELETE(dolly_delete, "_ZdlPv", (void *pointer))
DOLLY_DELETE(dolly_delete_array, "_ZdaPv", (void *pointer))
DOLLY_DELETE(dolly_delete_sized, "_ZdlPvm", (void *pointer, size_t size))
DOLLY_DELETE(dolly_delete_array_sized, "_ZdaPvm", (void *pointer, size_t size))
DOLLY_DELETE(dolly_delete_nothrow, "_ZdlPvRKSt9nothrow_t",
             (void *pointer, const void *tag))
DOLLY_DELETE(dolly_delete_array_nothrow, "_ZdaPvRKSt9nothrow_t",
             (void *pointer, const void *tag))
DOLLY_DELETE(dolly_delete_aligned, "_ZdlPvSt11align_val_t",
             (void *pointer, size_t alignment))
DOLLY_DELETE(dolly_delete_array_aligned, "_ZdaPvSt11align_val_t",
             (void *pointer, size_t alignment))
DOLLY_DELETE(dolly_delete_sized_aligned, "_ZdlPvmSt11align_val_t",
             (void *pointer, size_t size, size_t alignment))
DOLLY_DELETE(dolly_delete_array_sized_aligned, "_ZdaPvmSt11align_val_t",
             (void *pointer, size_t size, size_t alignment))
DOLLY_DELETE(dolly_delete_aligned_nothrow,
             "_ZdlPvSt11align_val_tRKSt9nothrow_t",
             (void *pointer, size_t alignment, const void *tag))
DOLLY_DELETE(dolly_delete_array_aligned_nothrow,
             "_ZdaPvSt11align_val_tRKSt9nothrow_t",
             (void *pointer, size_t alignment, const void *tag))
