// The images of an image directory as the page and the Worker load them: each
// one's metadata, checked against the catalog and the recipes the directory
// serves, and its packs, streamed or whole.
import { DOLLY_IMAGE_BUILD_ID } from "../dist/dolly-image-build-id.mjs";
import { DOLLY_IMAGES, imageBase } from "./images.mjs";
import { imageInputs, imageInputsMatch } from "./image-inputs.mjs";
import { hostRequirements } from "../host/requirements.mjs";
import { siteReference, sitePath, decodeStaticAsset, sha256 } from "./static-asset.mjs";
import { mergeSnapshotRecords, validateSnapshotPacks, MAX_SNAPSHOT_BYTES as snapshotSizeLimit } from "./snapshot-records.mjs";
import { unretainedPath } from "./image-names.mjs";
const definitionOf = image => DOLLY_IMAGES.find(definition => definition.image === image);
const encoder = new TextEncoder();
const expectedRecipes = image => definitionOf(image).recipes;

function validSnapshotPath(path) {
  return typeof path === "string" && path.startsWith("/") && path.length > 1 &&
    path.length <= 4096 && !path.includes("\\") && !path.includes("\0") &&
    !path.includes("//") &&
    !path.split("/").some((part) => part === "." || part === "..") &&
    !unretainedPath(path);
}

// The recipes the directory serves are the ones that built the image, fetched
// together so that their round trips overlap.
async function verifyVisibleRecipes(recipes) {
  await Promise.all(recipes.map(async recipe => {
    const response = await fetch(new URL(sitePath(recipe.sourcePath).slice(1), imageBase), {
      credentials: "same-origin", redirect: "error",
    });
    if (!response.ok) throw new Error(`${recipe.sourcePath} returned HTTP ${response.status}`);
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength !== recipe.byteLength || await sha256(bytes) !== recipe.sha256) {
      throw new Error(`${recipe.sourcePath} does not match the packaged snapshot recipe`);
    }
  }));
}

// The image a FROM, COPY or INSTALL row names: its recipe at that path and pin.
const referenced = ({ location, sha256 }) => DOLLY_IMAGES.find(candidate =>
  siteReference(candidate.dollyfile) === location && candidate.sha256 === sha256);

// The images IMAGE is built from, each once and before those built from it,
// IMAGE last; a cycle is refused.
function inputClosure(image, order = [], path = []) {
  if (path.includes(image)) throw new Error("packaged image cycle");
  if (order.includes(image)) return order;
  for (const reference of definitionOf(image).artifacts) {
    const dependency = referenced(reference);
    if (!dependency) throw new Error("packaged image input is missing");
    inputClosure(dependency.image, order, [...path, image]);
  }
  order.push(image);
  return order;
}

async function importMetadata(image) {
  try {
    return (await import(new URL(`dist/dolly-${image}-system-snapshot.mjs`, imageBase).href)).DOLLY_SYSTEM_SNAPSHOT;
  } catch {
    throw new Error(`The packaged ${image} snapshot is missing. Run npm run image -- ${image} first.`);
  }
}

// An image's metadata, checked against the catalog, the recipes the directory
// serves and the metadata of every image it is built from. All of them are
// fetched together, so that a boot waits one round trip for them, not one each.
export async function loadPackagedSnapshotMetadata(image) {
  const closure = inputClosure(image);
  const [loaded] = await Promise.all([Promise.all(closure.map(importMetadata)),
    verifyVisibleRecipes(expectedRecipes(image))]);
  const checked = new Map();
  closure.forEach((name, index) => checked.set(name, checkedMetadata(name, loaded[index], checked)));
  return checked.get(image);
}

