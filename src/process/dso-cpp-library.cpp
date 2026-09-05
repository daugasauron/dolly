#include <functional>
#include <unordered_map>

namespace {

int increment(int value) { return value + 1; }

// This deliberately exercises preemptible weak template definitions. wasm-ld
// represents several of these as both definitions and imports in a shared
// object; the process loader must bind those imports back to this DSO.
std::unordered_map<int, std::function<int(int)>> functions = {{1, increment}};

}  // namespace

extern "C" int dolly_process_cpp_dso_answer(void) {
  return functions.at(1)(41);
}
