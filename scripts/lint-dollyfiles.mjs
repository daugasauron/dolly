#!/usr/bin/env node
import { resolve } from "node:path";
import { createDollyfileGraphLoader } from "./dollyfile-graph.mjs";
import { discoverImageDefinitions } from "./image-definitions.mjs";
import { imageDescriptions } from "./image-menu.mjs";
import { runtimes } from "../host/manifests.mjs";

// Checks the syntax, pins, roles and recipe graph of every catalog image, and
// that each has the description the start page and the package index show.
export async function lintDollyfiles(projectDir) {
  const loadGraph = createDollyfileGraphLoader(projectDir);
  const definitions = await discoverImageDefinitions(projectDir);
  for (const definition of definitions) {
    const graph = await loadGraph(definition.filename);
    if (!graph.root.hostRequirements.some(requirement => runtimes.includes(requirement))) {
      throw new Error(`${definition.filename}: declares no runtime; add REQUIRES HOST ${runtimes.join(" or ")}`);
    }
    if (definition.parsed.role === "application" && !graph.root.hostRequirements.includes("display@0")) {
      throw new Error(`${definition.filename}: an APPLICATION needs display@0 to be opened`);
    }
  }
  const descriptions = await imageDescriptions(projectDir);
  for (const { image, filename } of definitions) {
    if (!descriptions.has(image)) throw new Error(`${filename}: describe it as "- \`${image}\`: …" in its README`);
  }
  return definitions.length;
}

if (process.argv[1] === import.meta.filename) {
  const count = await lintDollyfiles(resolve(import.meta.dirname, ".."));
  console.log(`dolly: linted ${count} pinned image recipes`);
}
