const decoder = new TextDecoder("utf-8", { fatal: true });
export const MAX_SNAPSHOT_BYTES = 512 * 1024 * 1024;

function compareBytes(left, right) {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return left.length - right.length;
}

export function decodeSnapshotRecords(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 16 || bytes.length > MAX_SNAPSHOT_BYTES ||
      decoder.decode(bytes.subarray(0, 8)) !== "DOLLYSNP" || view.getUint32(8, true) !== 2) {
    throw new Error("invalid Dolly snapshot header");
  }
  const count = view.getUint32(12, true);
  if (count === 0 || count > 100_000) throw new Error("invalid Dolly snapshot record count");
  const records = new Map();
  let offset = 16, previous;
  for (let index = 0; index < count; index += 1) {
    if (offset > bytes.length - 16) throw new Error("truncated snapshot record");
    const kind = view.getUint32(offset, true), pathLength = view.getUint32(offset + 4, true);
    const size = view.getBigUint64(offset + 8, true);
    offset += 16;
    if (kind < 1 || kind > 3 || pathLength < 2 || pathLength >= 4096 ||
        size > BigInt(MAX_SNAPSHOT_BYTES) || (kind === 1 && size !== 0n) ||
        (kind === 3 && (size === 0n || size >= 4096n)) ||
        offset > bytes.length - pathLength - Number(size)) throw new Error("invalid snapshot record size");
    const pathBytes = bytes.subarray(offset, offset + pathLength);
    const path = decoder.decode(pathBytes);
    if (!path.startsWith("/") || /[\0\\\r\n]/.test(path) ||
        path.slice(1).split("/").some(part => !part || part === "." || part === "..") ||
        ["/tmp", "/workspace", "/home/dolly/.pi/agent/auth.json", "/home/dolly/.pi/agent/sessions"]
          .some(prefix => path === prefix || path.startsWith(`${prefix}/`)) ||
        previous && compareBytes(previous, pathBytes) >= 0) throw new Error(`invalid snapshot path ${path}`);
    previous = pathBytes;
    offset += pathLength;
    const data = bytes.subarray(offset, offset + Number(size));
    if (kind === 3 && data.includes(0)) throw new Error("invalid snapshot symlink");
    records.set(path, { kind, data });
    offset += Number(size);
  }
  if (offset !== bytes.length) throw new Error("trailing snapshot bytes");
  for (const path of records.keys()) {
    for (let slash = path.indexOf("/", 1); slash !== -1; slash = path.indexOf("/", slash + 1)) {
      const parent = records.get(path.slice(0, slash));
      if (parent && parent.kind !== 1) throw new Error(`snapshot parent is not a directory: ${path}`);
    }
  }
  return records;
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
  if (!Array.isArray(metadata.packs) || metadata.packs.length === 0 || metadata.packs.length > 256) throw new Error("invalid snapshot packs");
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
