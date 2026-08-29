#include <array>
#include <cstdio>
#include <span>
#include <string_view>

int main(int argc, char **argv) {
  using namespace std::literals;
  constexpr auto expected = "written by an independently linked wasm64 module\n"sv;
  std::array<char, 64> storage{};

  if (argc != 2) {
    std::fputs("usage: cpp-check FILE\n", stderr);
    return 64;
  }

  std::FILE *file = std::fopen(argv[1], "rb");
  if (file == nullptr) {
    std::perror("c++: fopen");
    return 1;
  }

  const std::span<char> buffer{storage};
  const std::size_t received = std::fread(buffer.data(), 1, buffer.size(), file);
  if (std::fclose(file) != 0) {
    std::perror("c++: fclose");
    return 2;
  }

  const std::string_view actual{buffer.data(), received};
  if (actual != expected) {
    std::fputs("c++: shared file contents did not match\n", stderr);
    return 3;
  }

  std::printf("c++23: span/string_view module observed %zu bytes from WasmFS\n", received);
  return 0;
}
