// The compiler built inside Dolly, as the llvm-cc image installs it: cc, c++
// and ar build programs that run. Usage: node demos/llvm/test/llvm-browser.mjs
import { demoTest, displayProbe, writeCommand } from "../../browser.mjs";

const cxx = `#include <iostream>
#include <stdexcept>
#include <vector>
int twice(int);
int main() {
  std::vector<int> values = {1, 2, 3};
  int total = 0;
  for (int value : values) total += twice(value);
  try { throw std::runtime_error("thrown"); }
  catch (const std::exception &error) { std::cout << "CXX-OK " << total << " " << error.what() << "\\n"; }
}
`;
for (const browser of ["chromium", "firefox"]) {
  await demoTest("llvm-cc", { image: "llvm-cc", browser, timeout: 600_000 }, async ({ open }) => {
    const { run } = await open(await displayProbe("llvm-cc"));
    await run("mkdir /tmp/llvm-test && cd /tmp/llvm-test");
    await run("echo 'int twice(int value) { return 2 * value; }' > twice.c && cc -c twice.c -o twice.o && ar rcs libtwice.a twice.o");
    await run(writeCommand("main.cpp", cxx));
    await run('c++ main.cpp -L. -ltwice -o main && test "$(./main)" = "CXX-OK 12 thrown"');
    // The self-built compiler has LLVM's own deepest call chain to spare (MSP430.cpp: 635).
    await run("echo 'struct S { S &next(int); int end(); }; int chain(S &s) { return s' > chain.cpp && " +
      "seq 640 | sed 's/.*/.next(&)/' >> chain.cpp && echo '.end(); }' >> chain.cpp && c++ -c chain.cpp -o chain.o");
    await run("cd / && rm -r /tmp/llvm-test");
  });
}