// METADATA, checked as IMAGE's against the catalog and CHECKED, the metadata
// of the images it is built from.
function checkedMetadata(image, metadata, checked) {
  const recipes = expectedRecipes(image);
  if (metadata === null || typeof metadata !== "object" ||
      metadata.image !== image || metadata.buildId !== DOLLY_IMAGE_BUILD_ID ||
      metadata.formatVersion !== 2 || metadata.identityVersion !== 2 ||
      JSON.stringify(metadata.recipes) !== JSON.stringify(recipes) ||
      JSON.stringify(hostRequirements(metadata.hostRequirements)) !== JSON.stringify(definitionOf(image).hostRequirements) ||
      !Number.isSafeInteger(metadata.byteLength) || metadata.byteLength <= 0 ||
      metadata.byteLength > snapshotSizeLimit || metadata.encoding !== "packs" ||
      !/^[0-9a-f]{64}$/.test(metadata.sha256) ||
      !Array.isArray(metadata.manifest) || metadata.manifest.length === 0 ||
      metadata.manifest.length > 100_000) {
    throw new Error("The packaged system snapshot metadata does not match this Dolly build");
  }
  validateSnapshotPacks(metadata);
  const inputs = imageInputs(metadata.inputs);
  const references = [...new Set(definitionOf(image).artifacts.map(reference => reference.sha256))].sort();
  if (JSON.stringify(inputs.map(input => input.recipeSha256)) !== JSON.stringify(references)) {
    throw new Error("The packaged system snapshot has stale image inputs");
  }
  let manifestBytes = 0;
  // The Wasm reader validates ordering by UTF-8 bytes, not JS UTF-16 strings.
  for (const path of metadata.manifest) {
    if (!validSnapshotPath(path)) {
      throw new Error("The packaged system snapshot has an invalid retained-path manifest");
    }
    manifestBytes += encoder.encode(path).byteLength + 1;
  }
  if (manifestBytes > 8 * 1024 * 1024) {
    throw new Error("The packaged system snapshot manifest is too large");
  }
  for (const required of [
    "/etc/dolly/Dollyfile",
    "/etc/dolly/environment",
    "/etc/dolly/image",
    "/etc/dolly/recipes.lock",
  ]) {
    if (!metadata.manifest.includes(required)) {
      throw new Error(`The packaged system snapshot is missing ${required}`);
    }
  }
  const expectedInputs = definitionOf(image).artifacts.map(reference =>
    ({ recipeSha256: reference.sha256, sha256: checked.get(referenced(reference).image).sha256 }));
  if (!imageInputsMatch(inputs, expectedInputs)) throw new Error("The packaged system snapshot has stale image inputs");
  return metadata;
}

// An image is the records of its packs, each a gzip-compressed snapshot named
// by its digest, which images that hold the same files share.
async function* packagedSnapshotParts(metadata, signal) {
  for (const pack of validateSnapshotPacks(metadata)) {
    signal?.throwIfAborted();
    const url = new URL(`dist/packs/${pack.sha256}.snapshot.gz`, imageBase);
    const init = { cache: "force-cache", credentials: "same-origin", redirect: "error", signal };
    const response = await decodeStaticAsset(await fetch(url, init), url, init, pack.encodedByteLength);
    if (!response.ok || !response.body) throw new Error(`snapshot returned HTTP ${response.status}`);
    const declared = response.headers.get("content-length");
    if (declared !== null && Number(declared) !== pack.encodedByteLength) throw new Error("snapshot HTTP content length mismatch");
    yield { ...pack, body: response.body.pipeThrough(new DecompressionStream("gzip")) };
  }
}

// The sink owns incremental hashing. Every part is checked before another is
// requested; the caller verifies the complete canonical image before booting.
export async function streamPackagedSystemSnapshot(metadata, write, endPart, signal) {
  for await (const part of packagedSnapshotParts(metadata, signal)) {
    const reader = part.body.getReader();
    let size = 0;
    try {
      for (;;) {
        signal?.throwIfAborted();
        const { done, value } = await reader.read();
        if (done) break;
        if (value.length > part.byteLength - size) throw new Error("snapshot exceeds declared size");
        await write(value);
        size += value.length;
      }
      if (size !== part.byteLength || await endPart() !== part.sha256) throw new Error("snapshot integrity mismatch");
    } catch (error) {
      await reader.cancel().catch(() => {});
      throw error;
    } finally { reader.releaseLock(); }
  }
}

export async function loadPackagedSystemSnapshot(metadata, signal) {
  const parts = [];
  for await (const part of packagedSnapshotParts(metadata, signal)) {
    const reader = part.body.getReader(), bytes = new Uint8Array(part.byteLength);
    let offset = 0;
    try {
      for (;;) {
        signal?.throwIfAborted();
        const { done, value } = await reader.read();
        if (done) break;
        if (value.length > bytes.length - offset) throw new Error("snapshot exceeds declared size");
        bytes.set(value, offset);
        offset += value.length;
      }
      if (offset !== bytes.length || await sha256(bytes) !== part.sha256) throw new Error("snapshot integrity mismatch");
      parts.push(bytes);
    } catch (error) {
      await reader.cancel().catch(() => {});
      throw error;
    } finally { reader.releaseLock(); }
  }
  const bytes = parts.length === 1 ? parts[0] : mergeSnapshotRecords(parts);
  if (bytes.length !== metadata.byteLength || await sha256(bytes) !== metadata.sha256) throw new Error("packed snapshot integrity mismatch");
  return bytes.buffer;
}
