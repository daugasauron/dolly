import { MAX_SNAPSHOT_BYTES } from "./snapshot-records.mjs";

// Static delivery for an already authorized bootstrap input or snapshot pack.
// Hosts cap file sizes, so assets travel as verified parts; nothing static is
// larger than the largest snapshot.
export const STATIC_PART_BYTES = 20 * 1024 * 1024;
export const staticMaxParts = () => Math.ceil(MAX_SNAPSHOT_BYTES / STATIC_PART_BYTES);

export const hex = bytes =>
  Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");

export async function sha256(bytes) {
  return hex(await crypto.subtle.digest("SHA-256", bytes));
}

// Recipes name a file this site publishes by its path from the site's root,
// /Dollyfile-system. Every page serves its own files wherever it is mounted
// and whatever its version, so neither changes recipe text, pins or image
// identity.
export const siteReference = path => `/${path}`;

// The public site, for the pages of another site that link to it. A recipe
// that names it by URL instead of a site path fails the lint.
export const PUBLIC_ORIGIN = "https://slopshare.dev";

// The path ("/Dollyfile-system") a site reference names among this page's
// files, or null for an absolute URL.
export const sitePath = reference => reference.startsWith("/") ? reference : null;

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

// A file a host stores in parts is a JSON manifest at its path that begins
// with these bytes, and no file stored whole does (the Pages exporter checks),
// so the page knows a manifest by its content: a host needs no header for it.
export const PARTS_MANIFEST_START = '{"byteLength":';

// The first `length` bytes of a response's body, and a response whose body is
// all of it again, those bytes first. It reads the body itself: reading a
// copy of it and cancelling the copy cost the original its first bytes, in
// Firefox up to 151 and in Node, when other bodies were read meanwhile.
async function peeked(response, length) {
  const reader = response.body.getReader(), chunks = [];
  let size = 0, ended = false;
  while (size < length) {
    const next = await reader.read();
    if (next.done) { ended = true; break; }
    chunks.push(next.value);
    size += next.value.length;
  }
  const head = new Uint8Array(Math.min(size, length));
  for (let offset = 0, index = 0; offset < head.length; ++index) {
    const taken = chunks[index].subarray(0, head.length - offset);
    head.set(taken, offset);
    offset += taken.length;
  }
  const body = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      if (ended) controller.close();
    },
    async pull(controller) {
      const next = await reader.read();
      if (next.done) controller.close(); else controller.enqueue(next.value);
    },
    cancel: reason => reader.cancel(reason),
  }, { highWaterMark: 0 });
  const whole = new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
  Object.defineProperty(whole, "url", { value: response.url });
  return { head, whole };
}

// Streams verified parts, holding at most one 20 MiB part per request. Each
// part matches the manifest hash before any of its bytes are delivered.
export async function decodeStaticAsset(given, target, init, maximumBytes, fetchRequest = globalThis.fetch.bind(globalThis)) {
  if (given.status !== 200 || !given.body) return given;
  const start = new TextEncoder().encode(PARTS_MANIFEST_START), { head, whole: response } = await peeked(given, start.length);
  if (head.length !== start.length || head.some((byte, index) => byte !== start[index])) return response;
  const url = new URL(target);
  if ((init.method ?? "GET") !== "GET" || url.search || url.hash ||
      url.username || url.password || !/^https?:$/.test(url.protocol)) throw new Error("invalid multipart asset request");
  const manifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await boundedAssetBody(response, 65536, init.signal)));
  if (!Number.isSafeInteger(manifest.byteLength) || manifest.byteLength <= 0 ||
      manifest.byteLength > maximumBytes || manifest.byteLength > MAX_SNAPSHOT_BYTES ||
      !Array.isArray(manifest.parts) || manifest.parts.length < 2 || manifest.parts.length > staticMaxParts() ||
      manifest.parts.some(part => !Number.isSafeInteger(part.byteLength) || part.byteLength <= 0 ||
        part.byteLength > STATIC_PART_BYTES || !/^[0-9a-f]{64}$/.test(part.sha256)) ||
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
  headers.delete("content-encoding");
  headers.set("content-length", String(manifest.byteLength));
  const decoded = new Response(body, { status: response.status, statusText: response.statusText, headers });
  Object.defineProperty(decoded, "url", { value: response.url });
  return decoded;
}
