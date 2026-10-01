import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadRecipeGraph } from "../src/dollyfile-graph.mjs";
import { recipeFiles } from "./recipe-files.mjs";
import { CANONICAL_ORIGIN } from "../src/static-asset.mjs";

// Loads catalog recipe graphs from a project directory, sharing parsed recipes.
export function createDollyfileGraphLoader(projectDir) {
  const recipes = new Map();
  let files;
  async function read(url) {
    files ??= recipeFiles(projectDir);
    const path = (await files).get(url);
    if (!path) throw new Error(`${url}: no such recipe`);
    return readFile(resolve(projectDir, path));
  }
  return (rootFilename = "Dollyfile") => loadRecipeGraph(read, `${CANONICAL_ORIGIN}/${rootFilename}`, recipes);
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
    const children = [
      ...record.children.map(target => ({ line: target.selectedAt, target })),
      ...record.artifactTargets.map(({ reference, target }) => ({ line: reference.line, target })),
    ].sort((a, b) => a.line - b.line);
    for (const { target } of children) visit(target);
    records.push({
      kind: record.kind, name: record.name, locator: record.location,
      sourcePath: record.location,
      retainedPath: record.kind === "image"
        ? `/etc/dolly/recipes/${record.name}.Dollyfile`
        : `/etc/dolly/recipes/modules/${record.name}.dm`,
      sha256: record.sha256, byteLength: Buffer.byteLength(record.source),
    });
  }
  visit(graph.root);
  return records;
}
