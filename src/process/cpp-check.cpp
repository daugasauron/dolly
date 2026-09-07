#include <cstdio>
#include <iostream>
#include <locale>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

static const std::locale startup_locale;
static thread_local std::string startup_text = "private";

int main() {
  std::wstringstream wide;
  wide.imbue(startup_locale);
  wide << L"Dolly " << 42;
  if (wide.str() != L"Dolly 42" || startup_text != "private") return 2;
  std::vector<std::string> values = {"private", "c++23", "process"};
  try {
    if (values.size() != 3) throw std::runtime_error("bad C++ process state");
  } catch (const std::exception &error) {
    std::fprintf(stderr, "process-cpp-check: %s\n", error.what());
    return 1;
  }
  std::cout << "PROCESS-CXX23-OK\n";
  return 0;
}
