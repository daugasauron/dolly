import { createHash } from "node:crypto";
import { recipeRecords } from "./dollyfile-graph.mjs";
import { alphabetical } from "../src/alphabetical.mjs";
import { siteReference } from "../src/static-asset.mjs";

// The generated files of an image directory (src/images.mjs): its catalog,
// dist/dolly-images.json, each image's metadata, dist/dolly-IMAGE-system-snapshot.json,
// its package index amy-index.txt, and the index.mjs of a directory boot() loads.
// The catalog's build, the npm packages and dolly-build (an npm user's image)
// write them here.

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

// The catalog: its images' records and the files their recipes read by site path.
export const catalogJson = (images, staticSources = []) => `${JSON.stringify({ images, staticSources }, null, 2)}\n`;

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

export const metadataJson = metadata => `${JSON.stringify(metadata, null, 2)}\n`;

// An image directory's index.mjs, for boot(): the directory, IMAGE, and the
// manifests of the host modules it declares at PATHS, relative to the directory.
export const indexSource = (image, paths) => `// The ${image} image for boot(): its directory, and the manifests of the host modules it
// declares, from the packages that hold them.
export const images = new URL("./", import.meta.url).href;
export const image = ${JSON.stringify(image)};
export const modules = ${JSON.stringify(paths)}
  .map(path => new URL(path, import.meta.url).href);
`;

// The package index people and amy read: "NAME RECIPE SHA256 DESCRIPTION" per
// package, the INSTALL row's operands and the description the menu shows, of
// PACKAGES ({ image, dollyfile, sha256 } records) described by DESCRIPTIONS.
// amy prints a description in a terminal: a README's Markdown link becomes its text.
export const plainText = description => description.replaceAll("`", "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
export const amyIndex = (packages, descriptions) => [...packages]
  .sort((left, right) => alphabetical(left.image, right.image))
  .map(({ image, dollyfile, sha256 }) => `${image} ${siteReference(dollyfile)} ${sha256} ${plainText(descriptions.get(image))}\n`)
  .join("");

// The packages an image of CATALOG holds, by name: those its build installs
// (its record's install rows, which name theirs too) and, but in a package, its base's.
export function heldPackages(catalog, image) {
  const record = catalog.find(candidate => candidate.image === image);
  return [...new Set(record.artifacts.flatMap(({ operation, image: name }) => operation === "install" ? [name]
    : operation === "from" && record.role !== "package" ? heldPackages(catalog, name) : []))];
}

// The descriptions of an amy-index.txt's packages, by name.
export const indexDescriptions = text => new Map(text.split("\n").filter(Boolean)
  .map(line => /^(\S+) \S+ \S+ (.*)$/.exec(line).slice(1)));
