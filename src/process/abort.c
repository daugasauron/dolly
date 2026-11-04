#include <dolly/runtime.h>
#include <signal.h>
#include <stdlib.h>

/* As POSIX says, SIGABRT's handler runs unless the signal is blocked, and if
 * it returns, or the signal is blocked or ignored, the process ends by
 * SIGABRT. Emscripten's abort traps instead: the process failed with 126.
 * An archive member of its own, as in any libc, so that a program that defines
 * abort itself (SpiderMonkey's mozalloc does) links with its own. Weak while
 * the pinned seed compiler links libdolly-process.a whole. */
__attribute__((__weak__)) _Noreturn void abort(void) {
  raise(SIGABRT);
  dolly_exit_signal(SIGABRT);
}
