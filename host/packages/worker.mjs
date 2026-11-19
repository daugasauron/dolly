// The packages@0 Worker reads an image directory's index, or one of its
// packages and merges its packs into its snapshot, a chunk per request, off
// the runtime Worker's thread, which answers the guest's reads meanwhile.
// Another directory than the page's it reads judged (`judged`): each file only
// once the page's HTTP policy admits it, which its parent asks (transport.mjs),
// and none of its packs is kept in the page's store (page/pack-store.mjs).
import { DOLLY_IMAGES, loadImages } from "../../page/images.mjs";
import { loadPackagedSnapshotMetadata, packagedSystemSnapshot } from "../../page/packaged-snapshot.mjs";

let chunks, admissions = 0, transport;
const admitted = new Map();
// The page makes this Worker (host/runtime/runtime.mjs pageWorkers): its asks
// come, and its answers go, on the port the page sends first.
const post = (message, transfer) => transport.postMessage(message, transfer);
onmessage = ({ data }) => { transport = data.supervisor; transport.onmessage = answer; };

// The limits of the rule by which the page's HTTP policy admits a GET of URL;
// a refusal throws.
const admit = url => new Promise((resolve, reject) => {
  admitted.set(++admissions, { resolve, reject });
  post({ admit: url.href, id: admissions });
});

// Another directory's file, read as the broker reads one for the guest:
// admitted and counted by the page's policy, without credentials, its body
// bounded by the rule's maxResponseBytes and each wait for it by its timeout.
async function judgedFetch(url, init = {}) {
  const { maxResponseBytes, timeoutMilliseconds } = await admit(url);
  const controller = new AbortController();
  init.signal?.addEventListener("abort", () => controller.abort(init.signal.reason), { once: true });
  let timer, bytes = 0;
  const moved = () => {
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(new Error(`${url} timed out`)), timeoutMilliseconds);
  };
  moved();
  const response = await fetch(url, { ...init, credentials: "omit", referrerPolicy: "no-referrer", redirect: "error",
    signal: controller.signal });
  moved();
  const body = response.body?.pipeThrough(new TransformStream({
    transform(chunk, stream) {
      bytes += chunk.length;
      if (bytes > maxResponseBytes) throw new Error(`${url} exceeds its size limit`);
      moved();
      stream.enqueue(chunk);
    },
    flush: () => clearTimeout(timer),
  }));
  return new Response(body ?? null, { status: response.status, statusText: response.statusText, headers: response.headers });
}

// The first LIMIT bytes of a response's body, or null when it holds more.
async function bounded(response, limit) {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader(), parts = [];
  for (let length = 0; ;) {
    const { done, value } = await reader.read();
    if (done) return parts.length === 1 ? parts[0] : new Uint8Array(await new Blob(parts).arrayBuffer());
    length += value.length;
    if (length > limit) { await reader.cancel(); return null; }
    parts.push(value);
  }
}

async function answer({ data }) {
  if (data.admitted !== undefined) {
    const { resolve, reject } = admitted.get(data.admitted);
    admitted.delete(data.admitted);
    return data.refused === undefined ? resolve(data.limits) : reject(new Error(data.refused));
  }
  try {
    if (data.index) {
      const url = new URL("amy-index.txt", data.directory);
      const response = await (data.judged ? judgedFetch(url) : fetch(url, { credentials: "same-origin", redirect: "error" }));
      if (!response.ok) return post({ missing: true });
      const bytes = await bounded(response, data.index);
      post({ bytes }, bytes ? [bytes.buffer] : []);
    } else if (data.directory) {
      await loadImages(data.directory, data.judged ? judgedFetch : undefined);
      const definition = DOLLY_IMAGES.find(candidate => candidate.role === "package" && candidate.sha256 === data.sha256);
      if (!definition) return post({ missing: true });
      const metadata = await loadPackagedSnapshotMetadata(definition.image);
      chunks = await packagedSystemSnapshot(metadata);
      post({ done: false, size: metadata.byteLength });
    } else {
      const { done, value } = await chunks.next();
      post({ done, value }, done ? [] : [value.buffer]);
    }
  } catch (error) {
    post({ error: error.message });
  }
}
