// The packages@0 Worker reads one package of an image directory and merges its
// packs into its snapshot, a chunk per request, off the page's thread: the page
// must answer the guest's reads at once, since a guest that finds no record
// waits 10 ms.
import { DOLLY_IMAGES, loadImages } from "../../page/images.mjs";
import { loadPackagedSnapshotMetadata, packagedSystemSnapshot } from "../../page/packaged-snapshot.mjs";

let chunks, admissions = 0;
const admitted = new Map();

// The limits of the rule by which the page's HTTP policy admits a GET of URL;
// a refusal throws.
const admit = url => new Promise((resolve, reject) => {
  admitted.set(++admissions, { resolve, reject });
  postMessage({ admit: url.href, id: admissions });
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

onmessage = async ({ data }) => {
  if (data.admitted !== undefined) {
    const { resolve, reject } = admitted.get(data.admitted);
    admitted.delete(data.admitted);
    return data.refused === undefined ? resolve(data.limits) : reject(new Error(data.refused));
  }
  try {
    if (data.directory) {
      await loadImages(data.directory, data.judged ? judgedFetch : undefined);
      const definition = DOLLY_IMAGES.find(candidate => candidate.role === "package" && candidate.sha256 === data.sha256);
      if (!definition) return postMessage({ missing: true });
      const metadata = await loadPackagedSnapshotMetadata(definition.image);
      chunks = await packagedSystemSnapshot(metadata);
      postMessage({ done: false, size: metadata.byteLength });
    } else {
      const { done, value } = await chunks.next();
      postMessage({ done, value }, done ? [] : [value.buffer]);
    }
  } catch (error) {
    postMessage({ error: error.message });
  }
};
