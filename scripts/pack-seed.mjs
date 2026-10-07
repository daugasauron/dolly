#!/usr/bin/env node
// The compiler seed a root build starts from: one Dolly snapshot
// (abi/dolly-image-0.wat) holding every file under each SOURCE at its PATH.
// usage: pack-seed.mjs OUTPUT SOURCE@PATH...
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { encodeSnapshotRecords } from "../src/snapshot-records.mjs";

const [output, ...mappings] = process.argv.slice(2);
if (!output || !mappings.length) throw new Error("usage: pack-seed.mjs OUTPUT SOURCE@PATH...");
const records = new Map();
async function add(source, path) {
  if ((await stat(source)).isDirectory()) {
    for (const name of await readdir(source)) await add(`${source}/${name}`, `${path}/${name}`);
  // libc++'s headers are their own archive, installed by Dollyfile-system-build.
  } else if (!path.includes("/c++/v1/")) records.set(path, { kind: 2, data: await readFile(source) });
}
for (const mapping of mappings) await add(...mapping.split("@"));
await writeFile(output, encodeSnapshotRecords(records));
