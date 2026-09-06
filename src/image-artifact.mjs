import { DOLLY_BUILD_ID } from "../dist/dolly-build-id.mjs";
import { DOLLY_IMAGES } from "../dist/dolly-images.mjs";
import { imageInputs, imageInputsMatch } from "./image-inputs.mjs";
import { decodeSnapshotRecords, mergeSnapshotRecords, validateSnapshotPacks, MAX_SNAPSHOT_BYTES as snapshotSizeLimit } from "./snapshot-records.mjs";
const applicationBase = new URL("../", import.meta.url);
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
      metadata.image !== image || metadata.buildId !== DOLLY_BUILD_ID ||
      metadata.formatVersion !== 2 || metadata.identityVersion !== 2 ||
      JSON.stringify(metadata.recipes) !== JSON.stringify(recipes) ||
      JSON.stringify(metadata.modules) !== JSON.stringify(modules) ||
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

export async function loadPackagedSystemSnapshot(image, metadata) {
  if (metadata.encoding === "packs") {
    const parts = [];
    for (const pack of validateSnapshotPacks(metadata)) {
      const url = new URL(`dist/packs/${pack.sha256}.snapshot.gz`, applicationBase);
      const response = await fetch(url, { cache: "force-cache", credentials: "same-origin", redirect: "error" });
      if (!response.ok || !response.body) throw new Error(`snapshot pack returned HTTP ${response.status}`);
      const reader = response.body.pipeThrough(new DecompressionStream("gzip")).getReader();
      const bytes = new Uint8Array(pack.byteLength);
      let offset = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value.length > bytes.length - offset) { await reader.cancel(); throw new Error("snapshot pack exceeds declared size"); }
          bytes.set(value, offset);
          offset += value.length;
        }
      } finally { reader.releaseLock(); }
      if (offset !== bytes.length || await sha256(bytes) !== pack.sha256) throw new Error("snapshot pack integrity mismatch");
      parts.push(bytes);
    }
    const bytes = mergeSnapshotRecords(parts);
    if (bytes.length !== metadata.byteLength || await sha256(bytes) !== metadata.sha256) throw new Error("packed snapshot integrity mismatch");
    return bytes.buffer;
  }
  const compressed = metadata.encoding === "gzip";
  const artifactUrl = new URL(
    `dist/dolly-${image}-system.snapshot${compressed ? ".gz" : ""}`, applicationBase,
  );
  let response;
  try {
    response = await fetch(artifactUrl, {
      cache: "no-store", credentials: "same-origin", redirect: "error",
    });
  } catch {
    throw new Error("The packaged system snapshot could not be loaded");
  }
  if (!response.ok) throw new Error(`The packaged system snapshot returned HTTP ${response.status}`);
  const declared = response.headers.get("content-length");
  const expectedLength = compressed ? metadata.encodedByteLength : metadata.byteLength;
  if (declared !== null && Number(declared) !== expectedLength) {
    throw new Error("The packaged system snapshot has the wrong HTTP content length");
  }
  if (!response.body) throw new Error("The packaged system snapshot has no body");
  const stream = compressed
    ? response.body.pipeThrough(new DecompressionStream("gzip"))
    : response.body;
  const reader = stream.getReader();
  const bytes = new Uint8Array(metadata.byteLength);
  let offset = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength > bytes.byteLength - offset) {
        await reader.cancel();
        throw new Error("The packaged system snapshot exceeds its declared size");
      }
      bytes.set(value, offset);
      offset += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  if (offset !== metadata.byteLength || await sha256(bytes) !== metadata.sha256) {
    throw new Error("The packaged system snapshot failed its integrity check");
  }
  return bytes.buffer;
}


export async function describeImageArtifact(bytes, recipeSha256, inputs = []) {
  const records = decodeSnapshotRecords(bytes);
  const source = records.get("/etc/dolly/Dollyfile");
  if (source?.kind !== 2 || await sha256(source.data) !== recipeSha256 ||
      records.get("/etc/dolly/artifact")?.kind !== 2) throw new Error("artifact recipe identity mismatch");
  return { buildId: DOLLY_BUILD_ID, recipeSha256, sha256: await sha256(bytes),
    inputs: imageInputs(inputs), byteLength: bytes.byteLength, manifest: [...records.keys()], bytes };
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
    const id = `${DOLLY_BUILD_ID}:${recipeSha256}`;
    const record = await databaseOperation("readonly", store => store.get(id));
    if (record?.id !== id || record.buildId !== DOLLY_BUILD_ID || record.recipeSha256 !== recipeSha256 ||
        !/^[0-9a-f]{64}$/.test(record.sha256) || !Number.isSafeInteger(record.byteLength) ||
        record.byteLength <= 0 || record.byteLength > snapshotSizeLimit ||
        !imageInputsMatch(record.inputs, inputs)) return null;
    return record;
  } catch { return null; }
}

export async function loadImageArtifact(descriptor) {
  try {
    const id = `${DOLLY_BUILD_ID}:${descriptor.recipeSha256}`;
    const bytes = await databaseOperation("readonly", (_store, payloads) => payloads.get(id));
    if (!(bytes instanceof ArrayBuffer) || bytes.byteLength !== descriptor.byteLength ||
        bytes.byteLength > snapshotSizeLimit) return null;
    const artifact = await describeImageArtifact(bytes, descriptor.recipeSha256, descriptor.inputs);
    return artifact.sha256 === descriptor.sha256 ? artifact : null;
  } catch { return null; }
}

export async function saveImageArtifact(artifact, slot = artifact.recipeSha256) {
  try {
    if (artifact.buildId !== DOLLY_BUILD_ID || !(artifact.bytes instanceof ArrayBuffer) ||
        artifact.bytes.byteLength !== artifact.byteLength || artifact.byteLength <= 0 ||
        artifact.byteLength > snapshotSizeLimit) return false;
    const id = `${DOLLY_BUILD_ID}:${artifact.recipeSha256}`;
    const { buildId, recipeSha256, sha256, inputs } = artifact;
    await databaseOperation("readwrite", (store, payloads) => {
      payloads.put(artifact.bytes, id);
      const published = store.put({ buildId, recipeSha256, sha256, inputs, byteLength: artifact.bytes.byteLength, slot, id });
      // Publish and prune atomically: failed writes preserve the previous pair,
      // and concurrent writers cannot prune each other's newly published data.
      const remove = key => { store.delete(key); payloads.delete(key); };
      const oldVersions = store.index("slot").openKeyCursor(IDBKeyRange.only([DOLLY_BUILD_ID, slot]));
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
        if (!String(cursor.key).startsWith(`${DOLLY_BUILD_ID}:`)) remove(cursor.key);
        cursor.continue();
      };
      return published;
    });
    return true;
  } catch { return false; }
}
