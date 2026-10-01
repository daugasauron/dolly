import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { CANONICAL_ORIGIN } from "../src/static-asset.mjs";

const imageName = /^Dollyfile(?:-[a-z][a-z0-9-]*)?$/;
const moduleName = /^[a-z][a-z0-9-]{0,63}\.dm$/;

// Recipes are published flat on the canonical origin: /Dollyfile-NAME and
// /modules/NAME.dm. Core images live at the top level and core modules in
// modules/; each demo keeps both kinds directly in demos/DEMO/. Returns
// canonical URL -> project-relative file. Names must be unique.
export async function recipeFiles(projectDir) {
  const files = new Map();
  async function scan(directory, images, modules) {
    for (const entry of await entries(resolve(projectDir, directory))) {
      if (!entry.isFile()) continue;
      const location = images && imageName.test(entry.name) ? `${CANONICAL_ORIGIN}/${entry.name}`
        : modules && moduleName.test(entry.name) ? `${CANONICAL_ORIGIN}/modules/${entry.name}` : null;
      if (!location) continue;
      const path = directory === "." ? entry.name : `${directory}/${entry.name}`;
      if (files.has(location)) throw new Error(`${path}: ${location} is already ${files.get(location)}`);
      files.set(location, path);
    }
  }
  await scan(".", true, false);
  await scan("modules", false, true);
  for (const demo of await entries(resolve(projectDir, "demos"))) {
    if (demo.isDirectory()) await scan(`demos/${demo.name}`, true, true);
  }
  return files;
}

async function entries(directory) {
  try { return await readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
}

// The demo that owns a recipe file, or null for core.
export const recipeDemo = path => /^demos\/([^/]+)\//.exec(path)?.[1] ?? null;
