// Exceptions across frames, iostream and std::filesystem, printed so that two
// links of this file (shipped runtime, Dolly-built runtime) can be compared.
#include <charconv>
#include <exception>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <map>
#include <sstream>
#include <stdexcept>
#include <string>
#include <typeinfo>
#include <vector>

namespace fs = std::filesystem;

struct Trace {
  std::vector<std::string> &log;
  std::string name;
  ~Trace() { log.push_back("unwound " + name); }
};
struct Base { virtual ~Base() = default; };
struct Derived : Base { int value = 7; };
struct Failure : std::runtime_error {
  int depth;
  Failure(int depth) : std::runtime_error("failure at depth " + std::to_string(depth)), depth(depth) {}
};

[[gnu::noinline]] static void descend(std::vector<std::string> &log, int depth) {
  Trace trace{log, "frame " + std::to_string(depth)};
  if (depth == 4) throw Failure(depth);
  descend(log, depth + 1);
}

[[gnu::noinline]] static std::exception_ptr capture(std::vector<std::string> &log) {
  try {
    try { descend(log, 0); }
    catch (const std::runtime_error &error) { std::throw_with_nested(std::logic_error("outer")); }
  } catch (...) { return std::current_exception(); }
  return nullptr;
}

static void exceptions() {
  std::vector<std::string> log;
  try { std::rethrow_exception(capture(log)); }
  catch (const std::logic_error &outer) {
    std::cout << "caught " << outer.what();
    try { std::rethrow_if_nested(outer); }
    catch (const Failure &inner) { std::cout << " <- " << inner.what() << " (" << inner.depth << ")\n"; }
  }
  for (const std::string &line : log) std::cout << line << '\n';
  Derived derived;
  Base &base = derived;
  std::cout << "dynamic_cast " << dynamic_cast<Derived &>(base).value << ' ' << (typeid(base) == typeid(Derived)) << '\n';
  try { (void)std::map<int, int>{}.at(3); } catch (const std::out_of_range &) { std::cout << "out_of_range\n"; }
  try { (void)std::stoi("not a number"); } catch (const std::invalid_argument &) { std::cout << "invalid_argument\n"; }
  try { std::vector<int> huge(static_cast<std::size_t>(-1) / 2); } catch (const std::length_error &) { std::cout << "length_error\n"; }
}

static void streams() {
  std::ostringstream out;
  out << std::setw(8) << std::setfill('.') << 42 << ' ' << std::hex << std::showbase << 255 << ' '
      << std::fixed << std::setprecision(3) << 3.14159265 << ' ' << std::scientific << 6.02214076e23 << ' '
      << std::boolalpha << true;
  std::cout << out.str() << '\n';
  std::istringstream in("17 2.5 word");
  int integer; double real; std::string word;
  in >> integer >> real >> word;
  char buffer[32];
  auto [end, error] = std::to_chars(buffer, buffer + sizeof buffer, 0.1 + 0.2);
  double parsed = 0;
  std::from_chars(buffer, end, parsed);
  std::cout << integer << ' ' << real << ' ' << word << ' ' << std::string(buffer, end) << ' ' << (parsed == 0.1 + 0.2) << '\n';
  std::wostringstream wide;
  wide << L"wide " << 1234567;
  std::cout << wide.str().size() << '\n';
}

static void files() {
  const fs::path root = fs::temp_directory_path() / "llvm-runtimes-probe";
  fs::remove_all(root);
  fs::create_directories(root / "a" / "b");
  { std::ofstream(root / "a" / "one.txt") << "one\n"; std::ofstream(root / "a" / "b" / "two.txt") << "twotwo\n"; }
  fs::rename(root / "a" / "one.txt", root / "a" / "renamed.txt");
  std::map<std::string, std::uintmax_t> found;
  for (const fs::directory_entry &entry : fs::recursive_directory_iterator(root)) {
    found[entry.path().lexically_relative(root).generic_string()] = entry.is_regular_file() ? entry.file_size() : 0;
  }
  for (const auto &[name, size] : found) std::cout << name << ' ' << size << '\n';
  std::ifstream input(root / "a" / "b" / "two.txt");
  std::string line;
  std::getline(input, line);
  std::cout << line << ' ' << fs::path("/usr/lib/../include/c++/v1").lexically_normal().string() << '\n';
  try { (void)fs::file_size(root / "missing"); }
  catch (const fs::filesystem_error &error) { std::cout << "filesystem_error " << error.code().value() << '\n'; }
  std::cout << "removed " << fs::remove_all(root) << '\n';
}

int main() {
  exceptions();
  streams();
  files();
  std::cout << "RUNTIME-OK" << std::endl;
}
