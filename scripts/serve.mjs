#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";

const projectDir = resolve(import.meta.dirname, "..");
const distDirectory = resolve(projectDir, "dist");
const port = Number(process.env.DOLLY_PORT ?? 8080);
const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
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
  "src/browser.mjs",
  "src/http-policy.mjs",
  "src/runtime-worker.mjs",
]);

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url, "http://127.0.0.1");
    const route = decodeURIComponent(requestUrl.pathname).replace(/\/+$/, "") || "/";
    const relative = route === "/" || route === "/rebuild"
      ? "index.html"
      : route.slice(1);
    const path = resolve(projectDir, relative);
    const distAsset = relative.startsWith("dist/") &&
      path.startsWith(`${distDirectory}${sep}`);
    if ((request.method !== "GET" && request.method !== "HEAD") ||
        (!publicSources.has(relative) && !distAsset)) {
      response.writeHead(404, isolationHeaders).end("not found");
      return;
    }
    const body = await readFile(path);
    response.writeHead(200, {
      ...isolationHeaders,
      "content-type": mimeTypes.get(extname(path)) ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch {
    response.writeHead(404, isolationHeaders).end("not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`dolly: http://127.0.0.1:${port}/`);
});
