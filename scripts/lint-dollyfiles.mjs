#!/usr/bin/env node
import { resolve } from "node:path";
import { createDollyfileGraphLoader } from "./dollyfile-graph.mjs";
import { discoverImageDefinitions } from "./image-definitions.mjs";
import { imageDescriptions } from "./image-menu.mjs";
import { runtimes } from "../host/manifests.mjs";
import { unretainedPath } from "../src/dollyfile-view.mjs";

const under = (root, path) => root === "/" || path === root || path.startsWith(`${root}/`);

// Whether a recipe's image may hold `path`, by declarations alone: a FILE, an
// exported TOOL of that name, or a path under a FOLDER, a path export or a COPY
// destination, in the recipe, its base or its packages.
function declares(record, path) {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return record.files.some(file => file.path === path) || record.folders.some(folder => under(folder.path, path)) ||
    record.exports.some(item => item.type === "TOOL" ? item.name === name : item.type !== "ENV" && under(item.details[0], path)) ||
    record.artifactTargets.some(({ reference, target }) => reference.operation === "copy" ? under(reference.destination, path)
      : (reference.operation === "install" || record.role !== "package") && declares(target, path));
}

// The static half of the engine's ENTRY check: the program an image starts
// (ENTRY's, and the one /bin/foreground [-i] runs) must be declared somewhere in
// its chain and outside scratch. Whether the file exists, what a FOLDER holds
// and which other words name files are known only to the build, which checks
// the sealed image.
function entryProblem(root) {
  const entry = root.entry ?? [];
  const program = entry[0] !== "/bin/foreground" ? 0 : entry[1] === "-i" ? 2 : 1;
  if (program !== 0 && !entry[program]?.startsWith("/")) return "ENTRY /bin/foreground [-i] takes the absolute path of a program";
  for (const path of new Set(entry.length ? [entry[0], entry[program]] : [])) {
    if (unretainedPath(path)) return `ENTRY program ${path} is in scratch, which no image retains`;
    if (!declares(root, path)) {
      return `ENTRY program ${path} is retained by no recipe of this image: add EXPORTS TOOL ${path.slice(path.lastIndexOf("/") + 1)} or FILE ${path}`;
    }
  }
  return null;
}

// Checks the syntax, pins, roles, recipe graph and ENTRY program of every catalog image,
// and that each has the description the start page and the package index show.
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
    const problem = entryProblem(graph.root);
    if (problem) throw new Error(`${definition.filename}: ${problem}`);
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
