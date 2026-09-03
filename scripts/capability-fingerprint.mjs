#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { discoverImageDefinitions } from "./image-definitions.mjs";
import { formatWasmType, parseWasmInterface } from "./wasm-interface.mjs";

const projectDir = resolve(import.meta.dirname, "..");
const image = process.argv[2];
const definitions = await discoverImageDefinitions(projectDir);
if (!image || !definitions.some((definition) => definition.image === image)) {
  throw new Error("usage: npm run fingerprint -- IMAGE");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digestRecord(value) {
  return sha256(`${canonical(value)}\n`);
}

const [runtimeBytes, browserPolicyBytes, abiEntries, snapshotBytes] = await Promise.all([
  readFile(resolve(projectDir, "dist/dolly.wasm")),
  readFile(resolve(projectDir, "config/browser-imports.json")),
  readdir(resolve(projectDir, "abi"), { withFileTypes: true }),
  readFile(resolve(projectDir, `dist/dolly-${image}-system.snapshot`)),
]);
const browserPolicy = JSON.parse(browserPolicyBytes);
const snapshotSha256 = sha256(snapshotBytes);
const metadataPath = resolve(projectDir, `dist/dolly-${image}-system-snapshot.mjs`);
const { DOLLY_SYSTEM_SNAPSHOT: metadata } = await import(
  `${pathToFileURL(metadataPath).href}?sha256=${snapshotSha256}`
);
const { DOLLY_BUILD_ID: buildId } = await import(
  `${pathToFileURL(resolve(projectDir, "dist/dolly-build-id.mjs")).href}` +
  `?runtime=${sha256(runtimeBytes)}`
);
if (metadata.image !== image || metadata.buildId !== buildId ||
    metadata.byteLength !== snapshotBytes.length || metadata.sha256 !== snapshotSha256) {
  throw new Error(`${image} snapshot does not match its sealed runtime metadata`);
}

const configuredGroups = new Map();
for (const [group, names] of Object.entries(browserPolicy)) {
  if (!Array.isArray(names) || names.length === 0) {
    throw new Error(`browser import group ${group} must be a nonempty array`);
  }
  for (const name of names) {
    if (configuredGroups.has(name)) {
      throw new Error(`browser import ${name} appears in multiple policy groups`);
    }
    configuredGroups.set(name, group);
  }
}

const runtime = parseWasmInterface(runtimeBytes, "dist/dolly.wasm");
const imports = runtime.imports.map((entry) => {
  const name = `${entry.module}.${entry.name}`;
  const group = configuredGroups.get(name);
  if (!group) throw new Error(`runtime browser import is unclassified: ${name}`);
  return { group, name, type: formatWasmType(entry.type) };
}).sort((left, right) => left.name.localeCompare(right.name));
const actualNames = new Set(imports.map((entry) => entry.name));
for (const name of configuredGroups.keys()) {
  if (!actualNames.has(name)) throw new Error(`configured browser import is absent: ${name}`);
}
const network = imports.filter((entry) => entry.group === "network");
if (network.length !== 1 || network[0].name !== "env.dolly_http_dispatch") {
  throw new Error("the agent-selected network edge is no longer exactly dolly_http_dispatch");
}

const stamps = runtime.customSectionData.filter((section) => section.name === "dolly.abi");
if (stamps.length !== 1 || stamps[0].data.length !== 32) {
  throw new Error("runtime must carry exactly one SHA-256-sized dolly.abi stamp");
}
const abiContracts = [];
const abiSources = [];
for (const entry of abiEntries.filter((candidate) =>
  candidate.isFile() && candidate.name.endsWith(".wat")).sort((left, right) =>
  left.name.localeCompare(right.name))) {
  const wasmName = entry.name.replace(/\.wat$/, ".wasm");
  const [source, wasmBytes] = await Promise.all([
    readFile(resolve(projectDir, "abi", entry.name)),
    readFile(resolve(projectDir, "build", wasmName)),
  ]);
  const contract = parseWasmInterface(wasmBytes, `build/${wasmName}`);
  const interfaceRecord = {
    imports: contract.imports.map((item) =>
      `${item.module}.${item.name} ${formatWasmType(item.type)}`).sort(),
    exports: contract.exports.map((item) =>
      `${item.name} ${formatWasmType(item.type)}`).sort(),
  };
  abiContracts.push({
    name: entry.name.slice(0, -4),
    ...interfaceRecord,
    interfaceSha256: digestRecord(interfaceRecord),
  });
  abiSources.push({ path: `abi/${entry.name}`, sha256: sha256(source) });
}

const authority = {
  abiStamp: Buffer.from(stamps[0].data).toString("hex"),
  abiContracts,
  browserImports: imports,
  networkEdge: network[0],
};
const capsule = {
  image,
  runtimeBuildId: buildId,
  runtimeSha256: sha256(runtimeBytes),
  snapshot: {
    byteLength: snapshotBytes.length,
    sha256: snapshotSha256,
    recipes: metadata.recipes,
    entry: metadata.entry,
    retainedManifestSha256: digestRecord(metadata.manifest),
  },
};
const payload = {
  schema: "dolly-capability-fingerprint-1",
  authority,
  capsule,
  provenance: { abiSources },
};
const result = {
  ...payload,
  authoritySha256: digestRecord(authority),
  fingerprintSha256: digestRecord(payload),
};
const outputPath = resolve(projectDir, `build/capability-fingerprint-${image}.json`);
await mkdir(resolve(projectDir, "build"), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(
  `dolly: ${image} authority ${result.authoritySha256}; ` +
  `capsule fingerprint ${result.fingerprintSha256}`,
);
console.log(`dolly: wrote ${outputPath}`);
