import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { siteReference } from "../src/static-asset.mjs";
import { imageFileName, validName } from "../src/dollyfile-view.mjs";

// Recipes are published at their checkout path: core images at the top
// level, each demo's in demos/DEMO/. Returns site reference ->
// project-relative file. Image names are unique.
export async function recipeFiles(projectDir) {
  const files = new Map(), names = new Map();
  async function scan(directory) {
    for (const entry of await entries(resolve(projectDir, directory))) {
      if (!entry.isFile() || !validName(imageFileName(entry.name))) continue;
      const path = directory === "." ? entry.name : `${directory}/${entry.name}`;
      if (names.has(entry.name)) throw new Error(`${path}: ${entry.name} is already ${names.get(entry.name)}`);
      names.set(entry.name, path);
      files.set(siteReference(path), path);
    }
  }
  await scan(".");
  for (const demo of await entries(resolve(projectDir, "demos"))) {
    if (demo.isDirectory()) await scan(`demos/${demo.name}`);
  }
  return files;
}

async function entries(directory) {
  try { return await readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
}
