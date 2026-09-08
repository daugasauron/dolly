import assert from "node:assert/strict";
import { shellQuote } from "./slop-cases.mjs";

const source = `#include <stdexcept>
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
`;
const dsoHost = `#include <dolly/runtime.h>
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
    if (!get_handler || !throw_error) return 3;
    std::set_new_handler(handler);
    if (get_handler() != handler) return 4;
    try { throw_error(); return 5; }
    catch (const std::runtime_error &error) { if (std::string(error.what()) != "cross-dso") return 6; }
    return dolly_dlclose(module) != 0;
}
`;
const pythonExtension = `#include <Python.h>
extern "C" int cpp_sdk_check();
static PyObject *answer(PyObject *, PyObject *) { return PyLong_FromLong(cpp_sdk_check()); }
static PyMethodDef methods[] = {{"answer", answer, METH_NOARGS, nullptr}, {nullptr}};
static PyModuleDef module = {PyModuleDef_HEAD_INIT, "cpp_sdk", nullptr, -1, methods};
PyMODINIT_FUNC PyInit_cpp_sdk() { return PyModule_Create(&module); }
`;

export async function runCppSdkCases(submit, python) {
  const scratch = "/tmp/dolly-cpp-sdk-test";
  const run = async command => assert.equal(await submit(command), 0, command);
  const write = (name, text) => run(`printf '%s\\n' ${text.trimEnd().split("\n").map(shellQuote).join(" ")} > ${scratch}/${name}`);
  await run(`mkdir -p ${scratch}`);
  try {
    await run(`mkdir ${scratch}/after ${scratch}/first`);
    await write("after/stdio.h", "#error after includes must not shadow system headers");
    await write("after/priority.h", "#error after includes must not shadow user headers");
    await write("first/priority.h", "#define PRIORITY 42");
    await write("after/only-after.h", "#define AFTER 42");
    await write("includes.c", "#include <stdio.h>\n#include <priority.h>\n#include <only-after.h>\nint main(void) { return AFTER != PRIORITY; }");
    for (const option of [`-idirafter ${scratch}/after`, `-idirafter${scratch}/after`]) {
      await run(`cc ${option} -I${scratch}/first ${scratch}/includes.c -o ${scratch}/includes`);
      await run(`${scratch}/includes`);
    }
    assert.equal(await submit("cc -idirafter"), 64);
    await write("main.cpp", source);
    await run(`c++ -O1 -c ${scratch}/main.cpp -o ${scratch}/main.o`);
    for (const link of ["c++", "c++ -lc++ -lc++abi", "cc -lc++ -lc++abi",
      "cc -Wl,-lc++,-lc++abi", "cc -Wl,-l,c++,-l,c++abi"]) {
      await run(`${link} ${scratch}/main.o -o ${scratch}/main`);
      await run(`${scratch}/main`);
    }
    await run(`c++ -O1 -DDOLLY_CPP_LIBRARY -c ${scratch}/main.cpp -o ${scratch}/library.o`);
    await run(`c++ -shared ${scratch}/library.o -lc++ -lc++abi -o ${scratch}/library.so`);
    await write("host.cpp", dsoHost);
    await run(`c++ -O1 -rdynamic ${scratch}/host.cpp -o ${scratch}/host`);
    await run(`${scratch}/host ${scratch}/library.so`);
    if (python) {
      await write("python.cpp", pythonExtension);
      await run(`c++ -O1 -shared -I /usr/include/python3.14 ${scratch}/python.cpp ${scratch}/library.o -lc++ -lc++abi -o ${scratch}/cpp_sdk.so`);
      await run(`PYTHONPATH=${scratch} python -c 'import cpp_sdk; assert cpp_sdk.answer() == 42'`);
    }
    await write("plugin.cpp", 'extern "C" int plugin_answer() { return 42; }\n');
    await run(`c++ -shared --dolly-kernel-plugin ${scratch}/plugin.cpp -o ${scratch}/plugin.so`);
    assert.equal(await submit(`c++ -shared --dolly-kernel-plugin ${scratch}/plugin.cpp -lc++ -o ${scratch}/unsupported.so`), 64);
    await run(`test ! -e ${scratch}/unsupported.so && test ! -e /usr/lib/libc++.a && test ! -e /usr/lib/libc++abi.a`);
    await write("constructor.c", 'extern int count; __attribute__((constructor)) static void initialize(void) { count = 42; }\n');
    await write("constructor-main.c", 'int count; int main(void) { return count != 42; }\n');
    await run(`cc -c ${scratch}/constructor.c -o ${scratch}/constructor.o`);
    await run(`ar rcs ${scratch}/libconstructor.a ${scratch}/constructor.o`);
    await run(`cc ${scratch}/constructor-main.c -L${scratch} -Wl,--whole-archive,-lconstructor,--no-whole-archive -o ${scratch}/constructor`);
    await run(`${scratch}/constructor`);
  } finally {
    await submit(`rm -rf ${scratch}`);
  }
}
