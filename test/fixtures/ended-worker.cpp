// A thread exits the process while the main thread joins it from a
// destructor, which lets no exception pass: what ends the main thread's call
// must not come back as abort, exit and another call, each one deeper
// (tasks/20261101-102515-retained-process-memory).
#include <cstdlib>
#include <pthread.h>
#include <unistd.h>

static void *leave(void *) {
  usleep(20000);
  exit(0);
}

struct joiner {
  pthread_t thread;
  ~joiner() { pthread_join(thread, nullptr); }
};

int main() {
  joiner joining;
  return pthread_create(&joining.thread, nullptr, leave, nullptr) ? 2 : 0;
}
