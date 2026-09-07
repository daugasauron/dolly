#!/usr/bin/env node

import { readFile, readlink, readdir } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { sha256 } from "./snapshot-identity.mjs";
import { renderReleasePage, snapshotPackPath } from "./release-layout.mjs";

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".md", "text/markdown; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".wat", "text/plain; charset=utf-8"],
  [".h", "text/plain; charset=utf-8"],
  [".c", "text/plain; charset=utf-8"],
  [".sh", "text/plain; charset=utf-8"],
  [".dm", "text/plain; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".wasm", "application/wasm"],
  [".woff2", "font/woff2"],
]);
const isolationHeaders = {
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-embedder-policy": "require-corp",
  "cross-origin-resource-policy": "same-origin",
  "cache-control": "no-store",
};
const releaseDigest = /^[0-9a-f]{64}$/;

// Only published files are visible. dist/ and the source checkout are build inputs,
// never the running app. Each HTML response pins subsequent asset requests.
export function createReleaseServer(releases) {
  const manifests = new Map();
  const packReleases = new Map();
  let scannedRelease;
  async function filesFor(digest) {
    if (!releaseDigest.test(digest)) throw new Error("invalid release ID");
    if (!manifests.has(digest)) {
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
      manifests.set(digest, files);
      for (const path of files.keys()) if (snapshotPackPath.test(path)) packReleases.set(path, digest);
    }
    return manifests.get(digest);
  }
  return createServer(async (request, response) => {
    try {
      if (!["GET", "HEAD"].includes(request.method)) throw new Error("unsupported method");
      const url = new URL(request.url, "http://127.0.0.1");
      let path = decodeURIComponent(url.pathname).slice(1);
      if (/[\\\0]/.test(path) || path.split("/").some(part => part === "." || part === "..")) {
        throw new Error("invalid path");
      }
      let digest;
      const pinned = /^_dolly\/([0-9a-f]{64})\/(.*)$/.exec(path);
      if (pinned) [, digest, path] = pinned;
      else digest = await readlink(resolve(releases, "current"));
      let files = await filesFor(digest);
      if (!pinned && snapshotPackPath.test(path) && !files.has(path)) {
        // Stable content URLs may outlive the current release. Only discover
        // files through digest-verified published manifests, never loose blobs.
        if (!packReleases.has(path) && scannedRelease !== digest) {
          for (const entry of await readdir(releases)) if (releaseDigest.test(entry)) {
            try { await filesFor(entry); } catch { /* Ignore incomplete or corrupt old releases. */ }
          }
          scannedRelease = digest;
        }
        digest = packReleases.get(path);
        files = await filesFor(digest);
      }
      const route = path.replace(/\/+$/, "");
      const session = /^session\/[A-Za-z0-9._-]{1,64}$/.test(route) && !files.has(route);
      const relative = session ? "session/open.html" : files.has(path) ? path :
        `${route ? route + "/" : ""}index.html`;
      if (!files.has(relative)) throw new Error("not published");
      let body = await readFile(resolve(releases, digest, relative));
      if (sha256(body) !== files.get(relative)) throw new Error("published file changed");
      if (relative.endsWith(".html")) {
        body = Buffer.from(renderReleasePage(body.toString("utf8"), relative, digest, files));
      }
      response.writeHead(200, {
        ...isolationHeaders,
        "cache-control": pinned || snapshotPackPath.test(relative)
          ? "public, max-age=31536000, immutable" : "no-store",
        "content-type": /^Dollyfile(?:-|$)/.test(relative) ? "text/plain; charset=utf-8" :
          mimeTypes.get(extname(relative)) ?? "application/octet-stream",
      });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch {
      response.writeHead(404, isolationHeaders).end("not found");
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const releases = resolve(import.meta.dirname, "../build/releases");
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
