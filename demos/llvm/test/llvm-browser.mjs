// The compiler built inside Dolly, as the llvm-cc image installs it: cc, c++
// and ar build programs that run. Usage: node demos/llvm/test/llvm-browser.mjs
import { demoTest, displayProbe, writeCommand } from "../../browser.mjs";

const cxx = `#include <iostream>
#include <stdexcept>
#include <vector>
extern "C" int twice(int);
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

// LLVM itself, as the llvm package installs it into a default session: its
// binary tools read what cc wrote, opt and llc take cc's IR to a program that
// runs, and a program built against LLVM's libraries with llvm-config runs.
const builder = `#include "llvm/IR/IRBuilder.h"
#include "llvm/IR/LLVMContext.h"
#include "llvm/IR/Module.h"
#include "llvm/IR/Verifier.h"
#include "llvm/Support/raw_ostream.h"
int main() {
  llvm::LLVMContext context;
  llvm::Module module("built", context);
  llvm::IRBuilder<> builder(context);
  auto *answer = llvm::Function::Create(llvm::FunctionType::get(builder.getInt32Ty(), false),
    llvm::Function::ExternalLinkage, "answer", module);
  builder.SetInsertPoint(llvm::BasicBlock::Create(context, "entry", answer));
  builder.CreateRet(builder.getInt32(42));
  if (llvm::verifyModule(module, &llvm::errs())) return 1;
  module.print(llvm::outs(), nullptr);
}
`;
for (const browser of ["chromium", "firefox"]) {
  await demoTest("llvm package", { image: "default", browser, timeout: 900_000 }, async ({ server, open }) => {
    const { run } = await open({ policy: { rules: [{ origin: server.origin, path: "/amy-index.txt", methods: ["GET"] }] } });
    await run("amy install llvm && mkdir /tmp/llvm-test && cd /tmp/llvm-test");
    await run("echo 'int twice(int value) { return 2 * value; }' > twice.c && cc -O2 -c twice.c -o twice.o");
    await run("llvm-nm twice.o | grep -q ' T twice$' && llvm-objdump -d twice.o | grep -q '<twice>:' && " +
      "llvm-readobj --sections twice.o | grep -q 'Type: CODE'");
    await run('llvm-ar rc libtwice.a twice.o && llvm-ranlib libtwice.a && test "$(llvm-ar t libtwice.a)" = twice.o');
    await run(writeCommand("main.c", '#include <stdio.h>\nint twice(int);\nint main(void) { printf("LLC-OK %d\\n", twice(6)); }\n'));
    // cc writes bitcode when cc1 is asked to (-Xclang); its functions carry cc's target features.
    await run("cc -O0 -c -Xclang -emit-llvm-bc main.c -o main.bc && opt -O2 main.bc -o main.opt.bc && " +
      "llvm-dis main.opt.bc -o - | grep -q '@twice' && llc -filetype=obj main.opt.bc -o main.o && " +
      'cc main.o -L. -ltwice -o main && test "$(./main)" = "LLC-OK 12"');
    await run('test "$(llvm-config --targets-built)" = WebAssembly && test "$(llvm-config --prefix)" = /usr/lib/llvm');
    await run(writeCommand("builder.cpp", builder));
    await run("c++ $(llvm-config --cxxflags) -include endian.h builder.cpp $(llvm-config --ldflags --libs core) -o builder && " +
      "./builder | grep -q 'ret i32 42'");
    await run("cd / && rm -r /tmp/llvm-test");
  });
}

// The runtime built inside Dolly (llvm-runtimes) in place of the shipped
// archives, with that compiler. Three executables and a kernel plugin are
// linked both ways: the linker's trace shows which libc++, libc++abi, libunwind
// and builtins it loaded, and the two results are the same bytes. Then LLVM's
// TableGen, configured as the llvm-tablegen recipe configures it, is linked
// with the built runtime and reproduces the outputs the image kept.
import { readFile } from "node:fs/promises";
import { inspectDollyfile } from "../../../src/dollyfile-view.mjs";
import { siteReference } from "../../../src/static-asset.mjs";
import { DOLLY_IMAGES } from "../../../dist/dolly-images.mjs";

const pin = name => {
  const { dollyfile, sha256 } = DOLLY_IMAGES.find(definition => definition.image === name);
  return `${siteReference(dollyfile)} ${sha256}`;
};
// llvm-cc with the terminal display, the runtime package and threads.
const hosts = [...new Set([...DOLLY_IMAGES.find(({ image }) => image === "llvm-cc").hostRequirements, "threads@0"])].sort();
const recipe = ["DOLLY 7", "APPLICATION llvm-runtimes-probe", ...hosts.map(host => `REQUIRES HOST ${host}`), `FROM ${pin("llvm-cc")}`,
  ...["/usr/lib/libdisplay.so", "/usr/share/fonts/IosevkaTerm-SemiBold.ttf"].map(path => `COPY ${pin("ghostty-build")} ${path} ${path}`),
  `INSTALL ${pin("llvm-runtimes")}`, "EXPORTS LIB display /usr/lib/libdisplay.so", "EXPORTS ENV DISPLAY /usr/lib/libdisplay.so",
  "ENTRY /bin/foreground -i /bin/slop", ""].join("\n");
const built = "-L/usr/lib/llvm-runtimes";
const shipped = "'/usr/lib/(libclang_rt|dolly/process/.*lib(c\\+\\+|c\\+\\+abi|unwind|clang_rt\\.builtins)-)'";
// Output, compile command, and what selects the shipped and the built archives.
// -L/usr/lib changes nothing: both links have as many inputs and one output
// name. A -rdynamic host exports the runtime, so its link takes nearly every
// member. A kernel plugin's builtins are named by path; an archive named first wins.
const links = [
  ["runtime", "c++ -O1 -std=c++20 runtime.cpp", "-L/usr/lib", built],
  ["threads", "c++ -O1 -pthread threads.cpp", "-L/usr/lib", built],
  ["host", "c++ -O1 -std=c++20 -rdynamic runtime.cpp", "-L/usr/lib", built],
  ["plugin.so", "cc -O1 --dolly-kernel-plugin -shared plugin.c", "/usr/lib/libclang_rt.builtins.a", "/usr/lib/llvm-runtimes/libclang_rt.builtins.a"],
];
const tablegen = new URL("../Dollyfile-llvm-tablegen", import.meta.url);
const configure = inspectDollyfile(await readFile(tablegen, "utf8"), tablegen.href).rows
  .find(row => row.directive === "SLOP" && row.args.startsWith("time cmake ")).args;

for (const browser of ["chromium", "firefox"]) {
  await demoTest("llvm-runtimes", { image: "llvm-cc", timeout: 2_400_000, browser, server: { fixtures: {
    "runtime.cpp": "demos/llvm/test/fixtures/runtime.cpp", "threads.cpp": "test/fixtures/threads-cpp.cpp" } } }, async ({ server, open }) => {
    const { run } = await open({ path: "/custom/rebuild/",
      policy: { rules: ["/fixture/", "/dist/static/llvm/"].map(pathPrefix => ({ origin: server.origin, pathPrefix, methods: ["GET"] })) },
      setup: page => page.addInitScript(recipe => sessionStorage.setItem("dolly-custom-source", recipe), recipe) });
    await run("mkdir /tmp/probe && cd /tmp/probe && echo '__int128 multiply(__int128 a, __int128 b) { return a * b; }' > plugin.c");
    for (const name of ["runtime", "threads"]) await run(`curl -fsS ${server.origin}/fixture/${name}.cpp -o ${name}.cpp`);
    for (const [output, compile, usual, other] of links) {
      await run(`${compile} ${usual} -Wl,--trace -o ${output} > shipped.trace && mv ${output} shipped`);
      await run(`${compile} ${other} -Wl,--trace -o ${output} > built.trace`);
      // The usual link loads members of the shipped archives; the other loads none of them.
      await run(`grep -q -E ${shipped} shipped.trace && test "$(grep -c -E ${shipped} built.trace)" = 0`);
      await run(`grep -q 'llvm-runtimes/libclang_rt' built.trace && cmp shipped ${output}`);
    }
    await run("./runtime | grep -q RUNTIME-OK && ./threads | grep -q STD-THREAD-OK && ./host | grep -q RUNTIME-OK");
    const source = `${server.origin}/dist/static/llvm`;
    await run(`curl -fsS ${source}/llvm-project.tar.gz | gzip -dc | tar -xf - -C / && curl -fsS ${source}/llvm-host-triple.patch -o host-triple.patch`);
    await run(`patch -p1 -d /tmp/llvm-project -i /tmp/probe/host-triple.patch && ${configure} '-DCMAKE_EXE_LINKER_FLAGS=${built} -Wl,--trace'`);
    await run("cd /tmp/llvm-build && make -j2 llvm-tblgen WebAssemblyCommonTableGen > make.log");
    await run(`test "$(grep -c -E ${shipped} make.log)" = 0 && grep -q 'llvm-runtimes/libclang_rt' make.log`);
    await run("for inc in lib/Target/WebAssembly/*.inc; do cmp $inc /usr/share/llvm-tablegen/$inc || exit 1; done; " +
      "test $(ls lib/Target/WebAssembly/*.inc | wc -l) -gt 5");
  });
}
