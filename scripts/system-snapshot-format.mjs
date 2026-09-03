import { Buffer } from "node:buffer";

const decoder = new TextDecoder("utf-8", { fatal: true });
const maximumSnapshotBytes = 512 * 1024 * 1024;

export function decodeSystemSnapshot(input) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (bytes.length < 16 || bytes.length > maximumSnapshotBytes ||
      bytes.subarray(0, 8).toString("ascii") !== "DOLLYSNP" ||
      bytes.readUInt32LE(8) !== 1) {
    throw new Error("invalid Dolly system snapshot header");
  }
  const count = bytes.readUInt32LE(12);
  if (count === 0 || count > 100_000) {
    throw new Error("Dolly system snapshot has an invalid file count");
  }
  let offset = 16;
  const files = new Map();
  for (let index = 0; index < count; index += 1) {
    if (offset > bytes.length - 12) {
      throw new Error("Dolly system snapshot record header is truncated");
    }
    const pathLength = bytes.readUInt32LE(offset);
    const dataLength64 = bytes.readBigUInt64LE(offset + 4);
    offset += 12;
    if (pathLength === 0 || pathLength > 4096 ||
        dataLength64 > BigInt(maximumSnapshotBytes)) {
      throw new Error("Dolly system snapshot record has invalid lengths");
    }
    const dataLength = Number(dataLength64);
    if (offset > bytes.length - pathLength - dataLength) {
      throw new Error("Dolly system snapshot record is truncated");
    }
    const path = decoder.decode(bytes.subarray(offset, offset + pathLength));
    offset += pathLength;
    if (!path.startsWith("/") || files.has(path)) {
      throw new Error(`invalid Dolly system snapshot path ${path}`);
    }
    files.set(path, bytes.subarray(offset, offset + dataLength));
    offset += dataLength;
  }
  if (offset !== bytes.length) {
    throw new Error("Dolly system snapshot has trailing bytes");
  }
  const manifest = [...files.keys()];
  const sorted = [...manifest].sort();
  if (JSON.stringify(manifest) !== JSON.stringify(sorted)) {
    throw new Error("Dolly system snapshot records are not sorted by path");
  }
  return { files, manifest };
}

export function decodeSnapshotEntry(bytes) {
  if (!bytes) throw new Error("snapshot has an invalid ENTRY record");
  const input = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (input.length < 16 ||
      input.subarray(0, 8).toString("ascii") !== "DOLLYENT" ||
      input.readUInt32LE(8) !== 1) {
    throw new Error("snapshot has an invalid ENTRY record");
  }
  const count = input.readUInt32LE(12);
  if (count === 0 || count > 256) {
    throw new Error("snapshot has an invalid ENTRY argc");
  }
  let offset = 16;
  const entry = [];
  for (let index = 0; index < count; index += 1) {
    if (offset > input.length - 4) throw new Error("snapshot ENTRY is truncated");
    const length = input.readUInt32LE(offset);
    offset += 4;
    if (length === 0 || length > 4096 || offset > input.length - length) {
      throw new Error("snapshot ENTRY has an invalid argument");
    }
    entry.push(decoder.decode(input.subarray(offset, offset + length)));
    offset += length;
  }
  if (offset !== input.length || !entry[0].startsWith("/")) {
    throw new Error("snapshot ENTRY has invalid trailing data");
  }
  return entry;
}
