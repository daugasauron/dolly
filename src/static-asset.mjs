// Static delivery for an already authorized bootstrap input or snapshot pack.
const partLimit = 20 * 1024 * 1024;
const hash = async bytes => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
  .map(byte => byte.toString(16).padStart(2, "0")).join("");

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

export async function decodeStaticAsset(response, target, init, maximumBytes, fetchRequest = globalThis.fetch.bind(globalThis)) {
  if (response.headers.get("x-dolly-parts") !== "1") return response;
  const url = new URL(target);
  if (response.status !== 200 || (init.method ?? "GET") !== "GET" || url.search || url.hash ||
      url.username || url.password || !/^https?:$/.test(url.protocol)) throw new Error("invalid multipart asset request");
  const manifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await boundedAssetBody(response, 65536, init.signal)));
  if (!Number.isSafeInteger(manifest.byteLength) || manifest.byteLength <= 0 ||
      manifest.byteLength > maximumBytes || manifest.byteLength > 512 * 1024 * 1024 ||
      !/^[0-9a-f]{64}$/.test(manifest.sha256) || !Array.isArray(manifest.parts) ||
      manifest.parts.length < 2 || manifest.parts.length > 64 ||
      manifest.parts.some(part => !Number.isSafeInteger(part.byteLength) || part.byteLength <= 0 ||
        part.byteLength > partLimit || !/^[0-9a-f]{64}$/.test(part.sha256)) ||
      manifest.parts.reduce((size, part) => size + part.byteLength, 0) !== manifest.byteLength) {
    throw new Error("invalid multipart asset manifest");
  }
  const bytes = new Uint8Array(manifest.byteLength);
  let offset = 0;
  for (const [index, part] of manifest.parts.entries()) {
    init.signal?.throwIfAborted();
    // The manifest supplies no destinations. Parts are fixed siblings, with
    // no guest headers, credentials, query strings or redirect authority.
    const partURL = new URL(url);
    partURL.pathname += `.part-${index}`;
    const result = await fetchRequest(partURL, { method: "GET", credentials: "omit", redirect: "error",
      referrerPolicy: "no-referrer", cache: "force-cache", signal: init.signal });
    const chunk = await boundedAssetBody(result, part.byteLength, init.signal);
    if (chunk.length !== part.byteLength || await hash(chunk) !== part.sha256) throw new Error("asset part integrity mismatch");
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  if (await hash(bytes) !== manifest.sha256) throw new Error("multipart asset integrity mismatch");
  const headers = new Headers(response.headers);
  headers.delete("x-dolly-parts");
  headers.delete("content-encoding");
  headers.set("content-length", String(bytes.length));
  const decoded = new Response(bytes, { status: response.status, statusText: response.statusText, headers });
  Object.defineProperty(decoded, "url", { value: response.url });
  return decoded;
}
