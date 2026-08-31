import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { inspectDollyfile } from "../src/dollyfile-view.mjs";

export async function discoverImageDefinitions(projectDir) {
  const entries = await readdir(projectDir, { withFileTypes: true });
  const names = entries
    .filter((entry) => entry.isFile() &&
      (entry.name === "Dollyfile" || entry.name.startsWith("Dollyfile-")))
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
      extends: parsed.extends,
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

export async function inspectStaticSources(projectDir, definitions) {
  const sources = new Map();
  for (const definition of definitions) {
    for (const source of definition.parsed.sources) {
      if (source.transport !== "host") continue;
      if (!source.location.startsWith("/static/") || source.location.includes("..")) {
        throw new Error(
          `${definition.filename}:${source.line}: HOST source must live below /static/`,
        );
      }
      const previous = sources.get(source.location);
      if (previous &&
          (previous.media !== source.media || previous.sha256 !== source.sha256)) {
        throw new Error(
          `${definition.filename}:${source.line}: conflicting metadata for ${source.location}`,
        );
      }
      if (previous) continue;
      const diskPath = resolve(projectDir, "dist", source.location.slice(1));
      const [bytes, metadata] = await Promise.all([readFile(diskPath), stat(diskPath)]);
      if (!metadata.isFile()) throw new Error(`${diskPath}: static source is not a file`);
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      if (sha256 !== source.sha256) {
        throw new Error(
          `${definition.filename}:${source.line}: ${source.location} has SHA256 ${sha256}, ` +
          `expected ${source.sha256}`,
        );
      }
      sources.set(source.location, Object.freeze({
        path: source.location,
        media: source.media,
        sha256,
        byteLength: bytes.length,
      }));
    }
  }
  return [...sources.values()].sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}

export function registrySource(definitions, staticSources = []) {
  const records = definitions.map(({ image, filename, extends: parent, source }) => ({
    image,
    dollyfile: filename,
    byteLength: Buffer.byteLength(source),
    sha256: createHash("sha256").update(source).digest("hex"),
    ...(parent ? { extends: parent } : {}),
  }));
  return "// Generated from source-visible Dollyfiles. Do not edit.\n" +
    `export const DOLLY_IMAGES = Object.freeze(${JSON.stringify(records, null, 2)});\n` +
    `export const DOLLY_STATIC_SOURCES = Object.freeze(${JSON.stringify(staticSources, null, 2)});\n`;
}

export async function writeImageRegistry(projectDir, definitions, staticSources = []) {
  await writeFile(
    resolve(projectDir, "dist/dolly-images.mjs"),
    registrySource(definitions, staticSources),
  );
}
