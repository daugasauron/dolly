export const DOLLY_SESSION_FORMAT_VERSION = 1;
export const DOLLY_SESSION_MAX_BYTES = 512 * 1024 * 1024;

const databaseName = "dolly-sessions-v1";
const storeName = "sessions";

export function validSessionName(value) {
  return typeof value === "string" && value.length >= 1 && value.length <= 64 &&
    value !== "." && value !== ".." && /^[A-Za-z0-9._-]+$/.test(value);
}

export function sessionImageIdentity(definitions, selectedImage) {
  const byImage = new Map(definitions.map((definition) => [definition.image, definition]));
  const chain = [];
  const seen = new Set();
  let definition = byImage.get(selectedImage);
  while (definition) {
    if (seen.has(definition.image)) throw new Error("Dolly image inheritance cycle");
    seen.add(definition.image);
    chain.unshift(`${definition.image}:${definition.sha256}`);
    if (!definition.extends) break;
    definition = byImage.get(definition.extends);
    if (!definition) throw new Error("Dolly image parent is missing");
  }
  if (chain.length === 0) throw new Error("Dolly session names an unknown image");
  return chain.join("\n");
}

async function collectStream(stream, maximum) {
  const reader = stream.getReader();
  const chunks = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maximum) {
      await reader.cancel();
      throw new Error("Dolly session exceeds its size limit");
    }
    chunks.push(value);
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result.buffer;
}

export async function encodeSessionSnapshot(bytes) {
  if (!(bytes instanceof ArrayBuffer) || bytes.byteLength < 16 ||
      bytes.byteLength > DOLLY_SESSION_MAX_BYTES) {
    throw new TypeError("invalid Dolly session snapshot");
  }
  if (typeof CompressionStream !== "function") {
    return { encoding: "identity", bytes };
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
  return {
    encoding: "gzip",
    bytes: await collectStream(stream, DOLLY_SESSION_MAX_BYTES),
  };
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
  const stream = new Blob([record.bytes]).stream()
    .pipeThrough(new DecompressionStream("gzip"));
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
  return (await transaction("readonly", (store) => store.get(name))) ?? null;
}

export async function saveStoredSession(record) {
  if (record === null || typeof record !== "object" ||
      !validSessionName(record.name) ||
      record.formatVersion !== DOLLY_SESSION_FORMAT_VERSION ||
      typeof record.buildId !== "string" || typeof record.image !== "string" ||
      typeof record.imageIdentity !== "string" ||
      !Number.isSafeInteger(record.updatedAt) ||
      !(record.bytes instanceof ArrayBuffer)) {
    throw new TypeError("invalid Dolly session record");
  }
  await transaction("readwrite", (store) => store.put(record));
}
