#!/usr/bin/env node
// A seed Dolly built of itself in a previous round, as the Rust and Go demos have: files at
// their image paths in .cache/NAME-SHA256.tar.gz, pinned as KEY_URL and KEY_SHA256 in the
// source-pins.sh that holds KEY (NAME is KEY in lower case, dashed), with the asset URL of the
// GitHub release being developed, which carries it (docs/sources.md).
//   seed-archive.mjs stage KEY TO  fetches it by its pins unless .cache has it, and copies it to
//                                  TO once each executable in it is for this process contract
//                                  and these host modules
//   seed-archive.mjs restamp KEY   for a contract or module that only adds: the pinned archive
//                                  with the old digests replaced by the current ones wherever its
//                                  executables hold them, pinned
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";
import { contractDigest } from "./dolly-abi.mjs";
import { parseWasmInterface, readWasmInterface } from "./wasm-interface.mjs";
import { validateProcessInterface } from "../page/process-abi.mjs";
import { hex } from "../page/static-asset.mjs";
import { DOLLY_VERSION } from "../page/version.mjs";
import { executableHostRequirements, hostRequirement } from "../host/requirements.mjs";

const project = resolve(import.meta.dirname, "..");
const seedName = key => key.toLowerCase().replaceAll("_", "-");

async function pinsFile(key) {
  const demos = (await readdir(join(project, "demos"), { withFileTypes: true })).filter(entry => entry.isDirectory())
    .map(demo => join(project, "demos", demo.name, "source-pins.sh"));
  for (const path of [join(project, "config/source-pins.sh"), ...demos]) {
    const text = await readFile(path, "utf8").catch(error => { if (error.code === "ENOENT") return ""; throw error; });
    if (new RegExp(`^${key}_SHA256=`, "m").test(text)) return { path, text };
  }
  throw new Error(`no source-pins.sh pins ${key}`);
}

async function pinnedSeedArchive(key) {
  const { text } = await pinsFile(key);
  const sha256 = new RegExp(`^${key}_SHA256=([0-9a-f]{64})$`, "m").exec(text)?.[1];
  const url = new RegExp(`^${key}_URL='(https://[^']+)'$`, "m").exec(text)?.[1];
  if (!sha256 || !url) throw new Error(`${key} has no URL and SHA-256 pinned`);
  const path = join(project, ".cache", `${seedName(key)}-${sha256}.tar.gz`);
  await promisify(execFile)("bash", [join(project, "scripts/fetch-verified-file.sh"), url, sha256, path]);
  return path;
}

