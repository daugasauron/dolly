# A static reference bound to a temporary traps at exit: function signature mismatch (yaml-cpp's Emitter)

- STATUS: OPEN
- PRIORITY: 200
- TAGS: bug,compiler,packages

Found by the `yaml-cpp` package's amy case (`20261117-213939`, 2026-11-18, `ws/packages`). This
program, built by the cc package in a default session (`c++ -O1 /tmp/tmp.cpp -o /tmp/tmp`), exits
0 on the host (g++) and in Dolly fails after `main` returns, in Chromium (`dolly: process 112
failed: function signature mismatch`, status 126):

```cpp
#include <string>
struct R { std::string s; explicit R(const char *t) : s(t) {} ~R() {} R operator|(const R &o) const { return R((s + o.s).c_str()); } };
static const R &get() { static const R &r = R("a") | R("b"); return r; }
int main() { return get().s.size() == 2 ? 0 : 1; }
```

A function-local static object of the same type (`static const R r("static")`) exits 0. The
temporary's lifetime is extended to the program's, so its destructor runs at exit through
`__cxa_atexit`; in WebAssembly's C++ ABI a destructor returns `this`, and an indirect call of
another type traps. In Clang's source at the compiler's pin (`DOLLY_LLVM_COMMIT`, `4bfd08c2d769`), a static
object's destructor goes through a helper when the target cannot call mismatched function types
(`CanRegisterDestructor` in `EmitDeclDestroy`, `clang/lib/CodeGen/CGDeclCXX.cpp`), but
`pushTemporaryCleanup` (`clang/lib/CodeGen/CGExpr.cpp`, case `SD_Static`) registers a
lifetime-extended temporary's complete destructor itself unless the temporary is an array, so
`__cxa_atexit` (musl's) calls a `this`-returning function as `void (*)(void *)`. That reading makes
it Clang's on every WebAssembly target; the fix is the compiler's (the seed's): there, the helper
(`generateDestroyHelper`, whose argument is null) for any type whose complete destructor returns
`this` where the ABI cannot call mismatched function types, as `EmitDeclDestroy` decides.

yaml-cpp 0.8.0 meets it in `src/emitterutils.cpp` (`static const RegEx& disallowed_flow = ...`,
`disallowed_block`), on the path that emits a string: a program that emits `out << "a"` with a
`YAML::Emitter` prints its YAML, reaches the end of `main` and then traps (Firefox: `indirect
call signature mismatch`); one that emits only `BeginSeq << 1 << EndSeq`, or parses with
`YAML::Load`, exits 0. The `yaml-cpp` package's case parses only, and OpenColorIO's case parses
its built-in configuration without serializing one, until this is fixed.

## Done when

The program above exits 0 in Chromium and Firefox, and the `yaml-cpp` case emits a string and
parses it again.
