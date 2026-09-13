#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { inspectDollyfile } from "../src/dollyfile-view.mjs";

export async function stageRustSeed(project, destination) {
  let source = join(project, "build/rustc-port/rust-sdk.tar.gz"), expected, kind = "built";
  let manifest;
  try { manifest = await readFile(join(project, "build/rustc-port/seed.sha256"), "utf8"); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  if (manifest !== undefined) {
    const match = /^([a-f0-9]{64})  rust-sdk\.tar\.gz\n$/.exec(manifest);
    if (!match) throw new Error("Invalid completed Rust seed checksum record; run npm run build:rust-seed");
    expected = match[1];
  } else {
    kind = "pinned";
    source = join(project, "dist/static/rust/rust-sdk.tar.gz");
    const recipe = inspectDollyfile(await readFile(join(project, "modules/rust-sdk.dm"), "utf8"));
    expected = recipe.sources.find(item => item.location === "/static/rust/rust-sdk.tar.gz")?.sha256;
  }
  const bytes = await readFile(source).catch(error => {
    if (error.code !== "ENOENT") throw error;
    throw new Error("No completed Rust compiler seed. Run npm run build:rust-seed once, then retry the image build.");
  });
  if (createHash("sha256").update(bytes).digest("hex") !== expected) {
    throw new Error(`The ${kind} Rust compiler seed failed its checksum; restore it or run npm run build:rust-seed`);
  }
  await mkdir(dirname(destination), { recursive: true });
  const staging = await mkdtemp(join(dirname(destination), ".rust-seed-"));
  try {
    const temporary = join(staging, "rust-sdk.tar.gz");
    await writeFile(temporary, bytes);
    await rename(temporary, destination);
  } finally { await rm(staging, { recursive: true, force: true }); }
  console.log(`dolly: staged ${kind} Rust compiler seed (${expected.slice(0, 16)}…)`);
}

if (process.argv[1] === import.meta.filename) {
  if (process.argv.length !== 3) throw new Error("usage: prepare-rust-seed.mjs DESTINATION");
  await stageRustSeed(resolve(import.meta.dirname, ".."), resolve(process.argv[2]));
}
