#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { inspectDollyfile } from "../src/dollyfile-view.mjs";

const projectDir = resolve(import.meta.dirname, "..");
const active = new Set(), pinned = new Map();
async function pin(location) {
  if (active.has(location)) throw new Error(`${location}: recipe cycle`);
  if (pinned.has(location)) return pinned.get(location);
  active.add(location);
  const path = resolve(projectDir, location.slice(1));
  const original = await readFile(path, "utf8");
  const recipe = inspectDollyfile(original, location);
  const lines = original.split(/\r\n|\r|\n/);
  for (const reference of [...recipe.uses, ...recipe.artifacts]) {
    const sha256 = await pin(reference.location);
    const row = recipe.rows.find(row => row.line === reference.line);
    let replaced = false;
    for (let index = row.line - 1; index < row.endLine; index += 1) {
      if (!replaced && lines[index].includes(reference.sha256)) {
        lines[index] = lines[index].replace(reference.sha256, sha256);
        replaced = true;
      }
    }
    if (!replaced) throw new Error(`${location}:${row.line}: cannot locate recipe pin`);
  }
  const source = lines.join("\n");
  if (source !== original) await writeFile(path, source);
  const sha256 = createHash("sha256").update(source).digest("hex");
  active.delete(location);
  pinned.set(location, sha256);
  return sha256;
}
const images = (await readdir(projectDir)).filter(name => /^Dollyfile(?:-[a-z][a-z0-9-]*)?$/.test(name)).sort();
for (const image of images) await pin(`/${image}`);
console.log(`dolly: pinned ${pinned.size} recipes across ${images.length} images`);
