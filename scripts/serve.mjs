#!/usr/bin/env node

import { readFile, readlink } from "node:fs/promises";
import { createServer } from "node:http";
import { basename, extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { sha256 } from "./snapshot-identity.mjs";
import { publicFiles, renderReleasePage, snapshotPackPath } from "./release-layout.mjs";
import { releaseVersion } from "./site-release.mjs";

export const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".md", "text/markdown; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".wat", "text/plain; charset=utf-8"],
  [".h", "text/plain; charset=utf-8"],
  [".c", "text/plain; charset=utf-8"],
  [".cpp", "text/plain; charset=utf-8"],
  [".patch", "text/plain; charset=utf-8"],
  [".py", "text/plain; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".sh", "text/plain; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".wasm", "application/wasm"],
  [".woff2", "font/woff2"],
  [".png", "image/png"],
  [".mp4", "video/mp4"],
]);
export const isolationHeaders = {
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-embedder-policy": "require-corp",
  "cross-origin-resource-policy": "same-origin",
  "cache-control": "no-store",
};
const releaseDigest = /^[0-9a-f]{64}$/;

// Serves RELEASES/current as it would be deployed: / leads to its version, the
// site is under /vX.Y.Z/ with its assets pinned to the release, and every
// other path is 404. dist/ and the source checkout are build inputs, never
// the running app.
export function createReleaseServer(releases) {
  let current;
  async function release() {
    const digest = await readlink(resolve(releases, "current"));
    if (current?.digest === digest) return current;
    if (!releaseDigest.test(digest)) throw new Error("invalid release ID");
    const manifest = await readFile(resolve(releases, digest, "release/files.sha256"), "utf8");
    if (sha256(manifest) !== digest) throw new Error("release manifest changed");
    const files = new Map();
    for (const row of manifest.trimEnd().split("\n")) {
      const match = /^([0-9a-f]{64})  (.+)$/.exec(row);
      if (!match || /[\\\0]/.test(match[2]) ||
          match[2].split("/").some(part => !part || part === "." || part === "..") ||
          files.has(match[2])) throw new Error("invalid release file manifest");
      files.set(match[2], match[1]);
    }
    const version = await readFile(resolve(releases, digest, "src/version.mjs"));
    if (sha256(version) !== files.get("src/version.mjs")) throw new Error("published file changed");
    return current = { digest, files, base: `/${releaseVersion(version.toString())}/` };
  }
  return createServer(async (request, response) => {
    try {
      if (!["GET", "HEAD"].includes(request.method)) throw new Error("unsupported method");
      const { digest, files, base } = await release();
      let path = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
      if (path === "/") {
        response.writeHead(302, { ...isolationHeaders, location: base }).end();
        return;
      }
      if (!path.startsWith(base) || /[\\\0]/.test(path) || path.split("/").some(part => part === "." || part === "..")) {
        throw new Error("invalid path");
      }
      path = path.slice(base.length);
      const pinned = path.startsWith(`_dolly/${digest}/`);
      if (pinned) path = path.slice(`_dolly/${digest}/`.length);
      const route = path.replace(/\/+$/, "");
      const relative = files.has(path) ? path : `${route ? route + "/" : ""}index.html`;
      if (!files.has(relative) || !(pinned || relative.endsWith(".html") || snapshotPackPath.test(relative) ||
          publicFiles.includes(relative))) throw new Error("not published");
      let body = await readFile(resolve(releases, digest, relative));
      if (sha256(body) !== files.get(relative)) throw new Error("published file changed");
      if (relative.endsWith(".html")) {
        body = Buffer.from(renderReleasePage(body.toString("utf8"), relative, digest, files, base));
      }
      response.writeHead(200, {
        ...isolationHeaders,
        "cache-control": pinned || snapshotPackPath.test(relative)
          ? "public, max-age=31536000, immutable" : "no-store",
        "content-type": /^Dollyfile(?:-|$)/.test(basename(relative)) ? "text/plain; charset=utf-8" :
          mimeTypes.get(extname(relative)) ?? "application/octet-stream",
      });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch {
      response.writeHead(404, isolationHeaders).end("not found");
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const releases = process.argv[2] ? resolve(process.argv[2]) : resolve(import.meta.dirname, "../build/releases");
  try {
    if (!releaseDigest.test(await readlink(resolve(releases, "current")))) throw new Error("invalid current release");
  } catch {
    throw new Error("No published Dolly app. Run npm run publish after building; failed builds leave it untouched.");
  }
  const server = createReleaseServer(releases);
  server.listen(Number(process.env.DOLLY_PORT ?? 8080), "127.0.0.1", () => {
    console.log(`dolly: http://127.0.0.1:${server.address().port}/`);
  });
}
