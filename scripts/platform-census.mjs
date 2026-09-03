#!/usr/bin/env node

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { discoverImageDefinitions } from "./image-definitions.mjs";
import { decodeSystemSnapshot } from "./system-snapshot-format.mjs";
import { formatWasmType, parseWasmInterface } from "./wasm-interface.mjs";

const projectDir = resolve(import.meta.dirname, "..");
const image = process.argv[2];
const definitions = await discoverImageDefinitions(projectDir);
if (!image || !definitions.some((definition) => definition.image === image)) {
  throw new Error("usage: npm run census -- IMAGE");
}

const snapshotPath = resolve(projectDir, `dist/dolly-${image}-system.snapshot`);
const metadataPath = resolve(projectDir, `dist/dolly-${image}-system-snapshot.mjs`);
const bytes = await readFile(snapshotPath);
const sha256 = createHash("sha256").update(bytes).digest("hex");
const { DOLLY_SYSTEM_SNAPSHOT: metadata } = await import(
  `${pathToFileURL(metadataPath).href}?sha256=${sha256}`
);
if (metadata.image !== image || metadata.byteLength !== bytes.length ||
    metadata.sha256 !== sha256) {
  throw new Error(`${image} snapshot does not match its sealed metadata`);
}

const infrastructure = new Set([
  "env.memory",
  "env.__indirect_function_table",
  "env.__memory_base",
  "env.__stack_pointer",
  "env.__table_base",
  "env.__table_base32",
]);

function isWasm(candidate) {
  return candidate.length >= 8 &&
    candidate[0] === 0x00 && candidate[1] === 0x61 &&
    candidate[2] === 0x73 && candidate[3] === 0x6d &&
    candidate[4] === 0x01 && candidate[5] === 0x00 &&
    candidate[6] === 0x00 && candidate[7] === 0x00;
}

function hasText(candidate, text) {
  const needle = Buffer.from(text);
  return candidate.indexOf(needle) >= 0;
}

function markdownCode(value) {
  return `\`${String(value).replaceAll("`", "\\`")}\``;
}

const { files } = decodeSystemSnapshot(bytes);
const executables = [];
const consumersByOperation = new Map();
for (const [path, candidate] of files) {
  if (!isWasm(candidate) || !hasText(candidate, "dolly.abi")) continue;
  const wasm = parseWasmInterface(candidate, path);
  const entry = wasm.exports.find((item) => item.name === "dolly_main");
  if (!wasm.customSections.includes("dolly.abi") || entry?.type.kind !== "func") {
    continue;
  }
  const imports = [];
  for (const imported of wasm.imports) {
    const name = `${imported.module}.${imported.name}`;
    if (infrastructure.has(name) || imported.module.startsWith("GOT.")) continue;
    const operation = `${name} ${formatWasmType(imported.type)}`;
    if (!imports.includes(operation)) imports.push(operation);
  }
  imports.sort();
  executables.push({ path, imports });
  for (const operation of imports) {
    const consumers = consumersByOperation.get(operation) ?? [];
    consumers.push(path);
    consumersByOperation.set(operation, consumers);
  }
}
executables.sort((left, right) => left.path.localeCompare(right.path));
const operations = [...consumersByOperation.entries()].sort(
  ([left], [right]) => left.localeCompare(right),
);

const lines = [
  `# Dolly static platform census: ${image}`,
  "",
  `Snapshot: ${markdownCode(sha256)}`,
  "",
  `Runtime build: ${markdownCode(metadata.buildId)}`,
  "",
  `${executables.length} ABI-stamped executables import ` +
    `${operations.length} distinct non-relocation operations. This is a ` +
    "link-time requirement census, not evidence that every operation executed.",
  "",
  "Infrastructure imports for shared memory/table and `GOT.*` relocation are " +
    "excluded. Everything below is an exact typed import present in at least one executable.",
  "",
  "## Operation to consumers",
  "",
  "| Typed import | Consumers |",
  "| --- | --- |",
];
for (const [operation, consumers] of operations) {
  lines.push(`| ${markdownCode(operation)} | ${consumers.map(markdownCode).join(", ")} |`);
}
lines.push(
  "",
  "## Executable to operations",
  "",
  "| Executable | Imported operations |",
  "| --- | ---: |",
);
for (const executable of executables) {
  lines.push(`| ${markdownCode(executable.path)} | ${executable.imports.length} |`);
}
lines.push("");

const outputPath = resolve(projectDir, `build/platform-census-${image}.md`);
await mkdir(resolve(projectDir, "build"), { recursive: true });
await writeFile(outputPath, lines.join("\n"));
console.log(
  `dolly: wrote ${image} census for ${executables.length} executables and ` +
  `${operations.length} operations to ${outputPath}`,
);
