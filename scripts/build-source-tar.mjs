#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, open, readdir, stat } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

const [, , outputArgument, ...mappingArguments] = process.argv;
if (!outputArgument || mappingArguments.length === 0 || mappingArguments.length % 2 !== 0) {
  throw new Error("usage: build-source-tar.mjs OUTPUT INPUT ARCHIVE-PATH [...]");
}

const projectDir = resolve(import.meta.dirname, "..");
const output = resolve(projectDir, outputArgument);
const records = [];

function validArchivePath(value) {
  return value.startsWith("/") && value.length <= 255 &&
    !value.includes("\\") && !value.includes("\0") && !value.includes("//") &&
    !value.split("/").some((part) => part === "." || part === "..");
}

async function collect(input, destination) {
  const metadata = await stat(input);
  if (metadata.isFile()) {
    records.push({ input, path: destination.slice(1), size: metadata.size });
    return;
  }
  if (!metadata.isDirectory()) throw new Error(`unsupported source input ${input}`);
  const entries = await readdir(input, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
  for (const entry of entries) {
    if (!entry.isFile() && !entry.isDirectory()) {
      throw new Error(`source archives reject non-file input ${join(input, entry.name)}`);
    }
    await collect(join(input, entry.name), `${destination}/${entry.name}`);
  }
}

for (let index = 0; index < mappingArguments.length; index += 2) {
  const input = resolve(projectDir, mappingArguments[index]);
  const destination = mappingArguments[index + 1].replace(/\/+$/, "");
  if (!validArchivePath(destination)) {
    throw new Error(`unsafe archive destination ${JSON.stringify(destination)}`);
  }
  await collect(input, destination);
}

records.sort((left, right) => left.path.localeCompare(right.path, "en"));
for (let index = 1; index < records.length; index += 1) {
  if (records[index - 1].path === records[index].path) {
    throw new Error(`duplicate archive path /${records[index].path}`);
  }
}

function writeString(header, offset, length, value) {
  const bytes = Buffer.from(value);
  if (bytes.length > length) throw new Error(`ustar field is too long: ${value}`);
  bytes.copy(header, offset);
}

function writeOctal(header, offset, length, value) {
  const text = Number(value).toString(8);
  if (text.length > length - 1) throw new Error(`ustar number is too large: ${value}`);
  writeString(header, offset, length, `${text.padStart(length - 1, "0")}\0`);
}

function splitPath(path) {
  const bytes = Buffer.byteLength(path);
  if (bytes <= 100) return { name: path, prefix: "" };
  for (let index = path.length - 1; index >= 0; index -= 1) {
    if (path[index] !== "/") continue;
    const prefix = path.slice(0, index);
    const name = path.slice(index + 1);
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(name) <= 100) {
      return { name, prefix };
    }
  }
  throw new Error(`path does not fit ustar: ${path}`);
}

function headerFor(record) {
  const header = Buffer.alloc(512);
  const { name, prefix } = splitPath(record.path);
  writeString(header, 0, 100, name);
  writeOctal(header, 100, 8, 0o644);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, record.size);
  writeOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  header[156] = "0".charCodeAt(0);
  writeString(header, 257, 6, "ustar\0");
  writeString(header, 263, 2, "00");
  writeString(header, 345, 155, prefix);
  const checksum = header.reduce((total, byte) => total + byte, 0);
  writeString(header, 148, 8, `${checksum.toString(8).padStart(6, "0")}\0 `);
  return header;
}

await mkdir(dirname(output), { recursive: true });
const file = await open(output, "w");
const digest = createHash("sha256");
let total = 0;
async function emit(bytes) {
  await file.write(bytes);
  digest.update(bytes);
  total += bytes.length;
}

try {
  for (const record of records) {
    await emit(headerFor(record));
    const source = await open(record.input, "r");
    try {
      const buffer = Buffer.alloc(64 * 1024);
      let position = 0;
      while (position < record.size) {
        const { bytesRead } = await source.read(
          buffer,
          0,
          Math.min(buffer.length, record.size - position),
          position,
        );
        if (bytesRead === 0) throw new Error(`short read from ${record.input}`);
        await emit(buffer.subarray(0, bytesRead));
        position += bytesRead;
      }
    } finally {
      await source.close();
    }
    const padding = (512 - (record.size % 512)) % 512;
    if (padding !== 0) await emit(Buffer.alloc(padding));
  }
  await emit(Buffer.alloc(1024));
} finally {
  await file.close();
}

console.log(
  `dolly: wrote ${records.length} files, ${total} bytes, ` +
  `${digest.digest("hex")} to ${relative(projectDir, output).split(sep).join("/")}`,
);
