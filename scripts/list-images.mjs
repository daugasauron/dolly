#!/usr/bin/env node

import { resolve } from "node:path";

import {
  discoverImageDefinitions,
  inspectStaticSources,
  selectImageDefinitions,
} from "./image-definitions.mjs";
import { createDollyfileGraphLoader } from "./dollyfile-graph.mjs";

const projectDir = resolve(import.meta.dirname, "..");
const loadGraph = createDollyfileGraphLoader(projectDir);
const definitions = await selectImageDefinitions(await discoverImageDefinitions(projectDir));
if (process.argv[2] === "--sources") {
  for (const source of await inspectStaticSources(projectDir, definitions)) {
    console.log(`${source.path}\t${source.sha256}\t${source.byteLength}`);
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
  console.log(`${definition.image}\t${definition.filename}`);
}
