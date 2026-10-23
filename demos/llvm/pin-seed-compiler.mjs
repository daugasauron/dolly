#!/usr/bin/env node
// Makes the compiler the llvm-cc image linked the seed's: that compiler and
// Clang's resource headers as llvm-build generated them, at the seed's paths in
// .cache/dolly-seed-compiler-SHA256.tar, pinned in config/source-pins.sh with the
// asset URL of the GitHub release being developed, which carries it. Run it after
// building llvm-cc: a digest it leaves unchanged is the fixed point, a compiler
// that rebuilt itself. Usage: node demos/llvm/pin-seed-compiler.mjs
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { decodeSystemSnapshot } from "../../scripts/system-snapshot-format.mjs";
import { DOLLY_VERSION } from "../../src/version.mjs";

const project = resolve(import.meta.dirname, "../..");
const compiler = "/usr/libexec/dolly/process-bin/compiler", resources = "/usr/lib/llvm-build/lib/clang/";
const { files } = decodeSystemSnapshot(await readFile(join(project, "dist/dolly-llvm-cc-system.snapshot")));
if (!files.has(compiler)) throw new Error(`llvm-cc holds no ${compiler}`);
const seedFiles = [[compiler, compiler], ...[...files.keys()].filter(path => path.startsWith(resources))
  .map(path => [path, `/usr/lib/clang/${path.slice(resources.length)}`])];

const staging = await mkdtemp(join(project, "build/.seed-compiler-"));
try {
  for (const [from, to] of seedFiles) {
    await mkdir(dirname(staging + to), { recursive: true });
    await writeFile(staging + to, files.get(from));
  }
  const archive = join(staging, "seed-compiler.tar");
  await promisify(execFile)("node", [join(project, "scripts/build-source-tar.mjs"), archive, join(staging, "usr"), "/usr"]);
  const sha256 = createHash("sha256").update(await readFile(archive)).digest("hex");
  const name = `dolly-seed-compiler-${sha256}.tar`;
  await rename(archive, join(project, ".cache", name));
  const pins = join(project, "config/source-pins.sh");
  let text = await readFile(pins, "utf8");
  for (const [key, value] of [["URL", `'https://github.com/daugasauron/dolly/releases/download/v${DOLLY_VERSION}/${name}'`],
    ["SHA256", sha256]]) {
    const line = new RegExp(`^DOLLY_SEED_COMPILER_${key}=.*$`, "m");
    if (!line.test(text)) throw new Error(`config/source-pins.sh has no DOLLY_SEED_COMPILER_${key}`);
    text = text.replace(line, `DOLLY_SEED_COMPILER_${key}=${value}`);
  }
  await writeFile(pins, text);
  console.log(`dolly: the seed's compiler is .cache/${name} (${seedFiles.length} files)`);
} finally {
  await rm(staging, { recursive: true, force: true });
}
