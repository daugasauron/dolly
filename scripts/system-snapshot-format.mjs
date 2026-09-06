import { Buffer } from "node:buffer";
import { parseWasmInterface } from "../src/wasm-interface.mjs";
import { validateProcessInterface } from "../src/process-abi.mjs";
import { decodeImageEntry as decodeSnapshotEntry } from "../src/image-entry.mjs";
import { decodeSnapshotRecords } from "../src/snapshot-records.mjs";
export { decodeSnapshotEntry };

const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

export function decodeSystemSnapshot(input) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const entries = decodeSnapshotRecords(bytes);
  const files = new Map();
  const directories = new Set(["/"]);
  for (const [path, { kind, data }] of entries) {
    if (kind === 2) files.set(path, data);
    if (kind === 1) directories.add(path);
    for (let slash = path.indexOf("/", 1); slash !== -1; slash = path.indexOf("/", slash + 1)) {
      directories.add(path.slice(0, slash));
    }
  }
  return { files, entries, directories, manifest: [...entries.keys()] };
}

// Resolve against retained records only, never the packaging machine's files.
export function resolveSnapshotFile(snapshot, path) {
  if (!path.startsWith("/") || path.includes("\0")) throw new Error("invalid snapshot file path");
  let pending = path.split("/");
  const resolved = [];
  let links = 0;
  while (pending.length) {
    const part = pending.shift();
    if (!part || part === ".") continue;
    if (part === "..") { resolved.pop(); continue; }
    const current = "/" + [...resolved, part].join("/");
    const record = snapshot.entries.get(current);
    if (record?.kind === 3) {
      if (++links > 40) throw new Error(`snapshot symlink loop: ${path}`);
      const target = decoder.decode(record.data);
      if (target.startsWith("/")) resolved.length = 0;
      pending = [...target.split("/"), ...pending];
      continue;
    }
    if (pending.length && !snapshot.directories.has(current)) {
      throw new Error(`snapshot parent is missing or not a directory: ${current}`);
    }
    if (!pending.length && record?.kind !== 2) {
      throw new Error(`snapshot file is not retained: ${current}`);
    }
    resolved.push(part);
  }
  const record = snapshot.entries.get("/" + resolved.join("/"));
  if (record?.kind !== 2) throw new Error(`snapshot file is not retained: ${path}`);
  return record.data;
}

export function validateSnapshotEntry(snapshot, contract, digest) {
  const entry = decodeSnapshotEntry(snapshot.files.get("/etc/dolly/entry"));
  validateProcessInterface(contract,
    parseWasmInterface(resolveSnapshotFile(snapshot, entry[0]), entry[0]), digest);
  return entry;
}


export function decodeSnapshotEnvironment(bytes) {
  if (!bytes) throw new Error("snapshot has an invalid environment record");
  const input = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (input.length < 16 ||
      input.subarray(0, 8).toString("ascii") !== "DOLLYENV" ||
      input.readUInt32LE(8) !== 1) {
    throw new Error("snapshot has an invalid environment record");
  }
  const count = input.readUInt32LE(12);
  if (count > 256) throw new Error("snapshot environment has too many entries");
  let offset = 16;
  const environment = new Map();
  for (let index = 0; index < count; index += 1) {
    if (offset > input.length - 8) {
      throw new Error("snapshot environment is truncated");
    }
    const nameLength = input.readUInt32LE(offset);
    const valueLength = input.readUInt32LE(offset + 4);
    offset += 8;
    if (nameLength === 0 || nameLength > 128 || valueLength > 64 * 1024 ||
        offset > input.length - nameLength - valueLength) {
      throw new Error("snapshot environment has an invalid entry");
    }
    const name = decoder.decode(input.subarray(offset, offset + nameLength));
    offset += nameLength;
    const value = decoder.decode(input.subarray(offset, offset + valueLength));
    offset += valueLength;
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(name) ||
        name.includes("\0") || value.includes("\0") || environment.has(name)) {
      throw new Error("snapshot environment has an invalid name or value");
    }
    environment.set(name, value);
  }
  if (offset !== input.length) {
    throw new Error("snapshot environment has trailing data");
  }
  return environment;
}
