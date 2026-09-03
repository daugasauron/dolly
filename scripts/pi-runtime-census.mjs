#!/usr/bin/env node

import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

const projectDir = resolve(import.meta.dirname, "..");
const manifestPath = resolve(projectDir, "config/pi-runtime-packages.txt");
const outputPath = resolve(projectDir, "build/pi-runtime-census.md");
const lock = JSON.parse(await readFile(resolve(projectDir, "package-lock.json"), "utf8"));
const lockPrefix = "node_modules/@earendil-works/pi-coding-agent/node_modules/";
const packageRootPrefix = resolve(
  projectDir,
  lockPrefix,
);
const names = (await readFile(manifestPath, "utf8"))
  .split(/\r?\n/)
  .map((line) => line.replace(/#.*$/, "").trim())
  .filter(Boolean);

const candidateGroups = ["maps", "declarations", "typescript", "testsAndDocs"];

function emptyCandidates() {
  return Object.fromEntries(candidateGroups.map((name) => [name, { files: 0, bytes: 0 }]));
}

function candidateGroup(path) {
  const lower = path.toLowerCase();
  if (lower.endsWith(".map")) return "maps";
  if (/\.d\.(?:ts|mts|cts)$/.test(lower)) return "declarations";
  if (/\.(?:ts|mts|cts|tsx)$/.test(lower)) return "typescript";
  if (/(?:^|\/)(?:test|tests|testing|docs?|examples?|coverage)(?:\/|$)/.test(lower) ||
      /(?:^|\/)(?:readme|changelog)(?:\.|$)/.test(lower)) {
    return "testsAndDocs";
  }
  return undefined;
}

async function treeFacts(root, path = root) {
  let files = 0;
  let bytes = 0;
  let nativeAddons = 0;
  let embeddedWasm = 0;
  const licenseFiles = [];
  const candidates = emptyCandidates();
  const entries = await readdir(path, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
  for (const entry of entries) {
    const child = resolve(path, entry.name);
    if (entry.isDirectory()) {
      const nested = await treeFacts(root, child);
      files += nested.files;
      bytes += nested.bytes;
      nativeAddons += nested.nativeAddons;
      embeddedWasm += nested.embeddedWasm;
      licenseFiles.push(...nested.licenseFiles);
      for (const group of candidateGroups) {
        candidates[group].files += nested.candidates[group].files;
        candidates[group].bytes += nested.candidates[group].bytes;
      }
    } else if (entry.isFile()) {
      const metadata = await stat(child);
      const pathFromRoot = relative(root, child).split(sep).join("/");
      files++;
      bytes += metadata.size;
      if (pathFromRoot.endsWith(".node")) nativeAddons++;
      if (pathFromRoot.endsWith(".wasm")) embeddedWasm++;
      if (!pathFromRoot.includes("/") &&
          /^(?:licen[cs]e|copying|notice)(?:[._-]|$)/i.test(pathFromRoot)) {
        licenseFiles.push(pathFromRoot);
      }
      const group = candidateGroup(pathFromRoot);
      if (group) {
        candidates[group].files++;
        candidates[group].bytes += metadata.size;
      }
    }
  }
  return { files, bytes, nativeAddons, embeddedWasm, licenseFiles, candidates };
}

function licenseExpression(manifest) {
  if (typeof manifest.license === "string") return manifest.license;
  if (manifest.license && typeof manifest.license.type === "string") {
    return manifest.license.type;
  }
  if (Array.isArray(manifest.licenses)) {
    return manifest.licenses
      .map((license) => typeof license === "string" ? license : license?.type)
      .filter(Boolean)
      .join(" OR ");
  }
  return "UNDECLARED";
}

const records = [];
for (const name of names) {
  const root = resolve(packageRootPrefix, name);
  const manifest = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
  const locked = lock.packages?.[`${lockPrefix}${name}`];
  if (!locked || locked.version !== manifest.version ||
      typeof locked.integrity !== "string") {
    throw new Error(`Pi runtime package is not exact in package-lock.json: ${name}`);
  }
  const lifecycleScripts = ["preinstall", "install", "postinstall"]
    .filter((script) => typeof manifest.scripts?.[script] === "string");
  records.push({
    name,
    version: manifest.version,
    integrity: locked.integrity,
    license: licenseExpression(manifest),
    lifecycleScripts,
    gypfile: manifest.gypfile === true,
    ...await treeFacts(root),
  });
}
const totals = records.reduce(
  (result, record) => ({
    files: result.files + record.files,
    bytes: result.bytes + record.bytes,
    nativeAddons: result.nativeAddons + record.nativeAddons,
    embeddedWasm: result.embeddedWasm + record.embeddedWasm,
    lifecyclePackages: result.lifecyclePackages +
      (record.lifecycleScripts.length > 0 ? 1 : 0),
    packagesWithoutLicenseFile: result.packagesWithoutLicenseFile +
      (record.licenseFiles.length === 0 ? 1 : 0),
    candidateFiles: result.candidateFiles + candidateGroups.reduce(
      (count, group) => count + record.candidates[group].files,
      0,
    ),
    candidateBytes: result.candidateBytes + candidateGroups.reduce(
      (count, group) => count + record.candidates[group].bytes,
      0,
    ),
  }),
  { files: 0, bytes: 0, nativeAddons: 0, embeddedWasm: 0,
    lifecyclePackages: 0, packagesWithoutLicenseFile: 0,
    candidateFiles: 0, candidateBytes: 0 },
);
const number = (value) => value.toLocaleString("en-US");
const candidateTotals = Object.fromEntries(candidateGroups.map((group) => [
  group,
  records.reduce((result, record) => ({
    files: result.files + record.candidates[group].files,
    bytes: result.bytes + record.candidates[group].bytes,
  }), { files: 0, bytes: 0 }),
]));
const retainedFiles = totals.files - candidateTotals.maps.files;
const retainedBytes = totals.bytes - candidateTotals.maps.bytes;
const remainingCandidateFiles = totals.candidateFiles - candidateTotals.maps.files;
const remainingCandidateBytes = totals.candidateBytes - candidateTotals.maps.bytes;
const report = `# Pi runtime package census

This report describes the explicit external package profile archived for the
source-built Pi command. The package names are source-visible in
\`config/pi-runtime-packages.txt\`; versions and integrity records come from
\`package-lock.json\`. Pi's seven workspace packages are compiled inside Dolly
from the separately pinned Git tree and are not part of this archive.

- external packages: ${number(records.length)}
- package files before the explicit archive filter: ${number(totals.files)}
- package bytes before the explicit archive filter: ${number(totals.bytes)}
- retained files before deterministic tar normalization: ${number(retainedFiles)}
- retained bytes before deterministic tar normalization: ${number(retainedBytes)}
- explicitly excluded source maps: ${number(candidateTotals.maps.files)} files / ${number(candidateTotals.maps.bytes)} bytes
- browser or host module-loader calls: none
- packages declaring install lifecycle scripts: ${number(totals.lifecyclePackages)}
- archived native \`.node\` addons: ${number(totals.nativeAddons)}
- archived nested \`.wasm\` modules: ${number(totals.embeddedWasm)}
- packages without a root license file: ${number(totals.packagesWithoutLicenseFile)}
- remaining conservative trim candidates: ${number(remainingCandidateFiles)} files / ${number(remainingCandidateBytes)} bytes

The archive builder does **not** execute lifecycle scripts or native addons.
QuickJS/Janis has no source-map consumer, so generated \`.map\` files are the
one explicit excluded class. The remaining candidate count is an inventory,
not an unused-code claim: declarations, TypeScript sources, tests, docs, and
examples remain in the archive until runtime reachability and license-retention
rules justify another exact pruning policy.

| Candidate class | Files | Bytes | Archive action |
| --- | ---: | ---: | --- |
${candidateGroups.map((group) =>
    `| ${group} | ${number(candidateTotals[group].files)} | ${number(candidateTotals[group].bytes)} | ` +
      `${group === "maps" ? "exclude" : "retain pending evidence"} |`,
  ).join("\n")}

| Package | Version | License | Root license files | Files | Bytes | Lifecycle/native review |
| --- | --- | --- | --- | ---: | ---: | --- |
${records.map((record) =>
    `| \`${record.name}\` | \`${record.version}\` | ${record.license} | ` +
      `${record.licenseFiles.map((path) => `\`${path}\``).join(", ") || "none"} | ` +
      `${number(record.files)} | ${number(record.bytes)} | ` +
      `${[
        ...record.lifecycleScripts.map((script) => `\`${script}\``),
        ...(record.gypfile ? ["\`gypfile\`"] : []),
        ...(record.nativeAddons ? [`${record.nativeAddons} native addon(s)`] : []),
        ...(record.embeddedWasm ? [`${record.embeddedWasm} nested Wasm module(s)`] : []),
      ].join(", ") || "none"} |`,
  ).join("\n")}

## Exact lock identities

| Package | Integrity |
| --- | --- |
${records.map((record) => `| \`${record.name}@${record.version}\` | \`${record.integrity}\` |`).join("\n")}
`;

await writeFile(outputPath, report);
console.log(
  `dolly: Pi runtime census found ${records.length} external packages, ` +
  `${totals.files} files, and ${totals.bytes} bytes; wrote ${outputPath}`,
);
