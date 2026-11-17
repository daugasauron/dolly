#!/usr/bin/env node
// The next Rust seed: rust-build's /opt/rust-sdk, rustc and its standard library as Dolly built
// them, without what rust-sdk makes itself (the rustc wrapper, the linker adapter and its
// library, rustdoc's links), and the cargo package's Cargo, pinned as DOLLY_RUST_SEED
// (scripts/seed-archive.mjs). Run it after building cargo: a digest it leaves unchanged is the
// fixed point. Usage: node demos/rust/pin-seed.mjs
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { decodeSystemSnapshot } from "../../scripts/system-snapshot-format.mjs";
import { pinSeedArchive } from "../../scripts/seed-archive.mjs";

const project = resolve(import.meta.dirname, "../..");
const snapshot = async image => decodeSystemSnapshot(await readFile(join(project, `dist/dolly-${image}-system.snapshot`))).files;
const sdkOwn = new Set(["/opt/rust-sdk/bin/rustc", "/opt/rust-sdk/bin/dolly-rust-link", "/opt/rust-sdk/lib/dolly-rust-host.a"]);
const files = new Map([...await snapshot("rust-build")].filter(([path]) => path.startsWith("/opt/rust-sdk/") && !sdkOwn.has(path)));
const cargo = (await snapshot("cargo")).get("/usr/bin/cargo");
if (!files.has("/opt/rust-sdk/bin/rustc-real") || !cargo) throw new Error("rust-build or cargo holds no compiler or Cargo");
files.set("/usr/bin/cargo", cargo);
await pinSeedArchive("DOLLY_RUST_SEED", files);
