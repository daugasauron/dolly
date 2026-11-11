#include <dolly/dso.h>
#include <dlfcn.h>
#include <new>
#include <stdexcept>
#include <string>
static void handler() {}
int main(int argc, char **argv) {
    if (argc != 2) return 1;
    void *module = dolly_dlopen(argv[1], RTLD_NOW | RTLD_LOCAL);
    if (!module) return 2;
    auto get_handler = reinterpret_cast<std::new_handler (*)()>(dolly_dlsym(module, "cpp_sdk_handler"));
    auto throw_error = reinterpret_cast<void (*)()>(dolly_dlsym(module, "cpp_sdk_throw"));
    auto check = reinterpret_cast<int (*)()>(dolly_dlsym(module, "cpp_sdk_check"));
    if (!get_handler || !throw_error || !check) return 3;
    // The library's own catch clauses match the exceptions thrown in it.
    if (check() != 42) return 7;
    std::set_new_handler(handler);
    if (get_handler() != handler) return 4;
    try { throw_error(); return 5; }
    catch (const std::runtime_error &error) { if (std::string(error.what()) != "cross-dso") return 6; }
    return dolly_dlclose(module) != 0;
}
