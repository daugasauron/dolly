import assert from "node:assert/strict";
import { browserTest } from "./browser.mjs";
import { runCppSdkCases } from "./fixtures/cpp-sdk.mjs";

await browserTest("cpp", { image: "system" }, async ({ open }) => {
  const { submit } = await open();
  const run = async command => assert.equal(await submit(command), 0, command);
  await run("test ! -e /usr/bin/zig && test ! -e /usr/lib/zig");
  await runCppSdkCases(submit);
  // GNU Make builds in parallel and then reports the target up to date.
  await run("mkdir /tmp/make && cd /tmp/make && echo 'int value(void) { return 42; }' > value.c && " +
    "echo 'int value(void); int main(void) { return value() != 42; }' > main.c");
  await run("printf '%b\\n' 'WHERE := $(shell pwd)' 'demo: main.o value.o' '\\t$(CC) main.o value.o -o $@' " +
    "'%.o: %.c' '\\t$(CC) -O0 -c $< -o $@' 'where:' '\\ttest $(WHERE) = /tmp/make' > Makefile");
  await run("make -j8 where demo && ./demo && make -q demo");
  // Each job waits until all four have started, so only concurrent jobs finish;
  // a recursive Make gets its four through the shared jobserver.
  await run("printf '%b\\n' 'all: a b c d' 'a b c d:' '\\t@touch $@.started; " +
    "until test -e a.started -a -e b.started -a -e c.started -a -e d.started; do sleep 1; done' > rendezvous.mk");
  await run("timeout 60 make -j4 -f rendezvous.mk && rm *.started");
  await run("printf '%b\\n' 'all:' '\\t$(MAKE) -f rendezvous.mk' > recursive.mk && timeout 60 make -j4 -f recursive.mk");
  // A failing job starts nothing new; Make waits for the running one and exits 2.
  await run("printf '%b\\n' 'all: failing running' '\\ttouch all' " +
    "'failing:' '\\t@until test -e running.started; do sleep 1; done; exit 3' " +
    "'running:' '\\t@touch running.started; sleep 2; touch running' > failing.mk");
  assert.equal(await submit("timeout 60 make -j4 -f failing.mk"), 2);
  await run("test -e running && test ! -e all");
  // A rejected compile fails normally, and the next compiler runs are unaffected.
  await run("cd /tmp/make && echo '#error deliberate' > bad.cpp");
  assert.equal(await submit("c++ -c bad.cpp -o bad.o"), 1);
  // Clang recurses once per call of a chain, and LLVM's sources chain 635; a
  // Chrome Worker's own stack holds about 420 (src/process-worker.mjs).
  await run("echo 'struct S { S &next(int); int end(); }; int chain(S &s) { return s' > chain.cpp && " +
    "seq 640 | sed 's/.*/.next(&)/' >> chain.cpp && echo '.end(); }' >> chain.cpp && c++ -c chain.cpp -o chain.o");
  // Build-system probes (Meson style).
  for (const command of [
    "cc --print-search-dirs | grep -q '^libraries: =/usr/lib:/usr/lib/dolly/process$'",
    "c++ -x c++ -E -dM - < /dev/null | grep -q __cplusplus",
    "echo '#include <stddef.h>' > pre.cpp && c++ -xc++ -E -P -fpermissive pre.cpp | grep -q size_t",
    "c++ -xc++ -E -v - < /dev/null > /dev/null",
    "c++ -Wl,--version && c++ -Wl,-v",
    // Bare cc uses Clang's gnu17 default, so POSIX and BSD declarations are visible.
    "printf '#include <math.h>\\n#include <stdio.h>\\n#include <string.h>\\n#include <time.h>\\n" +
      "int main(void) { struct timespec t; return fileno(stdin) != 0 || M_PI < 3 || !strdup(\"x\") || " +
      "clock_gettime(CLOCK_MONOTONIC, &t); }\\n' > posix.c && cc posix.c -o posix && ./posix",
    "echo 'int main(void) { return 0; }' > cmake-flags.c && cc -fno-common -fPIE -ffunction-sections " +
      "-fdata-sections -funwind-tables -ftrapping-math -fno-unroll-loops -Xclang -fno-pch-timestamp " +
      "cmake-flags.c -o cmake-flags && ./cmake-flags",
    // -E sees the macros -c compiles with: the relocation model and the target features.
    "cc -E -dM - < /dev/null > macros && grep -q __PIC__ macros && grep -q __wasm_exception_handling__ macros && " +
      "test \"$(cc -fno-pic -E -dM - < /dev/null | grep -c __PIC__)\" = 0",
    // -fno-pic is static code: a program links it.
    "echo 'extern int counter; int *where(void) { return &counter; }' > static.c && " +
      "echo 'int counter; int *where(void); int main(void) { return where() != &counter; }' > static-main.c && " +
      "cc -fno-pic -c static.c -o static.o && cc static-main.c static.o -o static && ./static",
    // -ffile-prefix-map renames the directory in __FILE__, and -g names the unit after its source.
    "printf '%s\\n' '#include <stdio.h>' 'int main(void) { puts(__FILE__); }' > file.c && " +
      "cc -g -ffile-prefix-map=/tmp/make=/mapped /tmp/make/file.c -o file && test \"$(./file)\" = /mapped/file.c && " +
      "cc -g -c file.c -o file.o && test \"$(strings file.o | grep -c '<stdin>')\" = 0",
    // -fignore-exceptions compiles a frame without cleanups: an exception passes through it.
    "printf '%s\\n' '#include <cstdio>' 'struct Guard { ~Guard() { std::puts(\"cleanup\"); } };' 'void thrower();' " +
      "'void middle() { Guard guard; thrower(); }' > middle.cpp && printf '%s\\n' '#include <cstdio>' 'void middle();' " +
      "'void thrower() { throw 1; }' 'int main() { try { middle(); } catch (int) { std::puts(\"caught\"); } }' > thrower.cpp && " +
      "c++ thrower.cpp middle.cpp -o unwinds && test \"$(./unwinds | tr '\\n' ' ')\" = 'cleanup caught ' && " +
      "c++ -fignore-exceptions -c middle.cpp -o middle.o && c++ thrower.cpp middle.o -o passes && test \"$(./passes)\" = caught",
    // The root build links C programs before it has built the unwinder.
    "mv /usr/lib/dolly/process/libunwind-ww-wasmexcept.a held.a && cc cmake-flags.c -o early; status=$?; " +
      "mv held.a /usr/lib/dolly/process/libunwind-ww-wasmexcept.a && test $status = 0 && ./early",
    // -nostdlib++ leaves the C++ runtime to the link's own inputs.
    "echo 'int main() { return 0; }' > plain.cpp && c++ -nostdlib++ plain.cpp -o no-runtime && ./no-runtime && " +
      "c++ -nostdlib++ thrower.cpp middle.cpp -lc++ -o named-runtime && ./named-runtime > /dev/null",
    "echo '__DATE__ __TIME__' > date.c && SOURCE_DATE_EPOCH=0 cc -E -P date.c | grep -q '\"Jan  1 1970\" \"00:00:00\"'",
    // -MP adds a phony target per header, so Make survives a deleted header.
    "echo 'int dep;' > dep.h && echo '#include \"dep.h\"' > dep.c && cc -MD -MP -MF dep.d -c dep.c -o dep.o && " +
      "grep -q '^dep.h:' dep.d",
    // Flags Mozilla's build system adds without probing them first.
    "echo 'int main(void) { return 0; }' > moz-flags.c && cc -fno-math-errno -fomit-frame-pointer " +
      "-ffp-contract=off -mthread-model single -fno-lto " +
      "moz-flags.c -o moz-flags && ./moz-flags",
    // -msimd128 turns the unit's Wasm SIMD on; the intrinsics header needs it.
    "printf '%s\\n' '#include <wasm_simd128.h>' 'int main(void) { v128_t v = wasm_i32x4_splat(3);' " +
      "'return wasm_i32x4_extract_lane(wasm_i32x4_add(v, v), 2) == 6 ? 0 : 1; }' > simd.c && " +
      "cc -msimd128 simd.c -o simd && ./simd",
    "echo 'int main(int argc, char **argv) { return argc == 0; }' > sanity.cpp && " +
      "c++ -D_FILE_OFFSET_BITS=64 -o sanity sanity.cpp -D_FILE_OFFSET_BITS=64 && ./sanity",
    "echo 'extern int host(void); int extension(void) { return host(); }' > extension.c && " +
      "cc -shared -fPIC -Wl,--allow-shlib-undefined extension.c -o extension.so && test -s extension.so",
  ]) await run(command);
  // Static code cannot go into a shared object, and a C++ program needs a C++ runtime.
  assert.notEqual(await submit("cc -shared static.o -o static.so"), 0);
  assert.notEqual(await submit("c++ -nostdlib++ thrower.cpp middle.cpp -o no-runtime"), 0);
  // Clang's driver refuses a single thread model next to -pthread; so does cc.
  assert.equal(await submit("cc -pthread -mthread-model single -c moz-flags.c -o moz-flags.o"), 64);
  await run("cd / && rm -rf /tmp/make");
});
