#include <thread>
#include <mutex>
#include <condition_variable>
#include <atomic>
#include <vector>
#include <cassert>
#include <cstdio>
#include <stdexcept>

static std::mutex mutex;
static std::condition_variable wake;
static bool ready;
static std::atomic<int> destroyed;
struct Local { int value = 17; ~Local() { ++destroyed; } };
static thread_local Local local;

int main() {
  std::vector<std::thread> workers;
  int counter = 0;
  auto main_id = std::this_thread::get_id();
  for (int i = 0; i < 4; ++i) workers.emplace_back([&, i] {
    assert(std::this_thread::get_id() != main_id && local.value == 17);
    local.value = i;
    { std::unique_lock<std::mutex> lock(mutex); wake.wait(lock, [] { return ready; }); }
    for (int j = 0; j < 100; ++j) {
      try { throw std::runtime_error("thread exception"); }
      catch (const std::runtime_error &) { std::lock_guard<std::mutex> lock(mutex); ++counter; }
    }
    assert(local.value == i);
  });
  { std::lock_guard<std::mutex> lock(mutex); ready = true; }
  wake.notify_all();
  for (auto &worker : workers) worker.join();
  assert(counter == 400 && destroyed == 4);
  std::puts("STD-THREAD-OK condition mutex exceptions TLS destructors");
}
