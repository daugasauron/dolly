#include <stdexcept>
#include <new>
#include <string>
#include <vector>
struct Base { virtual ~Base() = default; };
struct Derived : Base { int answer = 42; };
struct Guard { int &count; ~Guard() { ++count; } };
extern "C" int cpp_sdk_check() {
    std::vector<std::string> words{std::string(200, 'x'), "c++23"};
    if (words[0].size() != 200 || words[1] != "c++23") return 1;
    int destroyed = 0;
    try { Guard guard{destroyed}; throw std::runtime_error("checked"); }
    catch (const std::exception &error) { if (std::string(error.what()) != "checked") return 2; }
    if (destroyed != 1) return 3;
    try { (void)words.at(9); return 4; } catch (const std::out_of_range &) {}
    try { throw 42; } catch (int thrown) { if (thrown != 42) return 6; }
    Derived derived;
    Base *base = &derived;
    auto *value = dynamic_cast<Derived *>(base);
    return value ? value->answer : 5;
}
extern "C" std::new_handler cpp_sdk_handler() { return std::get_new_handler(); }
extern "C" void cpp_sdk_throw() { throw std::runtime_error("cross-dso"); }
#ifndef DOLLY_CPP_LIBRARY
int main() { return cpp_sdk_check() == 42 ? 0 : 1; }
#endif
