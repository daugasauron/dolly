import { validName } from "../../page/image-names.mjs";
import { imageInputs } from "../../page/image-inputs.mjs";
import { MAX_SNAPSHOT_BYTES } from "../../page/snapshot-records.mjs";
import { DOLLY_VERSION } from "../../page/version.mjs";

// The saves of this browser, in IndexedDB. A save is the whole filesystem but
// /dev, /proc and /run (kernel.c), at most 8 GiB before and after compression.
export const DOLLY_SESSION_FORMAT_VERSION = 4;
export const DOLLY_SESSION_MAX_BYTES = 8 * 1024 * 1024 * 1024;
export const DOLLY_SESSION_METADATA_MAX_BYTES = 1024 * 1024;

// Saves belong to a version: every version's pages open their own database.
const databaseName = `dolly-sessions-v${DOLLY_VERSION}`;
const storeName = "sessions";

export function validSessionName(value) {
  return typeof value === "string" && value.length >= 1 && value.length <= 64 &&
    value !== "." && value !== ".." && /^[A-Za-z0-9._-]+$/.test(value);
}

export function sessionImageIdentity(definitions, selectedImage) {
  const definition = definitions.find(({ image }) => image === selectedImage);
  if (!definition) throw new Error("Dolly session names an unknown image");
  return `${definition.image}:${definition.sha256}`;
}

// The policies are what the page's network hands a tab opened from another;
// it refuses a tab whose inheritance lacks them (page/network.mjs).
export function customSessionIdentity(custom) {
  const artifact = custom?.artifact, policies = custom?.policies;
  if (!artifact || typeof artifact.buildId !== "string" || !artifact.buildId.length || artifact.buildId.length > 128 ||
      typeof artifact.recipeSha256 !== "string" || typeof artifact.sha256 !== "string" ||
      !/^[0-9a-f]{64}$/.test(artifact.recipeSha256) || !/^[0-9a-f]{64}$/.test(artifact.sha256) ||
      !Number.isSafeInteger(artifact.byteLength) || artifact.byteLength <= 0 ||
      artifact.byteLength > MAX_SNAPSHOT_BYTES ||
      (policies !== undefined && (!Array.isArray(policies) || policies.length === 0 || policies.length > 16 ||
        new TextEncoder().encode(JSON.stringify(policies)).byteLength > 65536))) {
    throw new TypeError("invalid custom session base");
  }
  // The site parses the Dollyfile where it imports a session file or runs the image.
  if (typeof custom.source !== "string") throw new TypeError("invalid custom session base");
  imageInputs(artifact.inputs);
  return `custom:${artifact.recipeSha256}:${artifact.sha256}`;
}

// A save holds its whole filesystem, so it opens wherever its programs run: on
// a runtime with the image build ID of the one that made it (buildId; a rebuilt
// kernel keeps it while the images stay valid), whatever became of its image's
// recipe. The image need only still be named (its host modules are the
// catalog's), a custom one by the recipe it carries.
export function sessionCompatible(record, definitions, buildId) {
  if (record.formatVersion !== DOLLY_SESSION_FORMAT_VERSION || record.buildId !== buildId) return false;
  if (record.image === "custom") {
    try { return record.imageIdentity === customSessionIdentity(record.customImage); } catch { return false; }
  }
  return record.customImage === undefined && definitions.some(({ image }) => image === record.image);
}

export function sessionLoadUrl(name, applicationBase) {
  if (!validSessionName(name)) throw new TypeError("invalid Dolly session name");
  return new URL(`session/?name=${name}`, applicationBase);
}

export async function listStoredSessions() {
  const records = await transaction("readonly", store => store.getAll());
  return records.map(({ bytes, ...metadata }) => ({ ...metadata, byteLength: bytes.size }));
}

