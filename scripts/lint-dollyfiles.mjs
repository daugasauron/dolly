#!/usr/bin/env node

import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { loadDollyfileGraph } from "./dollyfile-graph.mjs";
import { discoverImageDefinitions } from "./image-definitions.mjs";

const projectDir = resolve(import.meta.dirname, "..");
const definitions = await discoverImageDefinitions(projectDir);
const selected = new Set();

for (const definition of definitions) {
  const graph = await loadDollyfileGraph(projectDir, definition.filename);
  if (graph.root.requirements.length !== 0 || graph.root.exports.length !== 0 ||
      graph.root.sources.length !== 0 || graph.root.slops.length !== 0 ||
      graph.root.files.length !== 0 || graph.root.folders.length !== 0) {
    throw new Error(
      `${definition.filename}: an image may contain only IMAGE, USE, and ENTRY`,
    );
  }
  for (const module of graph.modules) {
    selected.add(module.relative);
    for (const source of module.sources) {
      if (source.transport === "host" &&
          !(source.location.startsWith("/static/") ||
            source.location.startsWith("/include/dolly/"))) {
        throw new Error(
          `${module.relative}:${source.line}: HOST source is outside the trusted build inputs`,
        );
      }
      if (source.transport === "url" &&
          !/^https?:\/\//.test(source.location)) {
        throw new Error(`${module.relative}:${source.line}: invalid URL source`);
      }
    }
  }
}

const available = (await readdir(resolve(projectDir, "modules")))
  .filter((name) => name.endsWith(".dm"))
  .map((name) => `modules/${name}`)
  .sort();
const omitted = available.filter((name) => !selected.has(name));
if (omitted.length !== 0) {
  throw new Error(`Dollyfile images do not select modules: ${omitted.join(", ")}`);
}

console.log(
  `dolly: linted ${definitions.length} images and ${selected.size} pinned modules`,
);
