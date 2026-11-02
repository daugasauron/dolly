import { unretainedPath } from "./image-names.mjs";
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
export const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024 * 1024;
// Packs average 2 MiB or more (scripts/share-pages-snapshots.mjs): an image of
// MAX_SNAPSHOT_BYTES needs about 1,024, which this bound leaves room for.
const MAX_SNAPSHOT_PACKS = MAX_SNAPSHOT_BYTES / (1024 * 1024);

function compareBytes(left, right) {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return left.length - right.length;
}

// The 16-byte snapshot header: its record count.
function decodeHeader(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 16 || decoder.decode(bytes.subarray(0, 8)) !== "DOLLYSNP" || view.getUint32(8, true) !== 2) {
    throw new Error("invalid Dolly snapshot header");
  }
  const count = view.getUint32(12, true);
  if (count === 0 || count > 100_000) throw new Error("invalid Dolly snapshot record count");
  return count;
}

// A record's 16-byte header: its kind, path length and data size.
function decodeRecordHeader(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const kind = view.getUint32(0, true), pathLength = view.getUint32(4, true), size = view.getBigUint64(8, true);
  if (kind < 1 || kind > 3 || pathLength < 2 || pathLength >= 4096 ||
      size > BigInt(MAX_SNAPSHOT_BYTES) || (kind === 1 && size !== 0n) ||
      (kind === 3 && (size === 0n || size >= 4096n))) throw new Error("invalid snapshot record size");
  return { kind, pathLength, size: Number(size) };
}

// The path of PATHBYTES, valid and after PREVIOUS in byte order.
function decodePath(pathBytes, previous) {
  const path = decoder.decode(pathBytes);
  if (!path.startsWith("/") || /[\0\\\r\n]/.test(path) ||
      path.slice(1).split("/").some(part => !part || part === "." || part === "..") ||
      unretainedPath(path) ||
      previous && compareBytes(previous, pathBytes) >= 0) throw new Error(`invalid snapshot path ${path}`);
  return path;
}

function checkParents(records) {
  for (const path of records.keys()) {
    for (let slash = path.indexOf("/", 1); slash !== -1; slash = path.indexOf("/", slash + 1)) {
      const parent = records.get(path.slice(0, slash));
      if (parent && parent.kind !== 1) throw new Error(`snapshot parent is not a directory: ${path}`);
    }
  }
}

export function decodeSnapshotRecords(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length > MAX_SNAPSHOT_BYTES) throw new Error("invalid Dolly snapshot header");
  const count = decodeHeader(bytes.subarray(0, 16));
  const records = new Map();
  let offset = 16, previous;
  for (let index = 0; index < count; index += 1) {
    if (offset > bytes.length - 16) throw new Error("truncated snapshot record");
    const { kind, pathLength, size } = decodeRecordHeader(bytes.subarray(offset, offset + 16));
    offset += 16;
    if (offset > bytes.length - pathLength - size) throw new Error("truncated snapshot record");
    const pathBytes = bytes.subarray(offset, offset + pathLength);
    const path = decodePath(pathBytes, previous);
    previous = pathBytes;
    offset += pathLength;
    const data = bytes.subarray(offset, offset + size);
    if (kind === 3 && data.includes(0)) throw new Error("invalid snapshot symlink");
    records.set(path, { kind, data });
    offset += size;
  }
  if (offset !== bytes.length) throw new Error("trailing snapshot bytes");
  checkParents(records);
  return records;
}

// Bytes that arrive in pieces (an iterable of Uint8Array), read in order.
class PieceReader {
  constructor(pieces) {
    this.pieces = pieces[Symbol.asyncIterator]?.() ?? pieces[Symbol.iterator]();
    this.chunk = new Uint8Array(0);
    this.position = 0;
  }

