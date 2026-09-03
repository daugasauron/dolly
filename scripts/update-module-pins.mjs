#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectDir = resolve(import.meta.dirname, "..");
const modulesDir = resolve(projectDir, "modules");
const usePattern = /^USE HOST (\/modules\/[A-Za-z0-9._-]+\.dm)[ \t]+([0-9a-f]{64})$/gm;
const tableLinePattern = /^(USE|SOURCE|REQUIRES|EXPORTS)\b/;
const fieldPattern = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\S+/g;

function digest(source) {
  return createHash("sha256").update(source).digest("hex");
}

function tableFields(line) {
  const fields = line.match(fieldPattern);
  if (fields[0] === "EXPORTS" && fields[1] === "ENV" && fields.length > 4) {
    return [...fields.slice(0, 3), fields.slice(3).join(" ")];
  }
  return fields;
}

function alignTables(source) {
  const lines = source.split("\n");
  for (let start = 0; start < lines.length;) {
    const first = tableLinePattern.exec(lines[start]);
    if (!first) {
      start += 1;
      continue;
    }
    const directive = first[1];
    let end = start + 1;
    while (end < lines.length && tableLinePattern.exec(lines[end])?.[1] === directive) end += 1;
    const rows = lines.slice(start, end).map(tableFields);
    const columns = Math.max(...rows.map((row) => row.length));
    const widths = Array.from({ length: columns }, (_, column) =>
      Math.max(...rows.map((row) => row[column]?.length ?? 0)));
    for (let index = 0; index < rows.length; index += 1) {
      lines[start + index] = rows[index].map((field, column) =>
        column + 1 === rows[index].length ? field : field.padEnd(widths[column] + 1)).join("");
    }
    start = end;
  }
  return lines.join("\n");
}

const selected = new Set();
const visiting = new Set();
const pinned = new Map();

async function pinModule(location) {
  if (!location.startsWith("/modules/") || !location.endsWith(".dm") || location.includes("..")) {
    throw new Error(`invalid nested module location ${location}`);
  }
  if (pinned.has(location)) return pinned.get(location);
  if (visiting.has(location)) throw new Error(`module USE cycle at ${location}`);
  visiting.add(location);
  selected.add(location.split("/").at(-1));

  const modulePath = resolve(projectDir, location.slice(1));
  const original = await readFile(modulePath, "utf8");
  let source = alignTables(original);
  for (const match of [...source.matchAll(usePattern)]) {
    const sha256 = await pinModule(match[1]);
    source = source.replace(match[0], `USE HOST ${match[1]} ${sha256}`);
  }
  source = alignTables(source);
  if (source !== original) await writeFile(modulePath, source);

  visiting.delete(location);
  const sha256 = digest(source);
  pinned.set(location, sha256);
  return sha256;
}

const rootNames = (await readdir(projectDir, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && /^Dollyfile(?:-[a-z][a-z0-9-]*)?$/.test(entry.name))
  .map((entry) => entry.name)
  .sort();
for (const rootName of rootNames) {
  const rootPath = resolve(projectDir, rootName);
  let root = alignTables(await readFile(rootPath, "utf8"));
  for (const match of [...root.matchAll(usePattern)]) {
    const sha256 = await pinModule(match[1]);
    root = root.replace(match[0], `USE HOST ${match[1]} ${sha256}`);
  }
  await writeFile(rootPath, alignTables(root));
}

const available = (await readdir(modulesDir)).filter((name) => name.endsWith(".dm")).sort();
const omitted = available.filter((name) => !selected.has(name));
if (omitted.length) throw new Error(`Dollyfile does not select modules: ${omitted.join(", ")}`);
console.log(`dolly: pinned ${selected.size} modules across ${rootNames.length} images`);
