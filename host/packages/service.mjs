import { DOLLY_IMAGES } from "../../dist/dolly-images.mjs";
import { loadPackagedSnapshotMetadata, loadPackagedSystemSnapshot } from "../../src/image-artifact.mjs";
import { MAX_SNAPSHOT_BYTES } from "../../src/snapshot-records.mjs";
import { boundedAssetBody } from "../../src/static-asset.mjs";

export const PACKAGES_ORIGIN = "https://packages.dolly.invalid";
export const PACKAGE_LIMITS = Object.freeze({
  maxRequestBytes: 0, maxResponseBytes: MAX_SNAPSHOT_BYTES,
  timeoutMilliseconds: 30 * 60_000, credentialHeaders: new Set(),
  // Snapshots served per page: enough for every package, not for a loop.
  maxSnapshots: 64, indexBytes: 64 * 1024,
});
const packagePath = /^\/v1\/packages\/([0-9a-f]{64})$/;

function reply(body, status, type = "text/plain; charset=utf-8") {
  return new Response(body, { status, headers: { "content-type": type, "cache-control": "no-store" } });
}

// GET /v1/index is the release's package index; GET /v1/packages/SHA256 is the
// exact snapshot of the package whose recipe has that pin, verified from the
// published packs. One snapshot is held at a time, until the guest has read
// it or the broker's deadline cancels it.
export class PackageService {
  constructor(applicationBase) {
    this.applicationBase = applicationBase;
    this.active = false;
    this.served = 0;
  }
  get origin() { return PACKAGES_ORIGIN; }
  authorize(url, method, bytes) {
    return method === "GET" && bytes === 0 && (url.pathname === "/v1/index" || packagePath.test(url.pathname))
      ? PACKAGE_LIMITS : undefined;
  }
  async fetch(url, init) {
    if (url.pathname === "/v1/index") {
      const response = await fetch(new URL("dist/dolly-packages.txt", this.applicationBase),
        { cache: "no-store", credentials: "same-origin", redirect: "error", signal: init.signal });
      return reply(await boundedAssetBody(response, PACKAGE_LIMITS.indexBytes, init.signal), 200);
    }
    const sha256 = packagePath.exec(url.pathname)[1];
    const definition = DOLLY_IMAGES.find(candidate => candidate.role === "package" && candidate.sha256 === sha256);
    if (!definition) return reply("This release publishes no package with that recipe pin\n", 404);
    if (this.active) return reply("Another package snapshot is being served\n", 409);
    if (this.served >= PACKAGE_LIMITS.maxSnapshots) return reply("Package snapshot quota exceeded\n", 429);
    this.active = true;
    this.served += 1;
    let bytes;
    try {
      const metadata = await loadPackagedSnapshotMetadata(definition.image);
      bytes = await loadPackagedSystemSnapshot(definition.image, metadata, init.signal);
    } catch (error) {
      this.active = false;
      return reply(`${definition.image}: ${error.message}\n`, 502);
    }
    const release = () => { this.active = false; };
    let offset = 0;
    const body = new ReadableStream({
      pull: controller => {
        const end = Math.min(offset + 1024 * 1024, bytes.byteLength);
        controller.enqueue(new Uint8Array(bytes, offset, end - offset));
        offset = end;
        if (offset === bytes.byteLength) { controller.close(); release(); }
      },
      cancel: release,
    }, { highWaterMark: 0 });
    return reply(body, 200, "application/octet-stream");
  }
}
