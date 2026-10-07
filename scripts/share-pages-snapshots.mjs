#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { decodeSnapshotRecords, validateSnapshotPacks, MAX_SNAPSHOT_BYTES } from "../src/snapshot-records.mjs";
import { parseGeneratedConstant } from "./site-release.mjs";

// A record is either decoded (`data`) or indexed in a snapshot file on disk
// (`byteLength`, `source`, `offset`); the catalog is never held in memory.
const CHUNK_BYTES = 4 * 1024 * 1024;
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const recordLength = record => record.byteLength ?? record.data.length;
const recordKey = (kind, path) => createHash("sha256").update(`${kind}\0${path}\0`);

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
    const length = 16 + encodedPath.length + recordLength(record);
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

function snapshotHeader(count) {
  const header = Buffer.alloc(16, "DOLLYSNP", "latin1");
  header.writeUInt32LE(2, 8);
  header.writeUInt32LE(count, 12);
  return header;
}

function recordHeader(kind, encodedPath, byteLength) {
  const header = Buffer.alloc(16 + encodedPath.length);
  header.writeUInt32LE(kind, 0);
  header.writeUInt32LE(encodedPath.length, 4);
  header.writeBigUInt64LE(BigInt(byteLength), 8);
  header.set(encodedPath, 16);
  return header;
}

async function readExact(handle, buffer, position, length) {
  let done = 0;
  while (done < length) {
    const { bytesRead } = await handle.read(buffer, done, length - done, position + done);
    if (!bytesRead) throw new Error("truncated snapshot record");
    done += bytesRead;
  }
  return buffer.subarray(0, length);
}

async function* indexedData(record) {
  const hash = recordKey(record.kind, record.path);
  for (let done = 0; done < record.byteLength;) {
    const length = Math.min(CHUNK_BYTES, record.byteLength - done);
    const chunk = await readExact(record.source.handle, Buffer.allocUnsafe(length), record.offset + done, length);
    hash.update(chunk);
    done += length;
    yield chunk;
  }
  if (hash.digest("hex") !== record.key) throw new Error(`${record.source.name}: packed record mismatch: ${record.path}`);
}

async function* decodedData(record) { yield record.data; }

// Encodes like encodeSnapshotRecords, as chunks of at least CHUNK_BYTES.
async function* snapshotChunks(records, readData) {
  const entries = [...records].map(([path, record]) => ({ encodedPath: Buffer.from(path), record }))
    .sort((left, right) => Buffer.compare(left.encodedPath, right.encodedPath));
  let pending = [snapshotHeader(entries.length)], size = pending[0].length;
  for (const { encodedPath, record } of entries) {
    pending.push(recordHeader(record.kind, encodedPath, recordLength(record)));
    size += pending.at(-1).length;
    for await (const chunk of readData(record)) {
      pending.push(chunk);
      size += chunk.length;
      if (size >= CHUNK_BYTES) { yield Buffer.concat(pending); pending = []; size = 0; }
    }
  }
  if (size) yield Buffer.concat(pending);
}

async function writeSnapshotPack(directory, records, readData) {
  const hash = createHash("sha256"), temporary = resolve(directory, "packs", `${randomUUID()}.tmp`);
  let byteLength = 0;
  try {
    await pipeline(async function* () {
      for await (const chunk of snapshotChunks(records, readData)) {
        hash.update(chunk);
        byteLength += chunk.length;
        yield chunk;
      }
    }, createGzip({ level: 6 }), createWriteStream(temporary));
    const sha256 = hash.digest("hex"), path = resolve(directory, "packs", `${sha256}.snapshot.gz`);
    await rename(temporary, path);
    return { sha256, byteLength, encodedByteLength: (await stat(path)).size };
  } finally { await rm(temporary, { force: true }); }
}

export async function ensureSnapshotPacks(directory, metadata) {
  if (metadata.encoding === "packs") {
    const present = await Promise.all(validateSnapshotPacks(metadata).map(async pack => {
      try { return (await stat(resolve(directory, "packs", `${pack.sha256}.snapshot.gz`))).size === pack.encodedByteLength; }
      catch (error) { if (error.code === "ENOENT") return false; throw error; }
    }));
    if (present.every(Boolean)) return metadata;
  }
  const bytes = await readFile(resolve(directory, `dolly-${metadata.image}-system.snapshot`));
  if (bytes.length !== metadata.byteLength || digest(bytes) !== metadata.sha256) throw new Error("snapshot mismatch");
  await mkdir(resolve(directory, "packs"), { recursive: true });
  const packs = [];
  for (const records of splitSnapshotRecords(decodeSnapshotRecords(bytes))) {
    packs.push(await writeSnapshotPack(directory, records, decodedData));
  }
  const result = { ...metadata, encoding: "packs", packs };
  validateSnapshotPacks(result);
  return result;
}

