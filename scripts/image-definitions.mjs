import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { inspectDollyfile } from "../src/dollyfile-view.mjs";
import {
  loadDollyfileGraph,
  moduleCacheRecords,
  recipeRecords,
} from "./dollyfile-graph.mjs";

export async function discoverImageDefinitions(projectDir) {
  const entries = await readdir(projectDir, { withFileTypes: true });
  const names = entries
    .filter((entry) => entry.isFile() && /^Dollyfile(?:-[a-z][a-z0-9-]*)?$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  const definitions = [];
  for (const filename of names) {
    const source = await readFile(resolve(projectDir, filename), "utf8");
    const parsed = inspectDollyfile(source, filename);
    const expected = parsed.image === "default" ? "Dollyfile" : `Dollyfile-${parsed.image}`;
    if (filename !== expected) {
      throw new Error(`${filename}: IMAGE ${parsed.image} must use filename ${expected}`);
    }
    definitions.push({
      image: parsed.image,
      filename,
      source,
      parsed,
    });
  }
  if (!definitions.some((definition) => definition.image === "default")) {
    throw new Error("Dollyfile: the default image definition is required");
  }
  definitions.sort((left, right) => {
    if (left.image === "default") return -1;
    if (right.image === "default") return 1;
    return left.image < right.image ? -1 : left.image > right.image ? 1 : 0;
  });
  return definitions;
}

export function selectImageDefinitions(definitions, selection = process.env.DOLLY_BUILD_IMAGES) {
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
  return selected;
}

export async function inspectStaticSources(projectDir, definitions) {
  const sources = new Map();
  for (const definition of definitions) {
    const graph = await loadDollyfileGraph(projectDir, definition.filename);
    for (const module of graph.modules) {
      const path = `/${module.relative}`;
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
      if (source.transport !== "host") continue;
      if (!(source.location.startsWith("/static/") ||
            source.location.startsWith("/include/dolly/")) ||
          source.location.includes("..")) {
        throw new Error(
          `${record.relative}:${source.line}: HOST source is outside trusted build inputs`,
        );
      }
      const previous = sources.get(source.location);
      if (previous && previous.sha256 !== source.sha256) {
        throw new Error(
          `${definition.filename}:${source.line}: conflicting metadata for ${source.location}`,
        );
      }
      if (previous) continue;
      const diskPath = source.location.startsWith("/static/")
        ? resolve(projectDir, "dist", source.location.slice(1))
        : resolve(projectDir, source.location.slice(1));
      const [bytes, metadata] = await Promise.all([readFile(diskPath), stat(diskPath)]);
      if (!metadata.isFile()) throw new Error(`${diskPath}: static source is not a file`);
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      if (sha256 !== source.sha256) {
        throw new Error(
          `${record.relative}:${source.line}: ${source.location} has SHA256 ${sha256}, ` +
          `expected ${source.sha256}`,
        );
      }
      sources.set(source.location, Object.freeze({
        path: source.location,
        sha256,
        byteLength: bytes.length,
      }));
    }
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
    moduleCaches: parsed.moduleCaches ?? [],
  }));
  return "// Generated from source-visible Dollyfiles. Do not edit.\n" +
    `export const DOLLY_IMAGES = Object.freeze(${JSON.stringify(records, null, 2)});\n` +
    `export const DOLLY_STATIC_SOURCES = Object.freeze(${JSON.stringify(staticSources, null, 2)});\n`;
}

export async function writeImageRegistry(projectDir, definitions, staticSources = []) {
  const enriched = await Promise.all(definitions.map(async (definition) => {
    const graph = await loadDollyfileGraph(projectDir, definition.filename);
    return {
      ...definition,
      parsed: {
        ...definition.parsed,
        recipes: recipeRecords(graph),
        moduleCaches: moduleCacheRecords(graph),
      },
    };
  }));
  await writeFile(
    resolve(projectDir, "dist/dolly-images.mjs"),
    registrySource(enriched, staticSources),
  );
}
