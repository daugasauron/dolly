// Static delivery for an already authorized bootstrap input or snapshot pack.
const partLimit = 20 * 1024 * 1024;
const assetLimit = 1024 * 1024 * 1024;

export const hex = bytes =>
  Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");

export async function sha256(bytes) {
  return hex(await crypto.subtle.digest("SHA-256", bytes));
}

// Release assets live under _dolly/RELEASE/; user-facing routes do not.
export function publicURL(path, applicationBase = new URL("../", import.meta.url)) {
  const root = new URL(applicationBase);
  root.pathname = root.pathname.replace(/_dolly\/[0-9a-f]{64}\/$/, "");
  return new URL(path, root);
}

export async function boundedAssetBody(response, limit, signal) {
  if (!response.ok || !response.body) throw new Error(`asset returned HTTP ${response.status}`);
  const reader = response.body.getReader(), chunks = [];
  let size = 0;
  try {
    for (;;) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) { await reader.cancel(); throw new Error("asset exceeds declared size"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

// Streams verified parts, holding at most one 20 MiB part per request. Each
// part matches the manifest hash before any of its bytes are delivered.
export async function decodeStaticAsset(response, target, init, maximumBytes, fetchRequest = globalThis.fetch.bind(globalThis)) {
  if (response.headers.get("x-dolly-parts") !== "1") return response;
  const url = new URL(target);
  if (response.status !== 200 || (init.method ?? "GET") !== "GET" || url.search || url.hash ||
      url.username || url.password || !/^https?:$/.test(url.protocol)) throw new Error("invalid multipart asset request");
  const manifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await boundedAssetBody(response, 65536, init.signal)));
  if (!Number.isSafeInteger(manifest.byteLength) || manifest.byteLength <= 0 ||
      manifest.byteLength > maximumBytes || manifest.byteLength > assetLimit ||
      !Array.isArray(manifest.parts) || manifest.parts.length < 2 || manifest.parts.length > 64 ||
      manifest.parts.some(part => !Number.isSafeInteger(part.byteLength) || part.byteLength <= 0 ||
        part.byteLength > partLimit || !/^[0-9a-f]{64}$/.test(part.sha256)) ||
      manifest.parts.reduce((size, part) => size + part.byteLength, 0) !== manifest.byteLength) {
    throw new Error("invalid multipart asset manifest");
  }
  let index = 0;
  const body = new ReadableStream({
    async pull(controller) {
      if (index === manifest.parts.length) { controller.close(); return; }
      const part = manifest.parts[index];
      // The manifest supplies no destinations. Parts are fixed siblings, with
      // no guest headers, credentials, query strings or redirect authority.
      const partURL = new URL(url);
      partURL.pathname += `.part-${index++}`;
      const result = await fetchRequest(partURL, { method: "GET", credentials: "omit", redirect: "error",
        referrerPolicy: "no-referrer", cache: "force-cache", signal: init.signal });
      const chunk = await boundedAssetBody(result, part.byteLength, init.signal);
      if (chunk.length !== part.byteLength || await sha256(chunk) !== part.sha256) throw new Error("asset part integrity mismatch");
      controller.enqueue(chunk);
    },
  }, { highWaterMark: 0 });
  const headers = new Headers(response.headers);
  headers.delete("x-dolly-parts");
  headers.delete("content-encoding");
  headers.set("content-length", String(manifest.byteLength));
  const decoded = new Response(body, { status: response.status, statusText: response.statusText, headers });
  Object.defineProperty(decoded, "url", { value: response.url });
  return decoded;
}
