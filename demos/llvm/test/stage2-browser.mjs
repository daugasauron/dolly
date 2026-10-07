// The compiler built inside Dolly reproduces itself. In the llvm-cc image,
// whose cc it is, llvm-build's own rows run again; every archive, the compiler
// and the TableGen tools must then be the first stage's bytes. A third stage
// would be this test again. On demand, not in the catalog: about 50 minutes
// and 7 GB in Chrome. Usage: node demos/llvm/test/stage2-browser.mjs
import { readFile } from "node:fs/promises";
import { demoTest, displayProbe } from "../../browser.mjs";
import { inspectDollyfile } from "../../../src/dollyfile-view.mjs";

const rows = async name => {
  const recipe = new URL(`../Dollyfile-${name}`, import.meta.url);
  return inspectDollyfile(await readFile(recipe, "utf8"), recipe.href).rows;
};
const build = await rows("llvm-build");
// llvm-build's rows up to its make, then the driver's sources as llvm-cc takes them.
const steps = [...build.slice(0, build.findIndex(row => row.args.includes(" make ")) + 1),
  ...(await rows("llvm-cc")).filter(row => row.directive === "SOURCE" && row.args.includes(" /tmp/dolly-compiler/"))];

await demoTest("llvm stage 2", { image: "llvm-cc", timeout: 7_200_000 }, async ({ server, open }) => {
  const { run } = await open({ ...await displayProbe("llvm-cc"),
    policy: { rules: [{ origin: server.origin, pathPrefix: "/dist/static/llvm/", methods: ["GET"] }] } });
  for (const { directive, args } of steps) {
    if (directive === "SOURCE") {
      const [url, , path] = args.split(" ");
      await run(`mkdir -p ${path.slice(0, path.lastIndexOf("/"))} && curl -fsS ${server.origin}${new URL(url).pathname} -o ${path}`);
    } else if (directive === "SLOP") {
      const [, directory = "/", command] = args.match(/^(?:CWD (\S+) )?(.*)$/s);
      await run(`cd ${directory} && ${command}`);
    }
  }
  await run(`cd /tmp/llvm-build && slop -e -c 'for archive in lib/*.a; do cmp "$archive" "/usr/lib/llvm-build/$archive"; done'`);
  // The compiler before the tools: its module name counts the inputs of its link.
  await run("cd /tmp/dolly-compiler && slop -e /usr/lib/llvm-build/link-compiler.slop /tmp/llvm-build && " +
    "cmp compiler /usr/libexec/dolly/process-bin/compiler");
  // llvm-tablegen built its tools with the seed compiler; the build above ran those.
  await run("cd /tmp/llvm-build && make -j4 llvm-min-tblgen llvm-tblgen clang-tblgen && " +
    `slop -e -c 'for tool in llvm-min-tblgen llvm-tblgen clang-tblgen; do cmp "bin/$tool" "/usr/bin/$tool"; done'`);
});
