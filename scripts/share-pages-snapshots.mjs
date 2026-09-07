#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { decodeSnapshotRecords, encodeSnapshotRecords, mergeSnapshotRecords, validateSnapshotPacks } from "../src/snapshot-records.mjs";
import { parseGeneratedConstant } from "./site-release.mjs";

const digest = bytes => createHash("sha256").update(bytes).digest("hex");
export function splitSnapshotRecords(records) {
  const entries = [...records].map(([path, record]) => ({ path, record, encodedPath: Buffer.from(path) }))
    .sort((left, right) => Buffer.compare(left.encodedPath, right.encodedPath));
  const parts = [];
  let part = new Map(), size = 16;
  const finish = () => {
    if (part.size) parts.push(part);
    part = new Map(); size = 16;
  };
  for (const { path, record, encodedPath } of entries) {
    const length = 16 + encodedPath.length + record.data.length;
    if (size + length > 4 * 1024 * 1024) finish();
    part.set(path, record);
    size += length;
    // Large files stand alone. Path landmarks let later packs stabilize after
    // small edits without tying their boundaries to the catalog's image names.
    if (size >= 4 * 1024 * 1024 || (size >= 2 * 1024 * 1024 &&
        (createHash("sha256").update(encodedPath).digest()[0] & 31) === 0)) finish();
  }
  finish();
  return parts;
}

export async function shareSnapshots(directory, snapshots) {
  const images = [], identical = new Map();
  for (const name of (await readdir(directory)).sort()) {
    if (!/^dolly-.+-system-snapshot\.mjs$/.test(name)) continue;
    const metadata = parseGeneratedConstant(await readFile(resolve(directory, name), "utf8"), "DOLLY_SYSTEM_SNAPSHOT");
    const bytes = await readFile(resolve(snapshots, `dolly-${metadata.image}-system.snapshot`));
    if (bytes.length !== metadata.byteLength || digest(bytes) !== metadata.sha256) throw new Error(`${name}: snapshot mismatch`);
    const image = { metadata, name, packs: [] };
    images.push(image);
    for (const [path, record] of decodeSnapshotRecords(bytes)) {
      const key = createHash("sha256").update(`${record.kind}\0${path}\0`).update(record.data).digest("hex");
      let shared = identical.get(key);
      if (!shared) { shared = { path, record, images: [] }; identical.set(key, shared); }
      shared.images.push(image);
    }
  }
  // Group identical records by the images that need them. This keeps request
  // counts small while each file's bytes appear in exactly one published pack.
  const groups = new Map();
  for (const shared of identical.values()) {
    const key = shared.images.map(image => image.metadata.image).join(",");
    if (!groups.has(key)) groups.set(key, { images: shared.images, records: new Map() });
    groups.get(key).records.set(shared.path, shared.record);
  }
  await mkdir(resolve(directory, "packs"), { recursive: true });
  const parts = new Map();
  let packedBytes = 0;
  for (const group of groups.values()) {
    for (const records of splitSnapshotRecords(group.records)) {
      const bytes = encodeSnapshotRecords(records);
      const sha256 = digest(bytes), compressed = gzipSync(bytes, { level: 6 });
      const pack = { sha256, byteLength: bytes.length, encodedByteLength: compressed.length };
      parts.set(sha256, bytes);
      await writeFile(resolve(directory, "packs", `${sha256}.snapshot.gz`), compressed);
      packedBytes += compressed.length;
      for (const image of group.images) image.packs.push(pack);
    }
  }
  for (const image of images) {
    image.packs.sort((left, right) => left.sha256.localeCompare(right.sha256));
    const bytes = mergeSnapshotRecords(image.packs.map(pack => parts.get(pack.sha256)));
    if (digest(bytes) !== image.metadata.sha256) throw new Error(`${image.name}: packed reconstruction mismatch`);
    const metadata = { ...image.metadata, encoding: "packs", packs: image.packs };
    validateSnapshotPacks(metadata);
    await writeFile(resolve(directory, image.name), `// Generated shared snapshot manifest.\nexport const DOLLY_SYSTEM_SNAPSHOT = Object.freeze(${JSON.stringify(metadata, null, 2)});\n`);
  }
  console.log(`dolly: ${images.length} images share ${parts.size} packs (${packedBytes} compressed bytes)`);
  return { images: images.length, packs: parts.size, packedBytes };
}
if (process.argv[1] === import.meta.filename) await shareSnapshots(resolve(process.argv[2]), resolve(process.argv[3]));
