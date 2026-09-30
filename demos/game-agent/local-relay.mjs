// Shared shape of the local inference relays; never part of Dolly's browser host.
import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { once } from "node:events";
import { zstdDecompressSync } from "node:zlib";

const limit = 8 * 1024 * 1024;

// One inference path behind an exact loopback Host, exact Origins and a relay-only capability.
export function createRelay({ path, origins, models, capability: [header, token], allowHeader, forward }) {
  const expected = Buffer.from(token);
  const active = new Set();
  const server = createServer(async (request, response) => {
    const fail = (status, message) => { response.writeHead(status, { "content-type": "text/plain" }); response.end(message); };
    const port = server.address().port;
    if (![ `127.0.0.1:${port}`, `localhost:${port}` ].includes(request.headers.host)) return fail(403, "Invalid relay host");
    if (request.url !== path) return fail(404, "Inference endpoint only");
    const origin = request.headers.origin;
    if (origin && !origins.includes(origin)) return fail(403, "Origin not allowed");
    if (origin) {
      response.setHeader("access-control-allow-origin", origin);
      response.setHeader("vary", "Origin");
    }
    response.setHeader("cache-control", "no-store");
    if (request.method === "OPTIONS") {
      if (request.headers["access-control-request-method"] !== "POST") return fail(405, "POST only");
      const headers = String(request.headers["access-control-request-headers"] ?? "").toLowerCase().split(",").map(x => x.trim()).filter(Boolean);
      if (headers.some(name => !allowHeader(name))) return fail(403, "Header not allowed");
      response.writeHead(204, { "access-control-allow-methods": "POST", "access-control-allow-headers": headers.join(","),
        "access-control-allow-private-network": "true" });
      return response.end();
    }
    if (request.method !== "POST") return fail(405, "POST only");
    const supplied = Buffer.from(request.headers[header] ?? "");
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return fail(401, "Relay token required");
    if (Number(request.headers["content-length"]) > limit) return fail(413, "Request too large");
    const controller = new AbortController();
    active.add(controller);
    const timeout = setTimeout(() => controller.abort(), 600000);
    controller.signal.addEventListener("abort", () => { request.destroy(); response.destroy(); }, { once: true });
    request.on("aborted", () => controller.abort());
    response.on("close", () => controller.abort());
    try {
      const parts = []; let length = 0;
      for await (const part of request) {
        length += part.length;
        if (length > limit) return fail(413, "Request too large");
        parts.push(part);
      }
      const bytes = Buffer.concat(parts), encoding = request.headers["content-encoding"];
      if (encoding && encoding !== "zstd") return fail(415, "Unsupported request encoding");
      let body;
      try { body = JSON.parse(encoding ? zstdDecompressSync(bytes, { maxOutputLength: limit }) : bytes); }
      catch { return fail(400, "Invalid JSON"); }
      if (!body || !models.includes(body.model)) return fail(400, "Expected a configured model");
      await forward({ request, response, body, bytes, signal: controller.signal, fail });
    } catch {
      // Neither upstream headers/bodies nor local credentials belong in logs.
      if (!response.headersSent) fail(502, "Relay failed; check local credentials and connectivity");
      else response.destroy();
    } finally { clearTimeout(timeout); active.delete(controller); }
  });
  server.on("close", () => { for (const controller of active) controller.abort(); });
  return server;
}

export function relayArguments(script, defaultPort) {
  const [portText = String(defaultPort), ...suppliedOrigins] = process.argv.slice(2);
  const port = Number(portText), origins = suppliedOrigins.length ? suppliedOrigins : ["http://localhost:9001"];
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || origins.some(origin => {
    const url = new URL(origin); return url.origin !== origin || url.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(url.hostname);
  })) throw Error(`usage: ${script} PORT [exact local HTTP origins...]`);
  return { port, origins };
}

// Listen on loopback and publish a private Pi models.json that Ctrl-C removes.
export async function serveRelay({ server, port, origins, provider, config, title, notice }) {
  const directory = await mkdtemp(resolve(tmpdir(), `dolly-${provider}-relay-`));
  async function close() {
    server.close(); server.closeAllConnections();
    await rm(directory, { recursive: true, force: true });
  }
  process.once("SIGINT", close); process.once("SIGTERM", close);
  try {
    server.listen(port, "127.0.0.1"); await once(server, "listening");
    const models = { providers: { [provider]: { ...config, baseUrl: `http://127.0.0.1:${port}` } } };
    await writeFile(resolve(directory, "models.json"), JSON.stringify(models), { mode: 0o600 });
    console.log(`${title}: http://127.0.0.1:${port}\nPi models configuration (private): ${directory}/models.json\nAllowed origins: ${origins.join(", ")}\n${notice} Ctrl-C removes relay configuration.`);
  } catch (error) { await close(); throw error; }
}
