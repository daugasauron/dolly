// Prototype for tasks/20260930-230823-static-frontend: not part of the build.
// Plain static file server: one directory, directory index.html, MIME by extension,
// and the two cross-origin isolation headers (plus CORP). No rewrites, no sealing.
// usage: node static-serve.mjs ROOT [PORT] [CACHE_CONTROL]
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const [root, port = "0", cacheControl = "no-store"] = process.argv.slice(2);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript",
  ".json": "application/json", ".wasm": "application/wasm", ".woff2": "font/woff2", ".css": "text/css",
  ".md": "text/markdown; charset=utf-8", ".txt": "text/plain; charset=utf-8" };
const headers = { "cross-origin-opener-policy": "same-origin", "cross-origin-embedder-policy": "require-corp",
  "cross-origin-resource-policy": "same-origin", "cache-control": cacheControl };
const server = createServer(async (request, response) => {
  let path = normalize(decodeURIComponent(new URL(request.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  let file = join(root, path);
  console.log(`hit ${path}`);
  try {
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    const { size } = await stat(file);
    response.writeHead(200, { ...headers, "content-length": size,
      "content-type": types[extname(file)] ?? "application/octet-stream" });
    request.method === "HEAD" ? response.end() : createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404, headers).end("not found");
  }
});
server.listen(Number(port), "127.0.0.1", () => console.log(`http://127.0.0.1:${server.address().port}/`));
