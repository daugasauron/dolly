#!/usr/bin/env node
import { resolve } from "node:path";
import { createDollyfileGraphLoader } from "./dollyfile-graph.mjs";
import { discoverImageDefinitions } from "./image-definitions.mjs";
import { imageDescriptions } from "./image-menu.mjs";

// Checks the syntax, pins, roles and recipe graph of every catalog image, and
// that each has the description the start page and the package index show.
export async function lintDollyfiles(projectDir) {
  const loadGraph = createDollyfileGraphLoader(projectDir);
  const definitions = await discoverImageDefinitions(projectDir);
  const descriptions = await imageDescriptions(projectDir);
  for (const definition of definitions) {
    if (!descriptions.has(definition.image)) {
      throw new Error(`${definition.filename}: describe it as "- \`${definition.image}\`: …" in its README`);
    }
    const graph = await loadGraph(definition.filename);
    if (definition.parsed.role === "application" && !graph.root.hostRequirements.includes("display@0")) {
      throw new Error(`${definition.filename}: an APPLICATION needs display@0 to be opened`);
    }
  }
  return definitions.length;
}

if (process.argv[1] === import.meta.filename) {
  const count = await lintDollyfiles(resolve(import.meta.dirname, ".."));
  console.log(`dolly: linted ${count} pinned image recipes`);
}
