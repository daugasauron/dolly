#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { inspectDollyfile } from "../src/dollyfile-view.mjs";
import { recipeFiles } from "./recipe-files.mjs";
import { publishedHeaders, publishedDocument } from "./host-modules.mjs";
import { siteReference, sitePath } from "../src/static-asset.mjs";
import { discoverImageDefinitions, selectImageDefinitions } from "./image-definitions.mjs";

// Writes this version into every site reference, then the pins. SOURCES
// selects the images whose source pins are refreshed (DOLLY_BUILD_IMAGES
// syntax, "all" for every image): preparation stages only their closure.
export async function updateRecipePins(projectDir, sources) {
  const active = new Set(), pinned = new Map();
  const files = await recipeFiles(projectDir);
  const refreshed = new Set(sources === undefined ? [] : (await selectImageDefinitions(
    await discoverImageDefinitions(projectDir), sources)).map(({ filename }) => filename));
  async function pin(location) {
    if (active.has(location)) throw new Error(`${location}: recipe cycle`);
    if (pinned.has(location)) return pinned.get(location);
    active.add(location);
    if (!files.has(location)) throw new Error(`${location}: no such recipe`);
    const path = resolve(projectDir, files.get(location));
    const original = await readFile(path, "utf8");
    const recipe = inspectDollyfile(original, location);
    const lines = original.split(/\r\n|\r|\n/);
    // Replaces one operand of a reference's row: its location or its pin.
    function replace(reference, operand, value) {
      const current = reference[operand];
      if (current === value) return;
      const row = recipe.rows.find(row => row.line === reference.line);
      for (let index = row.line - 1; index < row.endLine; index += 1) {
        for (let offset = 0; (offset = lines[index].indexOf(current, offset)) !== -1; offset += current.length) {
          const candidate = [...lines];
          candidate[index] = lines[index].slice(0, offset) + value + lines[index].slice(offset + current.length);
          // Let the parser distinguish an operand from identical path/comment text.
          const parsed = inspectDollyfile(candidate.join("\n"), location);
          const updated = [...parsed.sources, ...parsed.artifacts]
            .find(item => item.line === reference.line);
          if (updated?.[operand] === value && Object.entries(reference)
            .every(([key, kept]) => key === operand || updated[key] === kept)) {
            lines[index] = candidate[index];
            reference[operand] = value;
            return;
          }
        }
      }
      throw new Error(`${location}:${row.line}: cannot locate recipe ${operand}`);
    }
    for (const reference of [...recipe.sources, ...recipe.artifacts]) {
      replace(reference, "location", reference.location.replace(/^\/v[^/]+\//, siteReference("")));
    }
    if (refreshed.has(files.get(location))) for (const source of recipe.sources) {
      const path = sitePath(source.location);
      if (path === null) continue;
      if (!path.startsWith("/dist/static/") && !publishedHeaders.has(path) && !publishedDocument(path)) {
        throw new Error(`${location}: ${source.location} is outside trusted build inputs`);
      }
      const bytes = await readFile(resolve(projectDir, path.slice(1)));
      replace(source, "sha256", createHash("sha256").update(bytes).digest("hex"));
    }
    for (const reference of recipe.artifacts) {
      replace(reference, "sha256", await pin(reference.location));
    }
    const source = lines.join("\n");
    if (source !== original) await writeFile(path, source);
    const sha256 = createHash("sha256").update(source).digest("hex");
    active.delete(location);
    pinned.set(location, sha256);
    return sha256;
  }
  const images = [...files.keys()].sort();
  for (const image of images) await pin(image);
  return { recipes: pinned.size, images: images.length };
}

if (process.argv[1] === import.meta.filename) {
  const refreshSources = process.argv[2] === "--sources";
  if (process.argv.length > (refreshSources ? 3 : 2)) throw new Error("usage: update-recipe-pins.mjs [--sources]");
  const result = await updateRecipePins(resolve(import.meta.dirname, ".."),
    refreshSources ? process.env.DOLLY_BUILD_IMAGES ?? "all" : undefined);
  console.log(`dolly: pinned ${result.recipes} recipes across ${result.images} images`);
}
