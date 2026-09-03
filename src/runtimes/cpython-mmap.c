/* Narrow CPython mmap compatibility above Dolly's stable substrate.
 *
 * Emscripten lowers three optional mmap operations into implementation-specific
 * env imports. Read-only WasmFS mappings need none of them, which is the use
 * required by Python packaging. Keep advice a no-op and make mutation-oriented
 * synchronization/remapping fail explicitly instead of widening dolly-0.
 */

#include <errno.h>
#include <stddef.h>
#include <sys/mman.h>

int dolly_py_msync(void *address, size_t length, int flags) {
    (void)address;
    (void)length;
    (void)flags;
    errno = ENOSYS;
    return -1;
}

int dolly_py_madvise(void *address, size_t length, int advice) {
    (void)address;
    (void)length;
    (void)advice;
    return 0;
}

void *dolly_py_mremap(void *old_address, size_t old_size, size_t new_size,
                      int flags, ...) {
    (void)old_address;
    (void)old_size;
    (void)new_size;
    (void)flags;
    errno = ENOSYS;
    return MAP_FAILED;
}