// Reads the snapshot once, sequentially, keeping one chunk and the record
// index: path, kind, size, file offset and content key. The structure is
// validated in full by the acceptance step, which merges the packs again.
async function indexSnapshot(source) {
  const { handle, metadata } = source;
  if ((await handle.stat()).size !== metadata.byteLength) throw new Error(`${source.name}: snapshot mismatch`);
  const fileHash = createHash("sha256"), buffer = Buffer.allocUnsafe(CHUNK_BYTES), records = [];
  let position = 0;
  const read = async (length, hash) => {
    const bytes = await readExact(handle, buffer, position, length);
    fileHash.update(bytes);
    hash?.update(bytes);
    position += length;
    return bytes;
  };
  const header = await read(16);
  const count = header.readUInt32LE(12);
  if (header.toString("latin1", 0, 8) !== "DOLLYSNP" || header.readUInt32LE(8) !== 2 || count === 0 || count > 100_000) {
    throw new Error(`${source.name}: invalid Dolly snapshot header`);
  }
  for (let index = 0; index < count; index += 1) {
    const head = await read(16);
    const kind = head.readUInt32LE(0), pathLength = head.readUInt32LE(4), byteLength = Number(head.readBigUInt64LE(8));
    if (kind < 1 || kind > 3 || pathLength < 2 || pathLength >= 4096 || byteLength > MAX_SNAPSHOT_BYTES ||
        position > metadata.byteLength - pathLength - byteLength) throw new Error(`${source.name}: invalid snapshot record size`);
    const path = decoder.decode(await read(pathLength)), hash = recordKey(kind, path), offset = position;
    for (let done = 0; done < byteLength; done += Math.min(CHUNK_BYTES, byteLength - done)) await read(Math.min(CHUNK_BYTES, byteLength - done), hash);
    records.push({ key: hash.digest("hex"), path, kind, byteLength, source, offset });
  }
  if (position !== metadata.byteLength) throw new Error(`${source.name}: trailing snapshot bytes`);
  if (fileHash.digest("hex") !== metadata.sha256) throw new Error(`${source.name}: snapshot mismatch`);
  return records;
}

export async function shareSnapshots(directory, snapshots) {
  const images = [], identical = new Map();
  try {
    for (const name of (await readdir(directory)).sort()) {
      if (!/^dolly-.+-system-snapshot\.mjs$/.test(name)) continue;
      const metadata = parseGeneratedConstant(await readFile(resolve(directory, name), "utf8"), "DOLLY_SYSTEM_SNAPSHOT");
      const image = { metadata, name, packs: [], records: 0, packed: 0,
        handle: await open(resolve(snapshots, `dolly-${metadata.image}-system.snapshot`)) };
      images.push(image);
      for (const record of await indexSnapshot(image)) {
        image.records += 1;
        let shared = identical.get(record.key);
        if (!shared) { shared = { ...record, images: [] }; identical.set(record.key, shared); }
        shared.images.push(image);
      }
    }
    // Group identical records by the images that need them. This keeps request
    // counts small while each file's bytes appear in exactly one published pack.
    const groups = new Map();
    for (const shared of identical.values()) {
      const key = shared.images.map(image => image.metadata.image).join(",");
      if (!groups.has(key)) groups.set(key, { images: shared.images, records: new Map() });
      groups.get(key).records.set(shared.path, shared);
    }
    await mkdir(resolve(directory, "packs"), { recursive: true });
    const packs = new Set();
    let packedBytes = 0;
    for (const group of groups.values()) {
      for (const records of splitSnapshotRecords(group.records)) {
        const pack = await writeSnapshotPack(directory, records, indexedData);
        packs.add(pack.sha256);
        packedBytes += pack.encodedByteLength;
        for (const image of group.images) {
          image.packs.push(pack);
          image.packed += records.size;
        }
      }
    }
    for (const image of images) {
      if (image.packed !== image.records) throw new Error(`${image.name}: packed reconstruction mismatch`);
      image.packs.sort((left, right) => left.sha256.localeCompare(right.sha256));
      const metadata = { ...image.metadata, encoding: "packs", packs: image.packs };
      validateSnapshotPacks(metadata);
      await writeFile(resolve(directory, image.name), `// Generated shared snapshot manifest.\nexport const DOLLY_SYSTEM_SNAPSHOT = Object.freeze(${JSON.stringify(metadata, null, 2)});\n`);
    }
    console.log(`dolly: ${images.length} images share ${packs.size} packs (${packedBytes} compressed bytes)`);
    return { images: images.length, packs: packs.size, packedBytes };
  } finally { await Promise.all(images.map(image => image.handle.close())); }
}
if (process.argv[1] === import.meta.filename) await shareSnapshots(resolve(process.argv[2]), resolve(process.argv[3]));
