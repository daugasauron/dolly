#!/usr/bin/env node

import { readFile, readlink } from "node:fs/promises";
import { createServer } from "node:http";
import { basename, extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { sha256 } from "./snapshot-identity.mjs";
import { releaseVersion } from "./release-layout.mjs";

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

// Serves RELEASES/current as it would be deployed: / leads to its version and
// the release's files are under /vX.Y.Z/; every other path is 404. Nothing is
// cacheable: a candidate keeps its version while it changes. dist/ and the
// source checkout are build inputs, never the running app.
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
      const path = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
      if (path === "/") {
        response.writeHead(302, { ...isolationHeaders, location: base }).end();
        return;
      }
      if (!path.startsWith(base)) throw new Error("unversioned path");
      // A directory's address ends in a slash, as its page's relative links expect.
      const relative = path.slice(base.length), page = `${relative}${relative && !relative.endsWith("/") ? "/" : ""}index.html`;
      const file = files.has(relative) ? relative : page;
      if (!files.has(file)) throw new Error("not published");
      if (file === page && !path.endsWith("/")) {
        response.writeHead(308, { ...isolationHeaders, location: `${path}/` }).end();
        return;
      }
      const body = await readFile(resolve(releases, digest, file));
      if (sha256(body) !== files.get(file)) throw new Error("published file changed");
      response.writeHead(200, {
        ...isolationHeaders,
        "content-type": /^Dollyfile(?:-|$)/.test(basename(file)) ? "text/plain; charset=utf-8" :
          mimeTypes.get(extname(file)) ?? "application/octet-stream",
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
