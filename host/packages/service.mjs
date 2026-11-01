import { DOLLY_IMAGES, imageBase } from "../../src/images.mjs";
import { loadPackagedSnapshotMetadata } from "../../src/packaged-snapshot.mjs";
import { MAX_SNAPSHOT_BYTES } from "../../src/snapshot-records.mjs";

const PACKAGES_ORIGIN = "https://packages.dolly.invalid";
const PACKAGE_LIMITS = Object.freeze({
  maxRequestBytes: 0, maxResponseBytes: MAX_SNAPSHOT_BYTES,
  timeoutMilliseconds: 30 * 60_000, credentialHeaders: new Set(),
  // Snapshots served per page: enough for every package, not for a loop.
  maxSnapshots: 64,
});
const packagePath = /^\/v1\/packages\/([0-9a-f]{64})$/;

function reply(body, status, type = "text/plain; charset=utf-8") {
  return new Response(body, { status, headers: { "content-type": type, "cache-control": "no-store" } });
}

// GET /v1/packages/SHA256 is the exact snapshot of the package whose recipe
// has that pin, verified from the published packs and merged as the guest
// reads it. One snapshot is served at a time, until the guest has read it or
// the broker's deadline cancels it.
export class PackageService {
  constructor() {
    this.active = false;
    this.served = 0;
  }
  get origin() { return PACKAGES_ORIGIN; }
  authorize(url, method, bytes) {
    return method === "GET" && bytes === 0 && packagePath.test(url.pathname) ? PACKAGE_LIMITS : undefined;
  }
  async fetch(url, init) {
    const sha256 = packagePath.exec(url.pathname)[1];
    const definition = DOLLY_IMAGES.find(candidate => candidate.role === "package" && candidate.sha256 === sha256);
    if (!definition) return reply("This release publishes no package with that recipe pin\n", 404);
    if (this.active) return reply("Another package snapshot is being served\n", 409);
    if (this.served >= PACKAGE_LIMITS.maxSnapshots) return reply("Package snapshot quota exceeded\n", 429);
    this.active = true;
    this.served += 1;
    // The Worker (worker.mjs) answers each message in turn: the first with the
    // packs checked, every later one with the snapshot's next chunk.
    const worker = new Worker(new URL("./worker.mjs", import.meta.url), { type: "module", name: "dolly-packages" });
    let released = false, refuse;
    const release = () => {
      if (released) return;
      released = true;
      worker.terminate();
      refuse?.(new Error("the package transfer ended"));
      this.active = false;
    };
    init.signal?.addEventListener("abort", release, { once: true });
    const ask = message => new Promise((resolve, reject) => {
      refuse = reject;
      worker.onmessage = ({ data }) => data.error === undefined ? resolve(data) : reject(new Error(data.error));
      worker.onerror = event => { event.preventDefault(); reject(new Error(event.message || "package Worker failed")); };
      if (released) reject(new Error("the package transfer ended"));
      else worker.postMessage(message);
    });
    try {
      const metadata = await loadPackagedSnapshotMetadata(definition.image);
      await ask({ base: imageBase.href, metadata });
    } catch (error) {
      release();
      return reply(`${definition.image}: ${error.message}\n`, 502);
    }
    const body = new ReadableStream({
      async pull(controller) {
        try {
          const { done, value } = await ask({});
          if (done) { release(); controller.close(); } else controller.enqueue(value);
        } catch (error) {
          release();
          throw error;
        }
      },
      cancel: release,
    }, { highWaterMark: 4 });
    return reply(body, 200, "application/octet-stream");
  }
}
