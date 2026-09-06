#!/usr/bin/env node
import { resolve } from "node:path";
import { loadDollyfileGraph } from "./dollyfile-graph.mjs";
import { discoverImageDefinitions } from "./image-definitions.mjs";
const projectDir = resolve(import.meta.dirname, "..");
const definitions = await discoverImageDefinitions(projectDir);
for (const definition of definitions) await loadDollyfileGraph(projectDir, definition.filename);
console.log(`dolly: linted ${definitions.length} pinned image recipes`);
