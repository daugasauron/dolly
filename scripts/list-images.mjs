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
  // Served paths, which are their checkout paths.
  for (const { path } of await inspectStaticSources(projectDir, definitions)) console.log(path.slice(1));
  process.exit(0);
}
for (const definition of definitions) {
  console.log(`${definition.image}\t${definition.filename}`);
}
