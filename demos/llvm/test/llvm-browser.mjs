// The Dolly-built C++ runtime (llvm-runtimes) in place of the shipped archives,
// in Chrome and Firefox. Three executables and a kernel plugin are linked both
// ways: the linker's trace shows which libc++, libc++abi, libunwind and builtins
// it loaded, and the two results are the same bytes. Then LLVM's TableGen,
// configured as the llvm-tablegen recipe configures it, is linked with the
// built runtime and reproduces the outputs the image kept.
// Usage: node demos/llvm/test/llvm-browser.mjs [chromium|firefox ...], after
// DOLLY_BUILD_IMAGES=llvm-tablegen,llvm-runtimes npm run image.
import { readFile } from "node:fs/promises";
import { demoTest } from "../../browser.mjs";
import { inspectDollyfile } from "../../../src/dollyfile-view.mjs";
import { CANONICAL_ORIGIN } from "../../../src/static-asset.mjs";
import { DOLLY_IMAGES } from "../../../dist/dolly-images.mjs";

const browsers = process.argv.length > 2 ? process.argv.slice(2) : ["chromium", "firefox"];
const pin = name => {
  const { dollyfile, sha256 } = DOLLY_IMAGES.find(definition => definition.image === name);
  return `${CANONICAL_ORIGIN}/${dollyfile} ${sha256}`;
};
// llvm-tablegen with the terminal display, the runtime package and threads.
const hosts = [...new Set([...DOLLY_IMAGES.find(({ image }) => image === "llvm-tablegen").hostRequirements, "threads@0"])].sort();
const recipe = ["DOLLY 6", "APPLICATION llvm-runtimes-probe", ...hosts.map(host => `REQUIRES HOST ${host}`), `FROM ${pin("llvm-tablegen")}`,
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

for (const browser of browsers) {
  await demoTest("llvm", { image: "llvm-tablegen", timeout: 2_400_000, browser, server: { fixtures: {
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
