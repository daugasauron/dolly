#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";

import { discoverImageDefinitions, inspectStaticSources } from "./image-definitions.mjs";

const projectDir = resolve(import.meta.dirname, "..");
const distDirectory = resolve(projectDir, "dist");
const port = Number(process.env.DOLLY_PORT ?? 8080);
const imageDefinitions = await discoverImageDefinitions(projectDir);
const staticSources = await inspectStaticSources(projectDir, imageDefinitions);
const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".md", "text/markdown; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".wasm", "application/wasm"],
  [".data", "application/octet-stream"],
  [".snapshot", "application/octet-stream"],
  [".woff2", "font/woff2"],
]);

const isolationHeaders = {
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-embedder-policy": "require-corp",
  "cross-origin-resource-policy": "same-origin",
};
const publicSources = new Set([
  "index.html",
  ...imageDefinitions.map((definition) => definition.filename),
  "coi-serviceworker.js",
  "src/browser.mjs",
  "src/dollyfile-view.mjs",
  "src/dollyfile-viewer.mjs",
  "src/http-policy.mjs",
  "src/session-store.mjs",
  "src/runtime-worker.mjs",
]);
const sourceArtifacts = new Map(staticSources.map((source) => [
  source.path.slice(1),
  { relative: `dist/${source.path.slice(1)}`, source },
]));
const routeDocuments = new Map([
  ...imageDefinitions.flatMap(({ image }) => [
    [`/${image}`, `build/routes/${image}/index.html`],
    [`/${image}/rebuild`, `build/routes/${image}/rebuild/index.html`],
    [`/view/${image}`, `build/routes/view/${image}/index.html`],
  ]),
  ["/custom/rebuild", "build/routes/custom/rebuild/index.html"],
  ["/rebuild", "build/routes/rebuild/index.html"],
  ["/load", "build/routes/load/index.html"],
]);

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url, "http://127.0.0.1");
    const route = decodeURIComponent(requestUrl.pathname).replace(/\/+$/, "") || "/";
    const requested = route.slice(1);
    const relative = route === "/"
      ? "index.html"
      : routeDocuments.get(route) ?? sourceArtifacts.get(requested)?.relative ?? requested;
    const path = resolve(projectDir, relative);
    const distAsset = relative.startsWith("dist/") &&
      path.startsWith(`${distDirectory}${sep}`);
    if ((request.method !== "GET" && request.method !== "HEAD") ||
        (!publicSources.has(relative) && !routeDocuments.has(route) &&
         !sourceArtifacts.has(requested) &&
         !relative.startsWith("docs/") && !distAsset)) {
      response.writeHead(404, isolationHeaders).end("not found");
      return;
    }
    const body = await readFile(path);
    const source = sourceArtifacts.get(requested)?.source;
    response.writeHead(200, {
      ...isolationHeaders,
      "content-type": source?.media === "txt" || imageDefinitions.some(
        (definition) => definition.filename === relative,
      ) ? "text/plain; charset=utf-8" :
        mimeTypes.get(extname(path)) ?? "application/octet-stream",
      "cache-control": "no-store",
      ...(source?.media === "bin"
        ? { "content-disposition": `attachment; filename="${source.path.split("/").at(-1)}"` }
        : {}),
    });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch {
    response.writeHead(404, isolationHeaders).end("not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`dolly: http://127.0.0.1:${port}/`);
});
