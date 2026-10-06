/* CPython asks libc for getentropy; Dolly's libc provides getrandom. */

#include <stddef.h>
#include <sys/random.h>
#include <sys/types.h>

int getentropy(void *buffer, size_t length) {
    ssize_t count = getrandom(buffer, length, 0);
    return count == (ssize_t)length ? 0 : -1;
}
