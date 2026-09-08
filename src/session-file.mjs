import { DOLLY_SESSION_MAX_BYTES, validateSessionRecord, decodeSessionSnapshot } from "./session-store.mjs";

const magic = new TextEncoder().encode("DOLLYSF1");
const headerSize = magic.length + 4;
const metadataLimit = 8192;
const checksum = async bytes => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
  .map(byte => byte.toString(16).padStart(2, "0")).join("");

export async function exportSessionFile(record) {
  validateSessionRecord(record);
  const { name, formatVersion, buildId, image, imageIdentity, updatedAt, encoding, bytes } = record;
  const metadata = new TextEncoder().encode(JSON.stringify({
    name, formatVersion, buildId, image, imageIdentity, updatedAt, encoding,
    byteLength: bytes.byteLength, sha256: await checksum(bytes),
  }));
  if (metadata.byteLength > metadataLimit) throw new Error("Session metadata is too large");
  const header = new Uint8Array(headerSize);
  header.set(magic);
  new DataView(header.buffer).setUint32(magic.length, metadata.byteLength, true);
  return new Blob([header, metadata, bytes], { type: "application/octet-stream" });
}

// An opaque filesystem delta, never browser paths or executable browser code.
// Import validates the envelope; the Wasm restore validates filesystem records.
export async function importSessionFile(file) {
  if (!(file instanceof Blob) || file.size < headerSize ||
      file.size > headerSize + metadataLimit + DOLLY_SESSION_MAX_BYTES) throw new Error("Invalid session file size");
  const header = new Uint8Array(await file.slice(0, headerSize).arrayBuffer());
  if (!magic.every((byte, index) => byte === header[index])) throw new Error("Not a supported Dolly session file");
  const length = new DataView(header.buffer).getUint32(magic.length, true);
  if (length === 0 || length > metadataLimit || headerSize + length >= file.size) throw new Error("Invalid session file header");
  const metadata = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(
    await file.slice(headerSize, headerSize + length).arrayBuffer()));
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata) ||
      metadata.byteLength !== file.size - headerSize - length ||
      !/^[0-9a-f]{64}$/.test(metadata.sha256)) throw new Error("Invalid session file metadata");
  const { name, formatVersion, buildId, image, imageIdentity, updatedAt, encoding } = metadata;
  const bytes = await file.slice(headerSize + length).arrayBuffer();
  const record = { name, formatVersion, buildId, image, imageIdentity, updatedAt, encoding, bytes };
  validateSessionRecord(record);
  if (await checksum(bytes) !== metadata.sha256) throw new Error("Session file checksum failed; the file is damaged");
  const decoded = await decodeSessionSnapshot(record);
  if (decoded.byteLength < 16) throw new Error("Session file contains an incomplete snapshot");
  return record;
}