  async #fill() {
    const { done, value } = await this.pieces.next();
    if (done) return false;
    if (!(value instanceof Uint8Array)) throw new TypeError("invalid snapshot piece");
    this.chunk = value;
    return true;
  }

  #advance(length) {
    this.position += length;
    if (this.position > MAX_SNAPSHOT_BYTES) throw new Error("snapshot exceeds its size limit");
  }

  // The next LENGTH bytes, a view into the current piece when they lie in one.
  async take(length) {
    if (length === 0) return new Uint8Array(0);
    if (this.chunk.length === 0 && !await this.#fill()) throw new Error("truncated snapshot record");
    if (this.chunk.length >= length) {
      const bytes = this.chunk.subarray(0, length);
      this.chunk = this.chunk.subarray(length);
      this.#advance(length);
      return bytes;
    }
    const bytes = new Uint8Array(length);
    for (let filled = 0; filled < length;) {
      if (this.chunk.length === 0 && !await this.#fill()) throw new Error("truncated snapshot record");
      const taken = Math.min(this.chunk.length, length - filled);
      bytes.set(this.chunk.subarray(0, taken), filled);
      this.chunk = this.chunk.subarray(taken);
      filled += taken;
    }
    this.#advance(length);
    return bytes;
  }

  async skip(length) {
    while (length !== 0) {
      if (this.chunk.length === 0 && !await this.#fill()) throw new Error("truncated snapshot record");
      const taken = Math.min(this.chunk.length, length);
      this.chunk = this.chunk.subarray(taken);
      this.#advance(taken);
      length -= taken;
    }
  }

  async ended() {
    while (this.chunk.length === 0) if (!await this.#fill()) return true;
    return false;
  }
}

// The records of a snapshot that arrives in pieces, checked as
// decodeSnapshotRecords checks them without holding the snapshot: every path
// with its kind, and the data of the paths KEEP selects (symlink targets
// always). Resolves to the records and the snapshot's size.
export async function scanSnapshotRecords(pieces, keep) {
  const reader = new PieceReader(pieces);
  const count = decodeHeader(await reader.take(16));
  const records = new Map();
  let previous;
  for (let index = 0; index < count; index += 1) {
    const { kind, pathLength, size } = decodeRecordHeader(await reader.take(16));
    const pathBytes = await reader.take(pathLength);
    const path = decodePath(pathBytes, previous);
    previous = pathBytes;
    let data;
    if (kind === 3 || (kind === 2 && keep(path))) {
      data = await reader.take(size);
      if (kind === 3 && data.includes(0)) throw new Error("invalid snapshot symlink");
    } else await reader.skip(size);
    records.set(path, { kind, data });
  }
  if (!await reader.ended()) throw new Error("trailing snapshot bytes");
  checkParents(records);
  return { records, byteLength: reader.position };
}

export function encodeSnapshotRecords(records) {
  const encoder = new TextEncoder();
  const entries = [...records].map(([path, record]) => ({ path: encoder.encode(path), ...record }))
    .sort((left, right) => compareBytes(left.path, right.path));
  const size = entries.reduce((sum, record) => sum + 16 + record.path.length + record.data.length, 16);
  if (size > MAX_SNAPSHOT_BYTES || entries.length === 0 || entries.length > 100_000) throw new Error("snapshot exceeds record limits");
  const bytes = new Uint8Array(size), view = new DataView(bytes.buffer);
  bytes.set(encoder.encode("DOLLYSNP"));
  view.setUint32(8, 2, true);
  view.setUint32(12, entries.length, true);
  let offset = 16;
  for (const record of entries) {
    view.setUint32(offset, record.kind, true);
    view.setUint32(offset + 4, record.path.length, true);
    view.setBigUint64(offset + 8, BigInt(record.data.length), true);
    bytes.set(record.path, offset + 16);
    bytes.set(record.data, offset + 16 + record.path.length);
    offset += 16 + record.path.length + record.data.length;
  }
  return bytes;
}

export function mergeSnapshotRecords(parts) {
  const records = new Map();
  let size = 16;
  for (const part of parts) {
    for (const [path, record] of decodeSnapshotRecords(part)) {
      if (records.has(path)) throw new Error(`duplicate packed snapshot path: ${path}`);
      size += 16 + new TextEncoder().encode(path).length + record.data.length;
      if (size > MAX_SNAPSHOT_BYTES || records.size >= 100_000) throw new Error("packed snapshot exceeds limits");
      records.set(path, record);
    }
  }
  const bytes = encodeSnapshotRecords(records);
  decodeSnapshotRecords(bytes);
  return bytes;
}

export function validateSnapshotPacks(metadata) {
  if (!Array.isArray(metadata.packs) || metadata.packs.length === 0 || metadata.packs.length > MAX_SNAPSHOT_PACKS) throw new Error("invalid snapshot packs");
  const hashes = new Set();
  let size = 16;
  for (const pack of metadata.packs) {
    if (!/^[0-9a-f]{64}$/.test(pack.sha256) || hashes.has(pack.sha256) ||
        !Number.isSafeInteger(pack.byteLength) || pack.byteLength < 16 || pack.byteLength > MAX_SNAPSHOT_BYTES ||
        !Number.isSafeInteger(pack.encodedByteLength) || pack.encodedByteLength <= 0 || pack.encodedByteLength > MAX_SNAPSHOT_BYTES) {
      throw new Error("invalid snapshot pack descriptor");
    }
    hashes.add(pack.sha256);
    size += pack.byteLength - 16;
    if (size > MAX_SNAPSHOT_BYTES) throw new Error("packed snapshot exceeds size limit");
  }
  if (size !== metadata.byteLength) throw new Error("snapshot pack sizes do not match image");
  return metadata.packs;
}
