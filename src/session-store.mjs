import { inspectDollyfile } from "./dollyfile-view.mjs";
import { imageInputs } from "./image-inputs.mjs";
import { publicURL } from "./static-asset.mjs";

export const DOLLY_SESSION_FORMAT_VERSION = 2;
export const DOLLY_SESSION_MAX_BYTES = 512 * 1024 * 1024;
export const DOLLY_SESSION_METADATA_MAX_BYTES = 1024 * 1024;

const databaseName = "dolly-sessions-v1";
const storeName = "sessions";

export function validSessionName(value) {
  return typeof value === "string" && value.length >= 1 && value.length <= 64 &&
    value !== "." && value !== ".." && value !== "index.html" && /^[A-Za-z0-9._-]+$/.test(value);
}

export function sessionImageIdentity(definitions, selectedImage) {
  const definition = definitions.find(({ image }) => image === selectedImage);
  if (!definition) throw new Error("Dolly session names an unknown image");
  return `${definition.image}:${definition.sha256}`;
}

export function customSessionIdentity(custom) {
  const artifact = custom?.artifact;
  if (!artifact || typeof artifact.buildId !== "string" || !artifact.buildId.length || artifact.buildId.length > 128 ||
      typeof artifact.recipeSha256 !== "string" || typeof artifact.sha256 !== "string" ||
      !/^[0-9a-f]{64}$/.test(artifact.recipeSha256) || !/^[0-9a-f]{64}$/.test(artifact.sha256) ||
      !Number.isSafeInteger(artifact.byteLength) || artifact.byteLength <= 0 ||
      artifact.byteLength > DOLLY_SESSION_MAX_BYTES ||
      !Array.isArray(custom.policies) || custom.policies.length === 0 || custom.policies.length > 16 ||
      new TextEncoder().encode(JSON.stringify(custom.policies)).byteLength > 65536 ||
      inspectDollyfile(custom.source).kind !== "image") {
    throw new TypeError("invalid custom session base");
  }
  imageInputs(artifact.inputs);
  return `custom:${artifact.recipeSha256}:${artifact.sha256}`;
}

export function sessionCompatible(record, definitions, buildId, imageBuildId) {
  if (record.formatVersion !== DOLLY_SESSION_FORMAT_VERSION || record.buildId !== buildId) return false;
  if (record.image === "custom") {
    try {
      return record.imageIdentity === customSessionIdentity(record.customImage) &&
        record.customImage.artifact.buildId === imageBuildId;
    } catch { return false; }
  }
  return record.customImage === undefined && definitions.some(({ image }) => image === record.image) &&
    record.imageIdentity === sessionImageIdentity(definitions, record.image);
}

export function sessionLoadUrl(name, applicationBase) {
  if (!validSessionName(name)) throw new TypeError("invalid Dolly session name");
  // Local releases pin assets by digest; named-session links stay public and stable.
  return publicURL(`session/${name}`, applicationBase);
}

export async function listStoredSessions() {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const active = database.transaction(storeName, "readonly");
      const request = active.objectStore(storeName).openCursor();
      const sessions = [];
      request.addEventListener("success", () => {
        const cursor = request.result;
        if (!cursor) return;
        const { bytes, ...metadata } = cursor.value;
        sessions.push({ ...metadata, byteLength: bytes?.byteLength ?? bytes?.size ?? 0 });
        cursor.continue();
      });
      request.addEventListener("error", () => reject(request.error));
      active.addEventListener("abort", () => reject(active.error));
      active.addEventListener("complete", () => resolve(
        sessions.sort((left, right) => right.updatedAt - left.updatedAt),
      ));
    });
  } finally {
    database.close();
  }
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

export async function encodeSessionStream(produce) {
  const stream = new CompressionStream("gzip"), writer = stream.writable.getWriter();
  const encoded = collectStream(stream.readable, DOLLY_SESSION_MAX_BYTES);
  // The reader can fail while the producer is awaiting its next mailbox chunk.
  encoded.catch(() => {});
  try {
    await produce(bytes => writer.write(bytes));
    await writer.close();
    // Blob storage needs fixed buffers; decoded buffers transfer directly to Wasm.
    return { encoding: "gzip", bytes: (await encoded).transferToFixedLength() };
  } catch (error) {
    await writer.abort(error).catch(() => {});
    await encoded.catch(() => {});
    throw error;
  }
}

export async function decodeSessionSnapshot(record) {
  if (record === null || typeof record !== "object" ||
      !(record.bytes instanceof ArrayBuffer) || record.bytes.byteLength === 0 ||
      record.bytes.byteLength > DOLLY_SESSION_MAX_BYTES ||
      !["gzip", "identity"].includes(record.encoding)) {
    throw new Error("Stored Dolly session is invalid");
  }
  if (record.encoding === "identity") return record.bytes.slice(0);
  if (typeof DecompressionStream !== "function") {
    throw new Error("This browser cannot decompress the stored Dolly session");
  }
  let offset = 0;
  const stream = new ReadableStream({
    pull(controller) {
      if (offset === record.bytes.byteLength) { controller.close(); return; }
      const length = Math.min(65536, record.bytes.byteLength - offset);
      controller.enqueue(new Uint8Array(record.bytes, offset, length));
      offset += length;
    },
  }).pipeThrough(new DecompressionStream("gzip"));
  return collectStream(stream, DOLLY_SESSION_MAX_BYTES);
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
  if (record?.bytes instanceof Blob) {
    if (record.bytes.size === 0 || record.bytes.size > DOLLY_SESSION_MAX_BYTES) {
      throw new Error("Stored Dolly session is invalid");
    }
    record.bytes = await record.bytes.arrayBuffer();
  }
  return record;
}

export function validateSessionRecord(record) {
  if (record === null || typeof record !== "object" ||
      !validSessionName(record.name) ||
      record.formatVersion !== DOLLY_SESSION_FORMAT_VERSION ||
      typeof record.buildId !== "string" || record.buildId.length > 128 ||
      typeof record.image !== "string" || !/^[a-z][a-z0-9-]{0,31}$/.test(record.image) ||
      typeof record.imageIdentity !== "string" || record.imageIdentity.length > 256 ||
      !Number.isSafeInteger(record.updatedAt) ||
      !(record.bytes instanceof ArrayBuffer) || record.bytes.byteLength === 0 ||
      record.bytes.byteLength > DOLLY_SESSION_MAX_BYTES ||
      !["gzip", "identity"].includes(record.encoding)) {
    throw new TypeError("invalid Dolly session record");
  }
  if (record.image === "custom" ? record.imageIdentity !== customSessionIdentity(record.customImage)
    : record.customImage !== undefined) throw new TypeError("invalid custom session identity");
}

export async function saveStoredSession(record, { overwrite = true } = {}) {
  validateSessionRecord(record);
  const stored = { ...record, bytes: new Blob([record.bytes]) };
  await transaction("readwrite", (store) => overwrite ? store.put(stored) : store.add(stored));
}

export async function deleteStoredSession(name) {
  if (!validSessionName(name)) throw new TypeError("invalid Dolly session name");
  await transaction("readwrite", store => store.delete(name));
}
