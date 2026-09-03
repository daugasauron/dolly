#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const projectDir = resolve(import.meta.dirname, "..");
const manifestPath = resolve(projectDir, "config/pi-runtime-packages.txt");
const lock = JSON.parse(await readFile(resolve(projectDir, "package-lock.json"), "utf8"));
const packageRootPrefix =
  "node_modules/@earendil-works/pi-coding-agent/node_modules/";

const names = (await readFile(manifestPath, "utf8"))
  .split(/\r?\n/)
  .map((line) => line.replace(/#.*$/, "").trim())
  .filter(Boolean);
if (names.length === 0 || new Set(names).size !== names.length) {
  throw new Error("Pi runtime package manifest is empty or contains duplicates");
}
const sorted = [...names].sort((left, right) => left.localeCompare(right, "en"));
if (JSON.stringify(names) !== JSON.stringify(sorted)) {
  throw new Error("Pi runtime package manifest must be sorted byte-for-byte");
}
for (const name of names) {
  if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/.test(name) ||
      name.startsWith("@earendil-works/pi-")) {
    throw new Error(`invalid external Pi runtime package: ${name}`);
  }
}

const mappings = [];
const versions = [];
for (const name of names) {
  const root = `${packageRootPrefix}${name}`;
  const installed = JSON.parse(await readFile(resolve(projectDir, root, "package.json"), "utf8"));
  const locked = lock.packages?.[root];
  if (!locked || typeof locked.integrity !== "string" ||
      locked.version !== installed.version || installed.name !== name) {
    throw new Error(`Pi runtime package is not exact in package-lock.json: ${name}`);
  }
  mappings.push(root, `/usr/lib/node_modules/${name}`);
  versions.push(`${name}@${installed.version}`);
}

const command = spawnSync(
  process.execPath,
  [
    resolve(projectDir, "scripts/build-source-tar.mjs"),
    "dist/static/default/pi-runtime-packages.tar",
    "--exclude-suffix=.map",
    ...mappings,
  ],
  { cwd: projectDir, encoding: "utf8" },
);
if (command.stdout) process.stdout.write(command.stdout);
if (command.stderr) process.stderr.write(command.stderr);
if (command.status !== 0) {
  throw new Error(`could not archive Pi runtime packages (status ${command.status})`);
}
console.log(
  `dolly: archived ${versions.length} locked external Pi runtime packages: ` +
  versions.join(", "),
);
