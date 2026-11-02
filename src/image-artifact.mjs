// Built images in this browser: an artifact's identity read from its own
// snapshot, and the bounded cache of the images the site builds: each one's
// snapshot a file of origin-private storage, indexed in IndexedDB.
//
// A snapshot is written to its file as it streams out of Wasm memory or out
// of its packs, and the artifact's bytes is that file. A Blob built from
// parts in memory is unreadable in Chrome once the parts exceed its
// in-memory blob space (500 MiB before the browser has been idle after
// starting, whatever the machine), a file is not. A file is deleted when its
// entry is replaced or evicted; a page that still holds the file then reads
// nothing, so an entry's bytes are read only for a build the entry outlives.
import { DOLLY_IMAGE_BUILD_ID } from "../dist/dolly-image-build-id.mjs";
import { imageInputs, imageInputsMatch } from "./image-inputs.mjs";
import { loadRecipeGraph } from "./dollyfile-graph.mjs";
import { recipeFileName } from "./dollyfile-view.mjs";
import { sha256 } from "./static-asset.mjs";
import { Sha256 } from "./sha256.mjs";
import { scanSnapshotRecords, MAX_SNAPSHOT_BYTES as snapshotSizeLimit } from "./snapshot-records.mjs";
export { sha256 };

const STORE_DIRECTORY = "dolly-images";
// The store's files this page reads: a build may still read one whose entry
// was evicted, so it is left for a later sweep.
const held = new Set();

async function storeDirectory() {
  try {
    return await (await navigator.storage.getDirectory()).getDirectoryHandle(STORE_DIRECTORY, { create: true });
  } catch { return null; }
}

// A new file of the store, written piece by piece: write(piece), then
// close() for its File or abort() to delete it. Null without a store.
async function openStoreFile() {
  const directory = await storeDirectory();
  if (!directory) return null;
  const name = crypto.randomUUID();
  const handle = await directory.getFileHandle(name, { create: true }), writable = await handle.createWritable();
  return {
    write: piece => writable.write(piece),
    async close() {
      await writable.close();
      held.add(name);
      return handle.getFile();
    },
    async abort() {
      await writable.abort().catch(() => {});
      await directory.removeEntry(name).catch(() => {});
    },
  };
}

// An artifact's identity read from its snapshot, SOURCE: a Blob, or the
// snapshot's bytes in pieces (an iterable of Uint8Array), which become a file
// of the store (a Blob in memory where the browser has no origin-private
// storage). The snapshot is digested and checked as it passes; only the
// identity's files under /etc/dolly are held.
export async function describeImageArtifact(source, recipeSha256, inputs = []) {
  const blob = source instanceof Blob ? source : null, hash = new Sha256(), parts = [];
  const file = blob ? null : await openStoreFile();
  const pieces = (async function* () {
    for await (const piece of blob ? blob.stream() : source) {
      hash.update(piece);
      if (file) await file.write(piece);
      else if (!blob) parts.push(new Blob([piece]));
      yield piece;
    }
  })();
  try {
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
      byteLength, manifest: [...records.keys()], bytes: blob ?? (file ? await file.close() : new Blob(parts)) };
  } catch (error) {
    await file?.abort();
    throw error;
  }
}

