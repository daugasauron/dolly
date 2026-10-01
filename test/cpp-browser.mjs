import assert from "node:assert/strict";
import { browserTest } from "./browser.mjs";
import { runCppSdkCases } from "./fixtures/cpp-sdk.mjs";

await browserTest("cpp", {}, async ({ open }) => {
  const { submit } = await open();
  const run = async command => assert.equal(await submit(command), 0, command);
  await run("test ! -e /usr/bin/zig && test ! -e /usr/lib/zig");
  await runCppSdkCases(submit, false);
  // GNU Make runs parallel recipes through Slop and then reports the target up to date.
  await run("mkdir /tmp/make && cd /tmp/make && echo 'int value(void) { return 42; }' > value.c && " +
    "echo 'int value(void); int main(void) { return value() != 42; }' > main.c");
  await run("printf '%b\\n' 'WHERE := $(shell pwd)' 'demo: main.o value.o' '\\t$(CC) main.o value.o -o $@' " +
    "'%.o: %.c' '\\t$(CC) -O0 -c $< -o $@' 'where:' '\\ttest $(WHERE) = /tmp/make' > Makefile");
  await run("make -j8 where demo && ./demo && make -q demo");
  // A rejected compile fails normally, and the next compiler runs are unaffected.
  await run("cd /tmp/make && echo '#error deliberate' > bad.cpp");
  assert.equal(await submit("c++ -c bad.cpp -o bad.o"), 1);
  // Build-system probes (Meson style).
  for (const command of [
    "cc --print-search-dirs | grep -q '^libraries: =/usr/lib:/usr/lib/dolly/process$'",
    "c++ -x c++ -E -dM - < /dev/null | grep -q __cplusplus",
    "echo '#include <stddef.h>' > pre.cpp && c++ -xc++ -E -P -fpermissive pre.cpp | grep -q size_t",
    "c++ -xc++ -E -v - < /dev/null > /dev/null",
    "c++ -Wl,--version && c++ -Wl,-v",
    "echo 'int main(void) { return 0; }' > cmake-flags.c && cc -fno-common -fPIE -ffunction-sections " +
      "-fdata-sections -funwind-tables -ftrapping-math -Xclang -fno-pch-timestamp cmake-flags.c -o cmake-flags && ./cmake-flags",
    "echo 'int main(int argc, char **argv) { return argc == 0; }' > sanity.cpp && " +
      "c++ -D_FILE_OFFSET_BITS=64 -o sanity sanity.cpp -D_FILE_OFFSET_BITS=64 && ./sanity",
    "echo 'extern int host(void); int extension(void) { return host(); }' > extension.c && " +
      "cc -shared -fPIC -Wl,--allow-shlib-undefined extension.c -o extension.so && test -s extension.so",
  ]) await run(command);
  await run("cd / && rm -rf /tmp/make");
});
