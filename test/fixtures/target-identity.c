// The compile target's identity (tasks/20261005-133402-target-identity).
#include <dolly/process.h>
#include <errno.h>
#include <fcntl.h>
#include <sys/stat.h>

#if !defined(__dolly__) || defined(__EMSCRIPTEN__) || defined(__EMSCRIPTEN_PTHREADS__) || \
    defined(EMSCRIPTEN) || defined(__linux__) || !defined(__unix__) || !defined(__wasm64__)
#error "a Dolly program sees __dolly__, __unix__ and __wasm64__, and no other platform's macro"
#endif

int main(int argc, char **argv) {
  // The libc headers and the linked libc agree on the layout of struct stat,
  // and a failure carries the contract's error number.
  struct stat status;
  return argc != 2 || stat(argv[1], &status) != 0 || status.st_size != 5 || !S_ISREG(status.st_mode) ||
      open("/target-identity-missing", O_RDONLY) != -1 || errno != DOLLY_PROCESS_ENOENT;
}
