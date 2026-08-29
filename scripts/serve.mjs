#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";

const projectDir = resolve(import.meta.dirname, "..");
const port = Number(process.env.DOLLY_PORT ?? 8080);
const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".wasm", "application/wasm"],
  [".data", "application/octet-stream"],
  [".woff2", "font/woff2"],
]);

const isolationHeaders = {
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-embedder-policy": "require-corp",
  "cross-origin-resource-policy": "same-origin",
};

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url, "http://127.0.0.1");
    const relative = decodeURIComponent(requestUrl.pathname) === "/"
      ? "index.html"
      : decodeURIComponent(requestUrl.pathname).slice(1);
    const path = resolve(projectDir, relative);
    if (path !== projectDir && !path.startsWith(`${projectDir}${sep}`)) {
      response.writeHead(403, isolationHeaders).end("forbidden");
      return;
    }
    const body = await readFile(path);
    response.writeHead(200, {
      ...isolationHeaders,
      "content-type": mimeTypes.get(extname(path)) ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    response.end(body);
  } catch {
    response.writeHead(404, isolationHeaders).end("not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`dolly: http://127.0.0.1:${port}/`);
});