async function collectStream(stream, maximum) {
  const reader = stream.getReader();
  try {
    const buffer = new ArrayBuffer(0, { maxByteLength: maximum });
    const bytes = new Uint8Array(buffer);
    let length = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const end = length + value.byteLength;
      if (end > maximum) throw new Error("Dolly session exceeds its size limit");
      if (end > buffer.byteLength) buffer.resize(Math.min(maximum,
        Math.max(end, buffer.byteLength * 2, 65536)));
      bytes.set(value, length);
      length = end;
    }
    buffer.resize(length);
    return buffer;
  } catch (error) {
    await reader.cancel(error).catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

// The compressed save, a Blob of its parts: no buffer holds it whole.
async function collectBlob(stream, maximum) {
  const reader = stream.getReader(), parts = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximum) throw new Error("Dolly session exceeds its size limit");
      parts.push(value);
    }
    return new Blob(parts);
  } catch (error) {
    await reader.cancel(error).catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

export async function encodeSessionStream(produce) {
  const stream = new CompressionStream("gzip"), writer = stream.writable.getWriter();
  const encoded = collectBlob(stream.readable, DOLLY_SESSION_MAX_BYTES);
  // The reader can fail while the producer is awaiting its next mailbox chunk.
  encoded.catch(() => {});
  try {
    await produce(bytes => writer.write(bytes));
    await writer.close();
    return { encoding: "gzip", bytes: await encoded };
  } catch (error) {
    await writer.abort(error).catch(() => {});
    await encoded.catch(() => {});
    throw error;
  }
}

// A whole save in one buffer, for a test that reads its records: at most 2 GiB.
export async function decodeSessionSnapshot(bytes) {
  if (!(bytes instanceof Blob) || bytes.size === 0) throw new Error("Stored Dolly session is invalid");
  return collectStream(bytes.stream().pipeThrough(new DecompressionStream("gzip")), 2 * 1024 * 1024 * 1024);
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.addEventListener("upgradeneeded", () => {
      if (!request.result.objectStoreNames.contains(storeName)) {
        request.result.createObjectStore(storeName, { keyPath: "name" });
      }
    });
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error), { once: true });
  });
}

async function transaction(mode, operation) {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const active = database.transaction(storeName, mode);
      const request = operation(active.objectStore(storeName));
      let result;
      request.addEventListener("success", () => { result = request.result; }, { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
      active.addEventListener("complete", () => resolve(result), { once: true });
      active.addEventListener("abort", () => reject(active.error), { once: true });
    });
  } finally {
    database.close();
  }
}

export async function loadStoredSession(name) {
  if (!validSessionName(name)) throw new TypeError("invalid Dolly session name");
  const record = (await transaction("readonly", (store) => store.get(name))) ?? null;
  if (record === null) return null;
  if (!(record.bytes instanceof Blob) || record.bytes.size === 0 || record.bytes.size > DOLLY_SESSION_MAX_BYTES) {
    throw new Error("Stored Dolly session is invalid");
  }
  return record;
}

export function validateSessionRecord(record) {
  if (record === null || typeof record !== "object" ||
      !validSessionName(record.name) ||
      record.formatVersion !== DOLLY_SESSION_FORMAT_VERSION ||
      typeof record.buildId !== "string" || record.buildId.length > 128 ||
      typeof record.image !== "string" || !validName(record.image) ||
      typeof record.imageIdentity !== "string" || record.imageIdentity.length > 256 ||
      !Number.isSafeInteger(record.updatedAt) ||
      !(record.bytes instanceof Blob) || record.bytes.size === 0 ||
      record.bytes.size > DOLLY_SESSION_MAX_BYTES || record.encoding !== "gzip") {
    throw new TypeError("invalid Dolly session record");
  }
  if (record.image === "custom" ? record.imageIdentity !== customSessionIdentity(record.customImage)
    : record.customImage !== undefined) throw new TypeError("invalid custom session identity");
}

export async function saveStoredSession(record, { overwrite = true } = {}) {
  validateSessionRecord(record);
  await transaction("readwrite", (store) => overwrite ? store.put(record) : store.add(record));
}

export async function deleteStoredSession(name) {
  if (!validSessionName(name)) throw new TypeError("invalid Dolly session name");
  await transaction("readwrite", store => store.delete(name));
}
