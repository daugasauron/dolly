// A library a threaded host loads while its other threads run: functions, a
// table of pointers in its data, a constructor, thread-locals and a catch.
#include <stdexcept>

static int constructed;
__attribute__((constructor)) static void construct() { ++constructed; }
static thread_local int calls = 5;

extern "C" {
int twice(int value) { return 2 * value; }
static int add_one(int value) { return value + 1; }
int (*operations[2])(int) = {twice, add_one};
// 6 at a thread's first call, in every thread.
int count_call() { return ++calls; }
int constructions() { return constructed; }
int caught(int value) {
  try {
    throw std::out_of_range("caught in the library");
  } catch (const std::out_of_range &) {
    return value;
  } catch (...) {
    return -1;
  }
}
}
