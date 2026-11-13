#!/usr/bin/env node

import { readFile, readlink } from "node:fs/promises";
import { createServer } from "node:http";
import { basename, extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { sha256 } from "./sha256.mjs";
import { releaseVersion, robotsText } from "./release-layout.mjs";

export const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
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
  [".woff", "font/woff"],
  [".svg", "image/svg+xml"],
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
// The site's Content-Security-Policy, as Pages and this server send it: the
// strict policy of docs/embedding.md, with the inline styles of its menu and
// lists, and every destination its default HTTP policy admits.
export const siteContentSecurityPolicy = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' blob:; " +
  "worker-src 'self' blob:; img-src 'self' blob:; style-src 'self' 'unsafe-inline'; connect-src *; " +
  "object-src 'none'; base-uri 'none'";

// Serves RELEASES/current as it would be deployed: / leads to its version, the
// release's files are under /vX.Y.Z/, robots.txt speaks for that version, and
// every other path is 404. A candidate keeps its version while it changes, so
// a file is cached only as its digest: the browser asks again each time and
// keeps what it has while the digest is the same (ETag). dist/ and the source
// checkout are build inputs, never the running app.
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
      if (path === "/" || path === "/llms.txt") {
        response.writeHead(302, { ...isolationHeaders, location: base + path.slice(1) }).end();
        return;
      }
      if (path === "/robots.txt") {
        const about = await readFile(resolve(releases, digest, "llms.txt"));
        if (sha256(about) !== files.get("llms.txt")) throw new Error("published file changed");
        response.writeHead(200, { ...isolationHeaders, "content-type": mimeTypes.get(".txt") });
        response.end(robotsText(about.toString(), [base.slice(1, -1)]));
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
      const etag = `"${files.get(file)}"`;
      if (request.headers["if-none-match"] === etag) {
        response.writeHead(304, { ...isolationHeaders, "cache-control": "no-cache", etag }).end();
        return;
      }
      const body = await readFile(resolve(releases, digest, file));
      if (sha256(body) !== files.get(file)) throw new Error("published file changed");
      response.writeHead(200, {
        ...isolationHeaders, "cache-control": "no-cache", etag, "content-security-policy": siteContentSecurityPolicy,
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
