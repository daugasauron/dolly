// Built images in this browser: an artifact's identity read from its own
// snapshot, and the bounded IndexedDB cache of the images the site builds.
import { DOLLY_IMAGE_BUILD_ID } from "../dist/dolly-image-build-id.mjs";
import { imageInputs, imageInputsMatch } from "./image-inputs.mjs";
import { loadRecipeGraph } from "./dollyfile-graph.mjs";
import { recipeFileName } from "./dollyfile-view.mjs";
import { sha256 } from "./static-asset.mjs";
import { Sha256 } from "./sha256.mjs";
import { scanSnapshotRecords, MAX_SNAPSHOT_BYTES as snapshotSizeLimit } from "./snapshot-records.mjs";
export { sha256 };

// An artifact's identity read from its snapshot, SOURCE: a Blob, or the
// snapshot's bytes in pieces (an iterable of Uint8Array), which become the
// artifact's Blob. The snapshot is digested and checked as it passes; only the
// identity's files under /etc/dolly are held.
export async function describeImageArtifact(source, recipeSha256, inputs = []) {
  const blob = source instanceof Blob ? source : null, hash = new Sha256(), parts = [];
  const pieces = (async function* () {
    for await (const piece of blob ? blob.stream() : source) {
      hash.update(piece);
      if (!blob) parts.push(new Blob([piece]));
      yield piece;
    }
  })();
  const { records, byteLength } = await scanSnapshotRecords(pieces, path => path.startsWith("/etc/dolly/"));
  const recipe = records.get("/etc/dolly/Dollyfile");
  if (recipe?.kind !== 2 || await sha256(recipe.data) !== recipeSha256 ||
      records.get("/etc/dolly/artifact")?.kind !== 2) throw new Error("artifact recipe identity mismatch");
  // The artifact retains every recipe it was built from, by file name.
  const graph = await loadRecipeGraph(reference => {
    if (reference === "Dollyfile") return recipe.data;
    const path = `/etc/dolly/recipes/${recipeFileName(reference)}`;
    const record = records.get(path);
    if (record?.kind !== 2) throw new Error(`artifact does not retain recipe ${reference}`);
    return record.data;
  }, "Dollyfile");
  return { buildId: DOLLY_IMAGE_BUILD_ID, recipeSha256, sha256: hash.hex(),
    inputs: imageInputs(inputs), hostRequirements: graph.root.hostRequirements,
    byteLength, manifest: [...records.keys()], bytes: blob ?? new Blob(parts) };
}

async function databaseOperation(mode, operation) {
  const database = await new Promise((resolve, reject) => {
    const request = indexedDB.open("dolly-image-artifacts-v3", 3);
    request.onupgradeneeded = () => {
      // This database contains rebuildable images, never named user sessions.
      if (request.result.objectStoreNames.contains("images")) request.result.deleteObjectStore("images");
      request.result.createObjectStore("images", { keyPath: "id" });
      request.result.createObjectStore("payloads");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(["images", "payloads"], mode);
      let request;
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = transaction.onabort = () => reject(transaction.error ?? new Error("image cache transaction aborted"));
      try { request = operation(transaction.objectStore("images"), transaction.objectStore("payloads")); }
      catch (error) { transaction.abort(); reject(error); }
    });
  } finally { database.close(); }
}

export async function loadImageArtifactDescriptor(recipeSha256, inputs = []) {
  try {
    const id = `${DOLLY_IMAGE_BUILD_ID}:${recipeSha256}`;
    const record = await databaseOperation("readonly", store => store.get(id));
    if (record?.id !== id || record.buildId !== DOLLY_IMAGE_BUILD_ID || record.recipeSha256 !== recipeSha256 ||
        !/^[0-9a-f]{64}$/.test(record.sha256) || !Number.isSafeInteger(record.byteLength) ||
        record.byteLength <= 0 || record.byteLength > snapshotSizeLimit ||
        !imageInputsMatch(record.inputs, inputs)) return null;
    return record;
  } catch { return null; }
}

export async function loadImageArtifact(descriptor) {
  try {
    const id = `${DOLLY_IMAGE_BUILD_ID}:${descriptor.recipeSha256}`;
    const payload = await databaseOperation("readonly", (_store, payloads) => payloads.get(id));
    if (!(payload instanceof Blob) || payload.size !== descriptor.byteLength || payload.size <= 0 ||
        payload.size > snapshotSizeLimit) return null;
    const artifact = await describeImageArtifact(payload, descriptor.recipeSha256, descriptor.inputs);
    return artifact.sha256 === descriptor.sha256 ? artifact : null;
  } catch { return null; }
}

// Rebuildable images only; a bounded cache so builds cannot fill browser storage.
export const IMAGE_CACHE_MAX_ENTRIES = 32;
const IMAGE_CACHE_MAX_BYTES = 8 * 1024 ** 3;

export async function saveImageArtifact(artifact, slot = artifact.recipeSha256) {
  try {
    if (artifact.buildId !== DOLLY_IMAGE_BUILD_ID || !(artifact.bytes instanceof Blob) ||
        artifact.bytes.size !== artifact.byteLength || artifact.byteLength <= 0 ||
        artifact.byteLength > snapshotSizeLimit) return false;
    const id = `${DOLLY_IMAGE_BUILD_ID}:${artifact.recipeSha256}`;
    const { buildId, recipeSha256, sha256, inputs, hostRequirements, byteLength } = artifact;
    await databaseOperation("readwrite", (store, payloads) => {
      payloads.put(artifact.bytes, id);
      const published = store.put({ buildId, recipeSha256, sha256, inputs, hostRequirements, byteLength, slot, id,
        savedAt: performance.timeOrigin + performance.now() });
      // Publish and prune atomically: failed writes preserve the previous pair,
      // and concurrent writers cannot prune each other's newly published data.
      // This runtime's previous image in the slot goes first, then the least
      // recently saved images beyond the entry and byte bounds. Other versions'
      // pages keep their images here too, so another runtime's are only bounded.
      const remove = key => { store.delete(key); payloads.delete(key); };
      const kept = [], cursor = store.openCursor();
      cursor.onsuccess = () => {
        const entry = cursor.result?.value;
        if (entry) {
          if (entry.id !== id) {
            if (entry.buildId === DOLLY_IMAGE_BUILD_ID && entry.slot === slot) remove(entry.id);
            else kept.push(entry);
          }
          cursor.result.continue();
          return;
        }
        kept.sort((left, right) => (right.savedAt ?? 0) - (left.savedAt ?? 0));
        let total = byteLength;
        kept.forEach((entry, index) => {
          total += entry.byteLength;
          if (index + 1 >= IMAGE_CACHE_MAX_ENTRIES || total > IMAGE_CACHE_MAX_BYTES) remove(entry.id);
        });
      };
      return published;
    });
    return true;
  } catch { return false; }
}
