import { DOLLY_IMAGE_BUILD_ID } from "../dist/dolly-image-build-id.mjs";
import { DOLLY_IMAGES } from "../dist/dolly-images.mjs";
import { imageInputs, imageInputsMatch } from "./image-inputs.mjs";
import { loadRecipeGraph } from "./dollyfile-graph.mjs";
import { hostRequirements } from "./host/requirements.mjs";
import { decodeStaticAsset } from "./static-asset.mjs";
import { decodeSnapshotRecords, mergeSnapshotRecords, validateSnapshotPacks, MAX_SNAPSHOT_BYTES as snapshotSizeLimit } from "./snapshot-records.mjs";
const applicationBase = new URL("../", import.meta.url);
const packBase = new URL(applicationBase);
packBase.pathname = packBase.pathname.replace(/_dolly\/[0-9a-f]{64}\/$/, "");
const imageDefinitions = new Map(DOLLY_IMAGES.map(definition => [definition.image, definition]));
const encoder = new TextEncoder();
const expectedRecipes = image => imageDefinitions.get(image).recipes;
export async function sha256(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function validSnapshotPath(path) {
  return typeof path === "string" && path.startsWith("/") && path.length > 1 &&
    path.length <= 4096 && !path.includes("\\") && !path.includes("\0") &&
    !path.includes("//") &&
    !path.split("/").some((part) => part === "." || part === "..") &&
    !["/tmp", "/workspace", "/home/dolly/.pi/agent/auth.json", "/home/dolly/.pi/agent/sessions"]
      .some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

async function verifyVisibleRecipes(recipes) {
  for (const recipe of recipes) {
    const response = await fetch(new URL(recipe.sourcePath.slice(1), applicationBase), {
      cache: "no-store", credentials: "same-origin", redirect: "error",
    });
    if (!response.ok) throw new Error(`${recipe.sourcePath} returned HTTP ${response.status}`);
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength !== recipe.byteLength || await sha256(bytes) !== recipe.sha256) {
      throw new Error(`${recipe.sourcePath} does not match the packaged snapshot recipe`);
    }
  }
}

function expectedModules(image) {
  return imageDefinitions.get(image).modules;
}

export async function loadPackagedSnapshotMetadata(image, checked = new Map(), active = new Set()) {
  if (checked.has(image)) return checked.get(image);
  if (active.has(image)) throw new Error("packaged image cycle");
  active.add(image);
  const metadataUrl = new URL(
    `dist/dolly-${image}-system-snapshot.mjs`, applicationBase,
  );
  let metadata;
  try {
    ({ DOLLY_SYSTEM_SNAPSHOT: metadata } = await import(metadataUrl.href));
  } catch {
    throw new Error("The packaged system snapshot is missing. Run npm run snapshot first.");
  }
  const recipes = expectedRecipes(image);
  const modules = expectedModules(image);
  if (metadata === null || typeof metadata !== "object" ||
      metadata.image !== image || metadata.buildId !== DOLLY_IMAGE_BUILD_ID ||
      metadata.formatVersion !== 2 || metadata.identityVersion !== 2 ||
      JSON.stringify(metadata.recipes) !== JSON.stringify(recipes) ||
      JSON.stringify(metadata.modules) !== JSON.stringify(modules) ||
      JSON.stringify(hostRequirements(metadata.hostRequirements)) !== JSON.stringify(imageDefinitions.get(image).hostRequirements ?? []) ||
      !Number.isSafeInteger(metadata.byteLength) || metadata.byteLength <= 0 ||
      metadata.byteLength > snapshotSizeLimit ||
      (![undefined, "gzip", "packs"].includes(metadata.encoding)) ||
      (metadata.encoding === "gzip" &&
       (!Number.isSafeInteger(metadata.encodedByteLength) ||
        metadata.encodedByteLength <= 0 || metadata.encodedByteLength > snapshotSizeLimit)) ||
      !/^[0-9a-f]{64}$/.test(metadata.sha256) ||
      !Array.isArray(metadata.manifest) || metadata.manifest.length === 0 ||
      metadata.manifest.length > 100_000) {
    throw new Error("The packaged system snapshot metadata does not match this Dolly build");
  }
  if (metadata.encoding === "packs") validateSnapshotPacks(metadata);
  const inputs = imageInputs(metadata.inputs);
  const references = [...new Set(imageDefinitions.get(image).artifacts.map(reference => reference.sha256))].sort();
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
    "/etc/dolly/entry",
    "/etc/dolly/environment",
    "/etc/dolly/image",
    "/etc/dolly/recipes.lock",
  ]) {
    if (!metadata.manifest.includes(required)) {
      throw new Error(`The packaged system snapshot is missing ${required}`);
    }
  }
  const expectedInputs = [];
  for (const reference of imageDefinitions.get(image).artifacts) {
    const dependency = DOLLY_IMAGES.find(candidate => `/${candidate.dollyfile}` === reference.location && candidate.sha256 === reference.sha256);
    if (!dependency) throw new Error("packaged image input is missing");
    const parent = await loadPackagedSnapshotMetadata(dependency.image, checked, active);
    expectedInputs.push({ recipeSha256: reference.sha256, sha256: parent.sha256 });
  }
  if (!imageInputsMatch(inputs, expectedInputs)) throw new Error("The packaged system snapshot has stale image inputs");
  if (active.size === 1) await verifyVisibleRecipes(recipes);
  active.delete(image);
  checked.set(image, metadata);
  return metadata;
}

