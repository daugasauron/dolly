import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadRecipeGraph } from "../src/dollyfile-graph.mjs";
import { recipeFileName } from "../src/dollyfile-view.mjs";
import { recipeFiles } from "./recipe-files.mjs";
import { siteReference } from "../src/static-asset.mjs";

// Loads catalog recipe graphs from a project directory, sharing parsed recipes.
export function createDollyfileGraphLoader(projectDir) {
  const recipes = new Map();
  let files;
  async function read(reference) {
    files ??= recipeFiles(projectDir);
    const path = (await files).get(reference);
    if (!path) throw new Error(`${reference}: no such recipe`);
    return readFile(resolve(projectDir, path));
  }
  return (rootFilename = "Dollyfile") => loadRecipeGraph(read, siteReference(rootFilename), recipes);
}

export function loadDollyfileGraph(projectDir, rootFilename = "Dollyfile") {
  return createDollyfileGraphLoader(projectDir)(rootFilename);
}

// The recipe provenance /bin/dollyfile records, in its order.
export function recipeRecords(graph) {
  const records = [], seen = new Set();
  function visit(record) {
    if (seen.has(record.location)) return;
    seen.add(record.location);
    for (const { target } of record.artifactTargets) visit(target);
    records.push({
      kind: record.kind, name: record.name, locator: record.location,
      sourcePath: record.location,
      retainedPath: `/etc/dolly/recipes/${recipeFileName(record.location)}`,
      sha256: record.sha256, byteLength: Buffer.byteLength(record.source),
    });
  }
  visit(graph.root);
  return records;
}
