import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { CANONICAL_ORIGIN } from "../src/static-asset.mjs";
import { imageFileName, moduleFileName, validName } from "../src/dollyfile-view.mjs";

// Recipes are published at their checkout path on the canonical origin: core
// images at the top level, core modules in modules/, each demo's images and
// modules in demos/DEMO/. Returns canonical URL -> project-relative file.
// Image and module names are unique.
export async function recipeFiles(projectDir) {
  const files = new Map(), names = new Map();
  async function scan(directory, images, modules) {
    for (const entry of await entries(resolve(projectDir, directory))) {
      const name = images ? imageFileName(entry.name) : moduleFileName(entry.name);
      if (!entry.isFile() || !validName(name)) continue;
      const path = directory === "." ? entry.name : `${directory}/${entry.name}`;
      if (names.has(entry.name)) throw new Error(`${path}: ${entry.name} is already ${names.get(entry.name)}`);
      names.set(entry.name, path);
      files.set(`${CANONICAL_ORIGIN}/${path}`, path);
    }
  }
  await scan(".", true, false);
  await scan("modules", false, true);
  for (const demo of await entries(resolve(projectDir, "demos"))) {
    if (!demo.isDirectory()) continue;
    await scan(`demos/${demo.name}`, true, false);
    await scan(`demos/${demo.name}`, false, true);
  }
  return files;
}

async function entries(directory) {
  try { return await readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
}