async function* packagedSnapshotParts(image, metadata, signal) {
  const packed = metadata.encoding === "packs";
  const parts = packed ? validateSnapshotPacks(metadata) : [metadata];
  for (const part of parts) {
    signal?.throwIfAborted();
    const compressed = packed || metadata.encoding === "gzip";
    const url = packed
      ? new URL(`dist/packs/${part.sha256}.snapshot.gz`, packBase)
      : new URL(`dist/dolly-${image}-system.snapshot${compressed ? ".gz" : ""}`, applicationBase);
    const init = { cache: packed ? "force-cache" : "no-store", credentials: "same-origin", redirect: "error", signal };
    const expected = compressed ? part.encodedByteLength : part.byteLength;
    const response = await decodeStaticAsset(await fetch(url, init), url, init, expected);
    if (!response.ok || !response.body) throw new Error(`snapshot returned HTTP ${response.status}`);
    const declared = response.headers.get("content-length");
    if (declared !== null && Number(declared) !== expected) throw new Error("snapshot HTTP content length mismatch");
    const body = compressed ? response.body.pipeThrough(new DecompressionStream("gzip")) : response.body;
    yield { ...part, body };
  }
}

// The sink owns incremental hashing. Every part is checked before another is
// requested; the caller verifies the complete canonical image before booting.
export async function streamPackagedSystemSnapshot(image, metadata, write, endPart, signal) {
  for await (const part of packagedSnapshotParts(image, metadata, signal)) {
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

export async function loadPackagedSystemSnapshot(image, metadata, signal) {
  const parts = [];
  for await (const part of packagedSnapshotParts(image, metadata, signal)) {
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


export async function describeImageArtifact(bytes, recipeSha256, inputs = []) {
  const records = decodeSnapshotRecords(bytes);
  const source = records.get("/etc/dolly/Dollyfile");
  if (source?.kind !== 2 || await sha256(source.data) !== recipeSha256 ||
      records.get("/etc/dolly/artifact")?.kind !== 2) throw new Error("artifact recipe identity mismatch");
  // The artifact retains every recipe it was built from, named by kind and name.
  const graph = await loadRecipeGraph(location => {
    if (location === "Dollyfile") return source.data;
    const path = location.startsWith("/modules/") ? `/etc/dolly/recipes${location}`
      : `/etc/dolly/recipes/${location === "/Dollyfile" ? "default" : location.slice(11)}.Dollyfile`;
    const record = records.get(path);
    if (record?.kind !== 2) throw new Error(`artifact does not retain recipe ${location}`);
    return record.data;
  }, "Dollyfile");
  const required = graph.root.hostRequirements;
  return { buildId: DOLLY_IMAGE_BUILD_ID, recipeSha256, sha256: await sha256(bytes),
    inputs: imageInputs(inputs), hostRequirements: required,
    byteLength: bytes.byteLength, manifest: [...records.keys()], bytes };
}

async function databaseOperation(mode, operation) {
  const database = await new Promise((resolve, reject) => {
    const request = indexedDB.open("dolly-image-artifacts-v3", 3);
    request.onupgradeneeded = () => {
      // This database contains rebuildable images, never named user sessions.
      if (request.result.objectStoreNames.contains("images")) request.result.deleteObjectStore("images");
      const store = request.result.createObjectStore("images", { keyPath: "id" });
      store.createIndex("slot", ["buildId", "slot"]);
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
    const size = payload instanceof Blob ? payload.size : payload?.byteLength;
    if (size !== descriptor.byteLength || size <= 0 || size > snapshotSizeLimit) return null;
    const bytes = payload instanceof Blob ? await payload.arrayBuffer() : payload;
    if (!(bytes instanceof ArrayBuffer) || bytes.byteLength !== descriptor.byteLength ||
        bytes.byteLength > snapshotSizeLimit) return null;
    const artifact = await describeImageArtifact(bytes, descriptor.recipeSha256, descriptor.inputs);
    return artifact.sha256 === descriptor.sha256 ? artifact : null;
  } catch { return null; }
}

export async function saveImageArtifact(artifact, slot = artifact.recipeSha256) {
  try {
    if (artifact.buildId !== DOLLY_IMAGE_BUILD_ID || !(artifact.bytes instanceof ArrayBuffer) ||
        artifact.bytes.byteLength !== artifact.byteLength || artifact.byteLength <= 0 ||
        artifact.byteLength > snapshotSizeLimit) return false;
    const id = `${DOLLY_IMAGE_BUILD_ID}:${artifact.recipeSha256}`;
    const { buildId, recipeSha256, sha256, inputs, hostRequirements } = artifact;
    await databaseOperation("readwrite", (store, payloads) => {
      payloads.put(new Blob([artifact.bytes]), id);
      const published = store.put({ buildId, recipeSha256, sha256, inputs, hostRequirements, byteLength: artifact.bytes.byteLength, slot, id });
      // Publish and prune atomically: failed writes preserve the previous pair,
      // and concurrent writers cannot prune each other's newly published data.
      const remove = key => { store.delete(key); payloads.delete(key); };
      const oldVersions = store.index("slot").openKeyCursor(IDBKeyRange.only([DOLLY_IMAGE_BUILD_ID, slot]));
      oldVersions.onsuccess = () => {
        const cursor = oldVersions.result;
        if (!cursor) return;
        if (cursor.primaryKey !== id) remove(cursor.primaryKey);
        cursor.continue();
      };
      const oldRuntimes = store.openKeyCursor();
      oldRuntimes.onsuccess = () => {
        const cursor = oldRuntimes.result;
        if (!cursor) return;
        if (!String(cursor.key).startsWith(`${DOLLY_IMAGE_BUILD_ID}:`)) remove(cursor.key);
        cursor.continue();
      };
      return published;
    });
    return true;
  } catch { return false; }
}
