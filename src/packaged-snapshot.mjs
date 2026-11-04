// The images of an image directory as the page and the Worker load them: each
// one's metadata, checked against the catalog and the recipes the directory
// serves, and its packs: streamed into a booting kernel, or merged in path
// order into the image's canonical snapshot.
import { DOLLY_IMAGE_BUILD_ID } from "../dist/dolly-image-build-id.mjs";
import { DOLLY_IMAGES, imageBase } from "./images.mjs";
import { imageInputs, imageInputsMatch } from "./image-inputs.mjs";
import { hostRequirements } from "../host/requirements.mjs";
import { siteReference, sitePath, decodeStaticAsset, sha256 } from "./static-asset.mjs";
import { scanSnapshotRecords, validateSnapshotPacks, MAX_SNAPSHOT_BYTES as snapshotSizeLimit } from "./snapshot-records.mjs";
import { unretainedPath } from "./image-names.mjs";
import { openPackStore } from "./pack-store.mjs";
import { Sha256 } from "./sha256.mjs";
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

// The recipes the directory serves for IMAGE (its page shows them) are the ones
// that built the image a boot runs. They are fetched together.
export async function verifyVisibleRecipes(image) {
  await Promise.all(expectedRecipes(image).map(async recipe => {
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
    return (await import(new URL(`dist/dolly-${image}-system-snapshot.json`, imageBase).href, { with: { type: "json" } })).default;
  } catch {
    throw new Error(`The packaged ${image} snapshot is missing. Run npm run image -- ${image} first.`);
  }
}

// An image's metadata, checked against the catalog and the metadata of every
// image it is built from, which are fetched together.
export async function loadPackagedSnapshotMetadata(image) {
  const closure = inputClosure(image);
  const loaded = await Promise.all(closure.map(importMetadata));
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
// by its digest, which images that hold the same files share. Each pack's
// compressed body, kept in this browser (pack-store.mjs) or downloaded and
// checked against its declared length. The consumer checks each part against
// its digest and then calls its verified(), which keeps a downloaded pack; a
// part it does not verify is not kept, or no longer.
async function* packagedSnapshotParts(metadata, signal) {
  const packs = validateSnapshotPacks(metadata), store = await openPackStore(metadata.image, packs);
  let complete = false;
  try {
    for (const pack of packs) {
      signal?.throwIfAborted();
      const part = await store.kept(pack) ?? await store.keeping(pack, await downloadedPack(pack, signal));
      let verified = false;
      try {
        yield { ...pack, body: part.body, verified: () => { verified = true; return part.keep(); } };
      } finally {
        if (!verified) await part.discard();
      }
    }
    complete = true;
  } finally {
    store.close(complete);
  }
}

async function downloadedPack(pack, signal) {
  const url = new URL(`dist/packs/${pack.sha256}.snapshot.gz`, imageBase);
  const init = { cache: "force-cache", credentials: "same-origin", redirect: "error", signal };
  const response = await decodeStaticAsset(await fetch(url, init), url, init, pack.encodedByteLength);
  if (!response.ok || !response.body) throw new Error(`snapshot returned HTTP ${response.status}`);
  const declared = response.headers.get("content-length");
  if (declared !== null && Number(declared) !== pack.encodedByteLength) throw new Error("snapshot HTTP content length mismatch");
  return response.body;
}

const gunzip = body => body.pipeThrough(new DecompressionStream("gzip"));

// The chunks of `body`; a consumer that stops early cancels it.
async function* chunksOf(body, signal) {
  const reader = body.getReader();
  let finished = false;
  try {
    for (;;) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      yield value;
    }
    finished = true;
  } finally {
    if (!finished) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

async function readBytes(body, length, signal) {
  const bytes = new Uint8Array(length);
  let offset = 0;
  for await (const chunk of chunksOf(body, signal)) {
    if (chunk.length > length - offset) throw new Error("snapshot exceeds declared size");
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  if (offset !== length) throw new Error("snapshot integrity mismatch");
  return bytes;
}

// The stream of `bytes` in pieces of at most 16 KiB, so that decompressing it
// holds only a little of the output at a time.
function streamOf(bytes) {
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      const end = Math.min(offset + 16 * 1024, bytes.length);
      controller.enqueue(bytes.subarray(offset, end));
      offset = end;
      if (offset === bytes.length) controller.close();
    },
  }, { highWaterMark: 0 });
}

// The sink owns incremental hashing. Every part is checked before another is
// requested; the caller verifies the complete canonical image before booting.
export async function streamPackagedSystemSnapshot(metadata, write, endPart, signal) {
  for await (const part of packagedSnapshotParts(metadata, signal)) {
    let size = 0;
    for await (const chunk of chunksOf(gunzip(part.body), signal)) {
      if (chunk.length > part.byteLength - size) throw new Error("snapshot exceeds declared size");
      await write(chunk);
      size += chunk.length;
    }
    if (size !== part.byteLength || await endPart() !== part.sha256) throw new Error("snapshot integrity mismatch");
    await part.verified();
  }
}

function snapshotHeader(count) {
  const bytes = new Uint8Array(16), view = new DataView(bytes.buffer);
  bytes.set(encoder.encode("DOLLYSNP"));
  view.setUint32(8, 2, true);
  view.setUint32(12, count, true);
  return bytes;
}

function recordHeader(kind, path, size) {
  const bytes = new Uint8Array(16 + path.length), view = new DataView(bytes.buffer);
  view.setUint32(0, kind, true);
  view.setUint32(4, path.length, true);
  view.setBigUint64(8, BigInt(size), true);
  bytes.set(path, 16);
  return bytes;
}

function compareBytes(left, right) {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return left.length - right.length;
}

// One pack's bytes, decompressed again as its records are reached in path order.
class PackReader {
  constructor(compressed) {
    this.chunks = chunksOf(gunzip(streamOf(compressed)));
    this.chunk = new Uint8Array(0);
    this.position = 0; // the pack offset of this.chunk
  }

  // The pack's bytes [offset, offset + length), skipping those before it.
  async *read(offset, length) {
    const end = offset + length;
    while (this.position < end) {
      if (this.chunk.length === 0) {
        const { done, value } = await this.chunks.next();
        if (done) throw new Error("truncated snapshot pack");
        this.chunk = value;
      }
      const start = Math.max(offset - this.position, 0), taken = Math.min(this.chunk.length, end - this.position);
      if (taken > start) yield this.chunk.subarray(start, taken);
      this.chunk = this.chunk.subarray(taken);
      this.position += taken;
    }
  }

  close() { return this.chunks.return(); }
}

// Checks every pack against its hash as it decompresses, keeping only its
// compressed bytes and where its records lie; returns the image's records in
// path order, each pack's read from its bytes decompressed once more.
async function packedRecords(metadata, signal) {
  const records = [];
  for await (const part of packagedSnapshotParts(metadata, signal)) {
    const pack = { compressed: await readBytes(part.body, part.encodedByteLength, signal), unread: 0 };
    const hash = new Sha256();
    const scanned = await scanSnapshotRecords((async function* () {
      for await (const chunk of chunksOf(gunzip(streamOf(pack.compressed)), signal)) {
        hash.update(chunk);
        yield chunk;
      }
    })(), () => false);
    if (scanned.byteLength !== part.byteLength || hash.hex() !== part.sha256) throw new Error("snapshot integrity mismatch");
    await part.verified();
    for (const [path, { kind, offset, size }] of scanned.records) {
      records.push({ pack, kind, path: encoder.encode(path), offset, size });
      pack.unread += 1;
    }
  }
  records.sort((left, right) => compareBytes(left.path, right.path));
  return (async function* () {
    yield snapshotHeader(records.length);
    for (const { pack, kind, path, offset, size } of records) {
      yield recordHeader(kind, path, size);
      pack.reader ??= new PackReader(pack.compressed);
      yield* pack.reader.read(offset, size);
      if (--pack.unread === 0) {
        await pack.reader.close();
        pack.reader = pack.compressed = null;
      }
    }
  })();
}

// Joins pieces into chunks of 1 MiB, the last one shorter.
async function* joined(pieces) {
  const size = 1024 * 1024;
  let chunk = new Uint8Array(size), used = 0;
  for await (let piece of pieces) {
    while (piece.length !== 0) {
      const taken = Math.min(piece.length, size - used);
      chunk.set(piece.subarray(0, taken), used);
      used += taken;
      piece = piece.subarray(taken);
      if (used === size) {
        yield chunk;
        chunk = new Uint8Array(size);
        used = 0;
      }
    }
  }
  if (used !== 0) yield chunk.subarray(0, used);
}

// The image's canonical snapshot in chunks, merged from its packs as they are
// read: the page holds the packs' compressed bytes, not the image. Every pack
// matches its hash before the first chunk; the chunks end in an error, not
// their end, unless together they match the image's hash.
export async function packagedSystemSnapshot(metadata, signal) {
  const pieces = await packedRecords(metadata, signal);
  return (async function* () {
    const hash = new Sha256();
    let size = 0;
    for await (const chunk of joined(pieces)) {
      if (chunk.length > metadata.byteLength - size) throw new Error("snapshot exceeds declared size");
      size += chunk.length;
      hash.update(chunk);
      yield chunk;
    }
    if (size !== metadata.byteLength || hash.hex() !== metadata.sha256) throw new Error("packed snapshot integrity mismatch");
  })();
}
