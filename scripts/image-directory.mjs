import { createHash } from "node:crypto";
import { recipeRecords } from "./dollyfile-graph.mjs";

// The generated modules of an image directory (src/images.mjs): its catalog,
// dist/dolly-images.mjs, and each image's metadata, dist/dolly-IMAGE-system-snapshot.mjs.
// The catalog's build and dolly-build (an npm user's image) write them here.

const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

// An image's catalog record: its recipe, at FILENAME in the directory, and the
// recipe graph it roots.
export function catalogRecord({ image, filename, source, parsed }, graph) {
  return {
    image,
    role: parsed.role,
    entry: parsed.entry,
    dollyfile: filename,
    byteLength: Buffer.byteLength(source),
    sha256: sha256(source),
    recipes: recipeRecords(graph),
    artifacts: graph.artifacts,
    hostRequirements: graph.root.hostRequirements,
  };
}

export const catalogSource = (records, staticSources = []) =>
  "// Generated from source-visible Dollyfiles. Do not edit.\n" +
  `export const DOLLY_IMAGES = Object.freeze(${JSON.stringify(records, null, 2)});\n` +
  `export const DOLLY_STATIC_SOURCES = Object.freeze(${JSON.stringify(staticSources, null, 2)});\n`;

// An image's metadata before it is packed: the snapshot SNAPSHOT (its bytes,
// decoded as PARSED, with the ENTRY it was checked for), built from GRAPH on
// INPUTS by the runtime whose identities are BUILD.
export function snapshotMetadata(image, graph, inputs, snapshot, parsed, entry, build) {
  return {
    image,
    buildId: build.imageBuildId,
    runtimeBuildId: build.buildId,
    formatVersion: 2,
    identityVersion: 2,
    inputs,
    recipes: recipeRecords(graph),
    hostRequirements: graph.root.hostRequirements,
    entry,
    manifest: parsed.manifest,
    byteLength: snapshot.length,
    sha256: sha256(snapshot),
  };
}

export const metadataSource = metadata =>
  `// Generated snapshot manifest.\nexport const DOLLY_SYSTEM_SNAPSHOT = Object.freeze(${JSON.stringify(metadata, null, 2)});\n`;

// An image directory's index.mjs, for boot(): the directory, IMAGE, and the
// manifests of the host modules it declares at PATHS, relative to the directory.
export const indexSource = (image, paths) => `// The ${image} image for boot(): its directory, and the manifests of the host modules it
// declares, from the packages that hold them.
export const images = new URL("./", import.meta.url).href;
export const image = ${JSON.stringify(image)};
export const modules = ${JSON.stringify(paths)}
  .map(path => new URL(path, import.meta.url).href);
`;

// The value of `export const NAME = …` in a generated module, read as data
// (JSON, optionally inside Object.freeze()): generated metadata is not
// executable input to the release verifier or the builds.
export function parseGeneratedConstant(source, name) {
  if (!/^[A-Z][A-Z0-9_]*$/.test(name)) throw new Error("invalid constant name");
  const prefix = new RegExp(`^(?://[^\\n]*\\n)*export const ${name} = `);
  if (!prefix.test(source)) throw new Error(`invalid generated ${name}`);
  let value = source.replace(prefix, "").trim();
  if (!value.endsWith(";")) throw new Error(`invalid generated ${name}`);
  value = value.slice(0, -1);
  if (value.startsWith("Object.freeze(") && value.endsWith(")")) value = value.slice(14, -1);
  return JSON.parse(value);
}
