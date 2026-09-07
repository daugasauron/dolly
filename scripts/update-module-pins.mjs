#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { inspectDollyfile } from "../src/dollyfile-view.mjs";

export async function updateRecipePins(projectDir, refreshSources = false) {
  const active = new Set(), pinned = new Map();
  async function pin(location) {
    if (active.has(location)) throw new Error(`${location}: recipe cycle`);
    if (pinned.has(location)) return pinned.get(location);
    active.add(location);
    const path = resolve(projectDir, location.slice(1));
    const original = await readFile(path, "utf8");
    const recipe = inspectDollyfile(original, location);
    const lines = original.split(/\r\n|\r|\n/);
    function replacePin(reference, sha256) {
      if (reference.sha256 === sha256) return;
      const row = recipe.rows.find(row => row.line === reference.line);
      for (let index = row.line - 1; index < row.endLine; index += 1) {
        for (let offset = 0; (offset = lines[index].indexOf(reference.sha256, offset)) !== -1; offset += reference.sha256.length) {
          const candidate = [...lines];
          candidate[index] = lines[index].slice(0, offset) + sha256 +
            lines[index].slice(offset + reference.sha256.length);
          // Let the parser distinguish a pin from identical path/comment text.
          const parsed = inspectDollyfile(candidate.join("\n"), location);
          const updated = [...parsed.sources, ...parsed.uses, ...parsed.artifacts]
            .find(item => item.line === reference.line);
          if (updated?.sha256 === sha256 && Object.entries(reference)
            .every(([key, value]) => key === "sha256" || updated[key] === value)) {
            lines[index] = candidate[index];
            return;
          }
        }
      }
      throw new Error(`${location}:${row.line}: cannot locate recipe pin`);
    }
    if (refreshSources) for (const source of recipe.sources) {
      if (source.transport !== "host") continue;
      const input = source.location.startsWith("/static/") ? `dist${source.location}`
        : source.location.startsWith("/include/dolly/") ? source.location.slice(1) : null;
      if (!input) throw new Error(`${location}: HOST source is outside trusted build inputs`);
      let bytes;
      try { bytes = await readFile(resolve(projectDir, input)); }
      catch (error) {
        // Other catalog images may not have been staged by this selected build.
        // verify-static-sources still requires every selected input to exist.
        if (error.code === "ENOENT") continue;
        throw error;
      }
      replacePin(source, createHash("sha256").update(bytes).digest("hex"));
    }
    for (const reference of [...recipe.uses, ...recipe.artifacts]) {
      const sha256 = await pin(reference.location);
      replacePin(reference, sha256);
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
  return { recipes: pinned.size, images: images.length };
}

if (process.argv[1] === import.meta.filename) {
  const refreshSources = process.argv[2] === "--sources";
  if (process.argv.length > (refreshSources ? 3 : 2)) throw new Error("usage: update-module-pins.mjs [--sources]");
  const result = await updateRecipePins(resolve(import.meta.dirname, ".."), refreshSources);
  console.log(`dolly: pinned ${result.recipes} recipes across ${result.images} images`);
}
