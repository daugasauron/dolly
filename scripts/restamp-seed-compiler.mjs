#!/usr/bin/env node
// The seed's compiler for a new process contract, for the round that brings
// it: the pinned compiler with the old contract's digest replaced by the new
// one in the two places it carries it, its own dolly.process stamp and the
// copy it writes into what it links. Its libc stays the old contract's, so
// this is right only while the new contract keeps every operation and layout
// of the old one. The round then builds llvm-cc under the new contract and
// pins that (demos/llvm/pin-seed-compiler.mjs), and no restamped compiler is
// left (docs/sources.md). Run it after npm run build:runtime has failed on the
// seed compiler's stamp, then build again.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { contractDigest } from "./dolly-abi.mjs";
import { parseWasmInterface, readWasmInterface } from "./wasm-interface.mjs";
import { validateProcessInterface } from "../src/process-abi.mjs";
import { hex } from "../src/static-asset.mjs";
import { DOLLY_VERSION } from "../src/version.mjs";

const project = resolve(import.meta.dirname, "..");
const run = promisify(execFile);
const pins = join(project, "config/source-pins.sh");
let text = await readFile(pins, "utf8");
const pinned = /^DOLLY_SEED_COMPILER_SHA256=([0-9a-f]{64})$/m.exec(text)?.[1];
if (!pinned) throw new Error("config/source-pins.sh pins no seed compiler");
const contract = await readWasmInterface(join(project, "build/dolly-process-0.wasm"));
const digest = contractDigest(contract);

const staging = await mkdtemp(join(project, "build/.seed-compiler-"));
try {
  await run("tar", ["-xf", join(project, ".cache", `dolly-seed-compiler-${pinned}.tar`), "-C", staging]);
  const compiler = join(staging, "usr/libexec/dolly/process-bin/compiler");
  const bytes = new Uint8Array(await readFile(compiler));
  const stamps = parseWasmInterface(bytes, compiler).customSectionData.filter(section => section.name === "dolly.process");
  if (stamps.length !== 1) throw new Error(`the seed compiler has ${stamps.length} dolly.process stamps`);
  const old = Buffer.from(stamps[0].data);
  if (old.equals(digest)) {
    console.log("dolly: the seed's compiler is already for this process contract");
    process.exit(0);
  }
  const places = [];
  for (let at = Buffer.from(bytes).indexOf(old); at >= 0; at = Buffer.from(bytes).indexOf(old, at + 1)) places.push(at);
  if (places.length !== 2) throw new Error(`the seed compiler holds its contract digest ${places.length} times, not twice`);
  for (const at of places) bytes.set(digest, at);
  validateProcessInterface(contract, parseWasmInterface(bytes, compiler), hex(digest));
  await writeFile(compiler, bytes);
  const archive = join(staging, "seed-compiler.tar");
  await run("node", [join(project, "scripts/build-source-tar.mjs"), archive, join(staging, "usr"), "/usr"]);
  const sha256 = createHash("sha256").update(await readFile(archive)).digest("hex");
  const name = `dolly-seed-compiler-${sha256}.tar`;
  await rename(archive, join(project, ".cache", name));
  for (const [key, value] of [["URL", `'https://github.com/daugasauron/dolly/releases/download/v${DOLLY_VERSION}/${name}'`],
    ["SHA256", sha256]]) {
    text = text.replace(new RegExp(`^DOLLY_SEED_COMPILER_${key}=.*$`, "m"), `DOLLY_SEED_COMPILER_${key}=${value}`);
  }
  await writeFile(pins, text);
  console.log(`dolly: the seed's compiler for process contract ${hex(digest)} is .cache/${name}`);
} finally {
  await rm(staging, { recursive: true, force: true });
}
