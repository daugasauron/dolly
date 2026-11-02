// Serves this directory with the cross-origin isolation Dolly needs, answers
// workspace.json with the files under workspace/ for the page, and relays
// the hosts in `relayed` for programs that need a host without CORS headers.
//   node serve.mjs   (PORT=8080)
import { createServer } from "node:http";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, normalize, relative } from "node:path";

// Hosts without CORS headers: METHOD /relay/HOST/PATH is sent on to https://HOST/PATH.
const relayed = new Set([]);
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".json": "application/json", ".wasm": "application/wasm" };
const isolation = { "cross-origin-opener-policy": "same-origin", "cross-origin-embedder-policy": "require-corp" };

async function relay(request, response, url) {
  const target = new URL(`https://${url.pathname.slice("/relay/".length)}${url.search}`);
  if (!relayed.has(target.host)) return response.writeHead(403).end();
  const headers = Object.fromEntries(Object.entries(request.headers).filter(([name]) =>
    !["host", "origin", "referer", "cookie", "connection", "content-length"].includes(name) && !name.startsWith("sec-")));
  const body = ["GET", "HEAD"].includes(request.method) ? undefined : request;
  const answer = await fetch(target, { method: request.method, headers, body, duplex: "half", redirect: "error" });
  response.writeHead(answer.status, { "content-type": answer.headers.get("content-type") ?? "application/octet-stream" });
  for await (const chunk of answer.body ?? []) response.write(chunk);
  response.end();
}

// The files under workspace/, by their paths in it, for the page to write into /workspace.
async function workspace() {
  const root = join(process.cwd(), "workspace");
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries.filter(entry => entry.isFile()).map(entry => relative(root, join(entry.parentPath, entry.name)).split("\\").join("/")).sort();
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  if (url.pathname.startsWith("/relay/")) {
    return relay(request, response, url).catch(() => response.headersSent ? response.destroy() : response.writeHead(502).end());
  }
  try {
    if (url.pathname === "/workspace.json") {
      return response.writeHead(200, { "content-type": "application/json", ...isolation }).end(JSON.stringify(await workspace()));
    }
    const path = join(process.cwd(), normalize(decodeURIComponent(url.pathname)));
    const body = await readFile(path.endsWith("/") ? join(path, "index.html") : path);
    response.writeHead(200, { "content-type": types[extname(path) || ".html"] ?? "application/octet-stream", ...isolation });
    response.end(body);
  } catch {
    response.writeHead(404).end();
  }
}).listen(Number(process.env.PORT ?? 8080), "127.0.0.1", () => console.log(`http://127.0.0.1:${server.address().port}/`));
