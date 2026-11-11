import { imageBase } from "../../src/images.mjs";
import { MAX_SNAPSHOT_BYTES } from "../../src/snapshot-records.mjs";

const PACKAGES_ORIGIN = "https://packages.dolly.invalid";
const PACKAGE_LIMITS = Object.freeze({
  maxRequestBytes: 0, maxResponseBytes: MAX_SNAPSHOT_BYTES,
  timeoutMilliseconds: 30 * 60_000, credentialHeaders: new Set(),
  // Snapshots served per page: enough for every package, not for a loop.
  maxSnapshots: 64,
});
const directoryPath = "/v1/directory";
const packagePath = /^\/v1\/packages\/([0-9a-f]{64})\/from\/([^/]+)$/;

function reply(body, status, type = "text/plain; charset=utf-8") {
  return new Response(body, { status, headers: { "content-type": type, "cache-control": "no-store" } });
}

// The image directory a path segment names, or null: an http or https URL of a
// directory, written as the URL parser writes it, with nothing but a path.
function directoryOf(segment) {
  let text;
  try { text = decodeURIComponent(segment); } catch { return null; }
  const url = URL.parse(text);
  return url?.href === text && /^https?:$/.test(url.protocol) && url.pathname.endsWith("/") &&
    !url.username && !url.password && !url.search && !url.hash ? url : null;
}

// GET /v1/directory is the image directory the page loads its images from,
// amy's server unless the session names another. GET /v1/packages/SHA256/from/
// DIRECTORY is the exact snapshot of the package whose recipe has that pin in
// that directory's catalog, verified from its packs and merged as the guest
// reads it. Another directory than the page's is read only where the page's
// HTTP policy admits a GET of it (`admit`), and only packages built for this
// runtime pass. One snapshot is served at a time, until the guest has read it
// or the broker's timeout cancels it.
export class PackageService {
  constructor(admit) {
    this.admit = admit;
    this.active = false;
    this.served = 0;
  }
  get origin() { return PACKAGES_ORIGIN; }
  authorize(url, method, bytes) {
    return method === "GET" && bytes === 0 && (url.pathname === directoryPath || packagePath.test(url.pathname))
      ? PACKAGE_LIMITS : undefined;
  }
  async fetch(url, init) {
    if (url.pathname === directoryPath) return reply(imageBase.href);
    const [, sha256, segment] = packagePath.exec(url.pathname);
    const directory = directoryOf(segment);
    if (!directory) return reply("not the URL of an image directory\n", 400);
    if (directory.href !== imageBase.href) {
      try { this.admit(directory); } catch {
        return reply(`this page's HTTP policy does not admit ${directory.href}\n`, 403);
      }
    }
    if (this.active) return reply("another package snapshot is being served\n", 409);
    if (this.served >= PACKAGE_LIMITS.maxSnapshots) return reply("this page's package snapshot quota is spent\n", 429);
    this.active = true;
    this.served += 1;
    // The Worker (worker.mjs) answers each message in turn: the first with the
    // package found and its packs checked, every later one with the snapshot's
    // next chunk.
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
      if ((await ask({ directory: directory.href, sha256 })).missing) {
        release();
        return reply(`${directory.href} publishes no package with that recipe pin\n`, 404);
      }
    } catch (error) {
      release();
      return reply(`${directory.href}: ${error.message}\n`, 502);
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
