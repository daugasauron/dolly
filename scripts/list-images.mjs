#!/usr/bin/env node

import { resolve } from "node:path";

import {
  discoverImageDefinitions,
  inspectStaticSources,
  selectImageDefinitions,
} from "./image-definitions.mjs";
import { createDollyfileGraphLoader } from "./dollyfile-graph.mjs";
import { recipeFiles } from "./recipe-files.mjs";
import { publishedHeaders } from "./host-modules.mjs";
import { CANONICAL_ORIGIN } from "../src/static-asset.mjs";

const projectDir = resolve(import.meta.dirname, "..");
const loadGraph = createDollyfileGraphLoader(projectDir);
const definitions = await selectImageDefinitions(await discoverImageDefinitions(projectDir));
if (process.argv[2] === "--sources") {
  // Served path and the checkout file holding its bytes.
  const recipes = await recipeFiles(projectDir);
  for (const { path } of await inspectStaticSources(projectDir, definitions)) {
    console.log(`${path}\t${recipes.get(`${CANONICAL_ORIGIN}${path}`) ??
      (path.startsWith("/static/") ? `dist${path}` : publishedHeaders.get(path))}`);
  }
  process.exit(0);
}
if (process.argv[2] === "--modules") {
  const names = new Set();
  for (const definition of definitions) {
    const graph = await loadGraph(definition.filename);
    for (const module of graph.modules) names.add(module.name);
  }
  for (const name of [...names].sort()) console.log(name);
  process.exit(0);
}
for (const definition of definitions) {
  console.log(`${definition.image}\t${definition.path}`);
}
