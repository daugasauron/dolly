#!/usr/bin/env node

import { resolve } from "node:path";

import { discoverImageDefinitions, inspectStaticSources } from "./image-definitions.mjs";

const projectDir = resolve(import.meta.dirname, "..");
const definitions = await discoverImageDefinitions(projectDir);
if (process.argv[2] === "--sources") {
  for (const source of await inspectStaticSources(projectDir, definitions)) {
    console.log(`${source.path}\t${source.media}\t${source.sha256}\t${source.byteLength}`);
  }
  process.exit(0);
}
for (const definition of definitions) {
  console.log(`${definition.image}\t${definition.filename}`);
}
