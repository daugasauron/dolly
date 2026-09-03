/* Dolly replacements for CPython's browser-embedding signal globals.
 *
 * CPython's Emscripten implementation imports JavaScript helpers and an
 * embedder-owned SharedArrayBuffer. Dolly instead delivers cancellation at
 * compiler-inserted command safepoints, so these Python-specific hooks stay
 * disabled and do not enlarge the browser import contract.
 */

#include <errno.h>
#include <stddef.h>

#include <dolly/runtime.h>

#include "Python.h"

int Py_EMSCRIPTEN_SIGNAL_HANDLING = 0;
int _Py_emscripten_signal_clock = 50;
__attribute__((visibility("hidden"))) unsigned __default_guardsize = 0;

void _Py_CheckEmscriptenSignals(void) {}
void _Py_CheckEmscriptenSignalsPeriodically(void) {}

int times(void *buffer) {
    (void)buffer;
    errno = ENOSYS;
    return -1;
}

int getentropy(void *buffer, size_t length) {
    ssize_t count = dolly_getrandom(buffer, length, 0);
    return count == (ssize_t)length ? 0 : -1;
}

int pause(void) {
    errno = EINTR;
    return -1;
}
