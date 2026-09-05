#include <cstdio>
#include <stdexcept>
#include <string>
#include <vector>

int main() {
  std::vector<std::string> values = {"private", "c++23", "process"};
  try {
    if (values.size() != 3) throw std::runtime_error("bad C++ process state");
  } catch (const std::exception &error) {
    std::fprintf(stderr, "process-cpp-check: %s\n", error.what());
    return 1;
  }
  std::puts("PROCESS-CXX23-OK");
  return 0;
}