async function databaseOperation(mode, operation) {
  const database = await new Promise((resolve, reject) => {
    const request = indexedDB.open("dolly-image-artifacts-v3", 3);
    request.onupgradeneeded = () => {
      // This database contains rebuildable images, never named user sessions.
      if (request.result.objectStoreNames.contains("images")) request.result.deleteObjectStore("images");
      request.result.createObjectStore("images", { keyPath: "id" });
      // Other runtime versions' pages keep their images' bytes here; this
      // version's are files of the store, named by their entries.
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
        record.byteLength <= 0 || record.byteLength > snapshotSizeLimit || typeof record.file !== "string" ||
        !imageInputsMatch(record.inputs, inputs)) return null;
    return record;
  } catch { return null; }
}

// The cached artifact DESCRIPTOR names, its bytes the store's file, or null
// when the entry has changed or its file is missing or holds other bytes.
// Loading marks the entry used: the entries a build reads are evicted last.
export async function loadImageArtifact(descriptor) {
  try {
    const entry = await databaseOperation("readwrite", store => {
      const request = store.get(descriptor.id);
      request.onsuccess = () => { if (request.result?.file === descriptor.file) store.put({ ...request.result, usedAt: now() }); };
      return request;
    });
    if (entry?.file !== descriptor.file) return null;
    const payload = await (await (await storeDirectory()).getFileHandle(descriptor.file)).getFile();
    if (payload.size !== descriptor.byteLength || payload.size <= 0 || payload.size > snapshotSizeLimit) return null;
    held.add(descriptor.file);
    const artifact = await describeImageArtifact(payload, descriptor.recipeSha256, descriptor.inputs);
    return artifact.sha256 === descriptor.sha256 ? artifact : null;
  } catch { return null; }
}

const now = () => performance.timeOrigin + performance.now();

// Rebuildable images only; a bounded cache so builds cannot fill browser storage.
export const IMAGE_CACHE_MAX_ENTRIES = 32;
const IMAGE_CACHE_MAX_BYTES = 8 * 1024 ** 3;

// The name of the store's file holding BLOB: its own name when it is one of
// the store's files, else a new file written from it.
async function storeFileOf(directory, blob) {
  if (blob instanceof File && held.has(blob.name)) return blob.name;
  const file = await openStoreFile();
  try {
    for await (const piece of blob.stream()) await file.write(piece);
    return (await file.close()).name;
  } catch (error) {
    await file.abort();
    throw error;
  }
}

export async function saveImageArtifact(artifact, slot = artifact.recipeSha256) {
  try {
    if (artifact.buildId !== DOLLY_IMAGE_BUILD_ID || !(artifact.bytes instanceof Blob) ||
        artifact.bytes.size !== artifact.byteLength || artifact.byteLength <= 0 ||
        artifact.byteLength > snapshotSizeLimit) return false;
    const directory = await storeDirectory();
    if (!directory) return false;
    const file = await storeFileOf(directory, artifact.bytes);
    const id = `${DOLLY_IMAGE_BUILD_ID}:${artifact.recipeSha256}`;
    const { buildId, recipeSha256, sha256, inputs, hostRequirements, byteLength } = artifact;
    const removed = [];
    try {
      await databaseOperation("readwrite", (store, payloads) => {
        const remove = entry => { store.delete(entry.id); payloads.delete(entry.id); if (entry.file) removed.push(entry.file); };
        const previous = store.get(id);
        previous.onsuccess = () => {
          if (previous.result && previous.result.file !== file) remove(previous.result);
          store.put({ buildId, recipeSha256, sha256, inputs, hostRequirements, byteLength, slot, id, file, usedAt: now() });
          // Publish and prune atomically: failed writes preserve the previous
          // entry, and concurrent writers cannot prune each other's newly
          // published data. This runtime's previous image in the slot goes
          // first, then the least recently used images beyond the entry and
          // byte bounds. Other versions' pages keep their images here too, so
          // another runtime's are only bounded.
          const kept = [], cursor = store.openCursor();
          cursor.onsuccess = () => {
            const entry = cursor.result?.value;
            if (entry) {
              if (entry.id !== id) {
                if (entry.buildId === DOLLY_IMAGE_BUILD_ID && entry.slot === slot) remove(entry);
                else kept.push(entry);
              }
              cursor.result.continue();
              return;
            }
            kept.sort((left, right) => (right.usedAt ?? right.savedAt ?? 0) - (left.usedAt ?? left.savedAt ?? 0));
            let total = byteLength;
            kept.forEach((entry, index) => {
              total += entry.byteLength;
              if (index + 1 >= IMAGE_CACHE_MAX_ENTRIES || total > IMAGE_CACHE_MAX_BYTES) remove(entry);
            });
          };
        };
        return previous;
      });
    } catch (error) {
      if (file !== artifact.bytes.name) await directory.removeEntry(file).catch(() => {});
      return false;
    }
    await deleteStoreFiles(directory, removed.filter(name => !held.has(name)));
    await sweepStore(directory).catch(() => {});
    return true;
  } catch { return false; }
}

async function deleteStoreFiles(directory, names) {
  for (const name of names) await directory.removeEntry(name).catch(() => {});
}

// Files no entry names and this page does not hold, an hour after they were
// written: what a failed save or a closed page left, and the evicted files
// pages still read. Chrome lists a file being written under another name.
const SWEEP_AGE = 60 * 60 * 1000;
async function sweepStore(directory) {
  const named = new Set(await databaseOperation("readonly", store => store.getAll()).then(entries => entries.map(entry => entry.file)));
  for await (const [name, handle] of directory) {
    if (handle.kind !== "file" || named.has(name) || held.has(name) ||
        !/^[0-9a-f-]{36}$/.test(name) || (await handle.getFile()).lastModified > now() - SWEEP_AGE) continue;
    await directory.removeEntry(name).catch(() => {});
  }
}
