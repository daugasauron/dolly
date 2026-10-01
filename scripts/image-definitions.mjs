import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { inspectDollyfile } from "../src/dollyfile-view.mjs";
import {
  createDollyfileGraphLoader,
  recipeRecords,
} from "./dollyfile-graph.mjs";
import { recipeFiles } from "./recipe-files.mjs";
import { publishedHeaders } from "./host-modules.mjs";
import { CANONICAL_ORIGIN, canonicalPath } from "../src/static-asset.mjs";

// `filename` is the recipe's checkout path, which is also its published path.
export async function discoverImageDefinitions(projectDir) {
  const definitions = [];
  for (const filename of (await recipeFiles(projectDir)).values()) {
    if (filename.endsWith(".dm")) continue;
    const source = await readFile(resolve(projectDir, filename), "utf8");
    const parsed = inspectDollyfile(source, filename);
    const expected = parsed.image === "default" ? "Dollyfile" : `Dollyfile-${parsed.image}`;
    if (basename(filename) !== expected) {
      throw new Error(`${filename}: IMAGE ${parsed.image} must use filename ${expected}`);
    }
    definitions.push({
      projectDir,
      image: parsed.image,
      filename,
      source,
      parsed,
    });
  }
  if (!definitions.length) throw new Error("No Dollyfile image definitions found");
  definitions.sort((left, right) => {
    if (left.image === "default") return -1;
    if (right.image === "default") return 1;
    return left.image < right.image ? -1 : left.image > right.image ? 1 : 0;
  });
  return definitions;
}

export async function selectImageDefinitions(definitions, selection = process.env.DOLLY_BUILD_IMAGES) {
  if (selection === undefined || selection.trim() === "" || selection.trim() === "all") {
    return definitions;
  }
  const requested = selection.split(",").map((name) => name.trim());
  if (requested.some((name) => !/^[a-z][a-z0-9-]{0,31}$/.test(name)) ||
      new Set(requested).size !== requested.length) {
    throw new Error("DOLLY_BUILD_IMAGES must be a comma-separated list of unique image names");
  }
  const byName = new Map(definitions.map((definition) => [definition.image, definition]));
  const selected = requested.map((name) => byName.get(name));
  const missing = requested.filter((_, index) => selected[index] === undefined);
  if (missing.length !== 0) {
    throw new Error(`DOLLY_BUILD_IMAGES names unknown images: ${missing.join(", ")}`);
  }
  const closure = new Map();
  const loadGraph = createDollyfileGraphLoader(selected[0].projectDir);
  const byURL = new Map(definitions.map(definition => [`${CANONICAL_ORIGIN}/${definition.filename}`, definition]));
  async function include(definition) {
    if (closure.has(definition.image)) return;
    closure.set(definition.image, definition);
    const graph = await loadGraph(definition.filename);
    for (const reference of graph.artifacts) {
      const dependency = byURL.get(reference.location);
      if (!dependency) throw new Error(`missing artifact recipe ${reference.location}`);
      await include(dependency);
    }
  }
  for (const definition of selected) await include(definition);
  return definitions.filter(definition => closure.has(definition.image));
}

export async function inspectStaticSources(projectDir, definitions) {
  const sources = new Map();
  const loadGraph = createDollyfileGraphLoader(projectDir);
  for (const definition of definitions) {
    const graph = await loadGraph(definition.filename);
    for (const module of graph.records) {
      const path = canonicalPath(module.location);
      const previous = sources.get(path);
      if (previous && previous.sha256 !== module.sha256) {
        throw new Error(`${definition.filename}: conflicting module ${path}`);
      }
      if (!previous) {
        sources.set(path, Object.freeze({
          path,
          sha256: module.sha256,
          byteLength: Buffer.byteLength(module.source),
        }));
      }
    }
    for (const record of graph.records) for (const source of record.sources) {
      const path = canonicalPath(source.location);
      if (path === null) continue;
      if (!(path.startsWith("/dist/static/") || publishedHeaders.has(path)) || path.includes("..")) {
        throw new Error(
          `${record.location}:${source.line}: ${source.location} is outside trusted build inputs`,
        );
      }
      const previous = sources.get(path);
      if (previous && previous.sha256 !== source.sha256) {
        throw new Error(
          `${definition.filename}:${source.line}: conflicting metadata for ${source.location}`,
        );
      }
      if (previous) continue;
      const diskPath = resolve(projectDir, path.slice(1));
      const [bytes, metadata] = await Promise.all([readFile(diskPath), stat(diskPath)]);
      if (!metadata.isFile()) throw new Error(`${diskPath}: static source is not a file`);
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      if (sha256 !== source.sha256) {
        throw new Error(
          `${record.location}:${source.line}: ${source.location} has SHA256 ${sha256}, ` +
          `expected ${source.sha256}`,
        );
      }
      sources.set(path, Object.freeze({
        path,
        sha256,
        byteLength: bytes.length,
      }));
    }
  }
  // Publishing module text does not execute it or select its build inputs.
  for (const [url, file] of await recipeFiles(projectDir)) {
    const path = canonicalPath(url);
    if (!path.endsWith(".dm") || sources.has(path)) continue;
    const bytes = await readFile(resolve(projectDir, file));
    if (bytes.length === 0) continue;
    sources.set(path, Object.freeze({
      path, sha256: createHash("sha256").update(bytes).digest("hex"), byteLength: bytes.length,
    }));
  }
  return [...sources.values()].sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}

export function registrySource(definitions, staticSources = []) {
  const records = definitions.map(({ image, filename, source, parsed }) => ({
    image,
    dollyfile: filename,
    byteLength: Buffer.byteLength(source),
    sha256: createHash("sha256").update(source).digest("hex"),
    modules: parsed.uses.map(
      ({ location, sha256 }) => ({ location, sha256 }),
    ),
    recipes: parsed.recipes ?? [],
    artifacts: parsed.artifacts ?? [],
    hostRequirements: parsed.hostRequirements ?? [],
  }));
  return "// Generated from source-visible Dollyfiles. Do not edit.\n" +
    `export const DOLLY_IMAGES = Object.freeze(${JSON.stringify(records, null, 2)});\n` +
    `export const DOLLY_STATIC_SOURCES = Object.freeze(${JSON.stringify(staticSources, null, 2)});\n`;
}

export async function imageRegistrySource(projectDir, definitions, staticSources = []) {
  const loadGraph = createDollyfileGraphLoader(projectDir);
  const enriched = await Promise.all(definitions.map(async (definition) => {
    const graph = await loadGraph(definition.filename);
    return {
      ...definition,
      parsed: {
        ...definition.parsed,
        artifacts: graph.artifacts,
        recipes: recipeRecords(graph),
        hostRequirements: graph.root.hostRequirements,
      },
    };
  }));
  return registrySource(enriched, staticSources);
}

export async function writeImageRegistry(projectDir, definitions, staticSources = []) {
  await writeFile(resolve(projectDir, "dist/dolly-images.mjs"),
    await imageRegistrySource(projectDir, definitions, staticSources));
}