// The archive build-source-tar.mjs writes: regular files only, ustar.
function readSeedArchive(bytes) {
  const tar = gunzipSync(bytes), files = new Map(), field = (at, length) =>
    tar.subarray(at, at + length).toString("utf8").replace(/\0.*$/s, "");
  for (let at = 0; at + 512 <= tar.length && tar[at] !== 0; ) {
    const size = parseInt(field(at + 124, 12), 8), prefix = field(at + 345, 155), name = field(at, 100);
    if (field(at + 156, 1) !== "0") throw new Error(`${prefix}/${name}: not a regular file`);
    files.set(`/${prefix ? `${prefix}/` : ""}${name}`, tar.subarray(at + 512, at + 512 + size));
    at += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}

// files: image path -> bytes.
export async function pinSeedArchive(key, files) {
  await mkdir(join(project, "build"), { recursive: true });
  const staging = await mkdtemp(join(project, "build/.seed-archive-"));
  try {
    const tops = new Set();
    for (const [path, bytes] of files) {
      tops.add(path.split("/")[1]);
      await mkdir(dirname(staging + path), { recursive: true });
      await writeFile(staging + path, bytes);
    }
    const archive = join(staging, "seed.tar.gz");
    await promisify(execFile)("node", [join(project, "scripts/build-source-tar.mjs"), archive,
      ...[...tops].sort().flatMap(top => [join(staging, top), `/${top}`])]);
    const sha256 = createHash("sha256").update(await readFile(archive)).digest("hex");
    const name = `${seedName(key)}-${sha256}.tar.gz`;
    await rename(archive, join(project, ".cache", name));
    const pins = await pinsFile(key);
    let text = pins.text;
    for (const [suffix, value] of [["URL", `'https://github.com/daugasauron/dolly/releases/download/v${DOLLY_VERSION}/${name}'`],
      ["SHA256", sha256]]) {
      const line = new RegExp(`^${key}_${suffix}=.*$`, "m");
      if (!line.test(text)) throw new Error(`${pins.path} has no ${key}_${suffix}`);
      text = text.replace(line, `${key}_${suffix}=${value}`);
    }
    await writeFile(pins.path, text);
    console.log(`dolly: ${key} is .cache/${name} (${files.size} files)`);
    return sha256;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

// The digests an executable is for, of the process contract and each host module it records,
// and those of this tree.
async function currentDigests() {
  const contract = await readWasmInterface(join(project, "build/dolly-process-0.wasm"));
  const modules = new Map();
  return { contract, process: hex(contractDigest(contract)), async module(requirement) {
    const { name } = hostRequirement(requirement);
    if (!modules.has(name)) {
      const abi = await import(join(project, "host", name, "abi.mjs"));
      modules.set(name, abi[`DOLLY_${name.toUpperCase()}_ABI_DIGEST`]);
    }
    return modules.get(name);
  } };
}
const stamped = (path, bytes) => bytes[0] === 0 && bytes[1] === 0x61 && bytes[2] === 0x73 && bytes[3] === 0x6d &&
  parseWasmInterface(bytes, path).customSectionData.some(section => section.name === "dolly.process");

// old digest -> current digest, for each that differs.
async function staleDigests(path, bytes, current) {
  const module = parseWasmInterface(bytes, path), stale = new Map();
  const stamp = hex(module.customSectionData.find(section => section.name === "dolly.process").data);
  if (stamp !== current.process) stale.set(stamp, current.process);
  for (const [requirement, digest] of executableHostRequirements(module)) {
    const now = await current.module(requirement);
    if (digest !== now) stale.set(digest, now);
  }
  return stale;
}

async function stage(key, destination) {
  const current = await currentDigests(), archive = await pinnedSeedArchive(key), seed = await readFile(archive);
  let executables = 0;
  for (const [path, bytes] of readSeedArchive(seed)) {
    if (!stamped(path, bytes)) continue;
    executables++;
    if ((await staleDigests(path, bytes, current)).size) {
      throw new Error(`${key}'s ${path} is for another process contract or host module; for one that only adds, ` +
        `node scripts/seed-archive.mjs restamp ${key} (docs/sources.md)`);
    }
    validateProcessInterface(current.contract, parseWasmInterface(bytes, path), current.process);
  }
  if (!executables) throw new Error(`${archive} holds no Dolly executable`);
  // The destination may be a link to a cached file, which a write would change.
  await rm(destination, { force: true });
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, seed);
  console.log(`dolly: staged ${key} (${executables} executables for this process contract and these host modules)`);
}

async function restamp(key) {
  const current = await currentDigests();
  const files = readSeedArchive(await readFile(await pinnedSeedArchive(key)));
  let changed = 0;
  for (const [path, original] of files) {
    if (!stamped(path, original)) continue;
    const stale = await staleDigests(path, original, current);
    if (!stale.size) continue;
    const bytes = Buffer.from(original);
    for (const [old, now] of stale) {
      const from = Buffer.from(old, "hex"), to = Buffer.from(now, "hex");
      for (let at = bytes.indexOf(from); at >= 0; at = bytes.indexOf(from, at + 1)) to.copy(bytes, at);
    }
    validateProcessInterface(current.contract, parseWasmInterface(bytes, path), current.process);
    files.set(path, bytes);
    changed++;
  }
  if (!changed) return console.log(`dolly: ${key} is already for this process contract and these host modules`);
  await pinSeedArchive(key, files);
  console.log(`dolly: restamped ${changed} executables of ${key}`);
}

if (process.argv[1] === import.meta.filename) {
  const [command, key, destination, ...rest] = process.argv.slice(2);
  if (!/^DOLLY_[A-Z0-9_]+$/.test(key ?? "") || rest.length ||
      !(command === "stage" && destination || command === "restamp" && !destination)) {
    throw new Error("usage: seed-archive.mjs stage KEY DESTINATION | restamp KEY");
  }
  await (command === "stage" ? stage(key, resolve(destination)) : restamp(key));
}
