#!/usr/bin/env node
// Local development inference service; never part of Dolly's browser host.
import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { once } from "node:events";
import { zstdDecompressSync } from "node:zlib";

const endpoint = "https://chatgpt.com/backend-api/codex/responses";
const limit = 8 * 1024 * 1024;
const forwardedHeaders = ["accept", "content-type", "content-encoding", "openai-beta", "originator", "session-id", "x-client-request-id"];

export function relayToken() {
  // Pi's Codex transport expects an account claim. This is a relay capability,
  // not an OpenAI credential; only the relay knows the actual account.
  return [Buffer.from('{"typ":"DollyRelay"}').toString("base64url"),
    Buffer.from(JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "local-relay" } })).toString("base64url"),
    randomBytes(32).toString("base64url")].join(".");
}

export function piModel(model) {
  const levels = model.supported_reasoning_levels?.map(level => level.effort) ?? [];
  return { id: model.slug, name: model.slug, input: ["text", "image"], reasoning: levels.length > 0,
    thinkingLevelMap: Object.fromEntries(["off", "minimal", "low", "medium", "high", "xhigh", "max"]
      .map(level => [level, levels.includes(level) ? level : null])),
    contextWindow: Math.min(model.context_window, 65536), maxTokens: 16384,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
}

export function createCodexRelay({ token, origins, credentials, models, fetch: upstreamFetch = fetch }) {
  const authorization = Buffer.from(`Bearer ${token}`);
  const active = new Set();
  const server = createServer(async (request, response) => {
    const fail = (status, message) => { response.writeHead(status, { "content-type": "text/plain" }); response.end(message); };
    const port = server.address().port;
    if (![ `127.0.0.1:${port}`, `localhost:${port}` ].includes(request.headers.host)) return fail(403, "Invalid relay host");
    if (request.url !== "/codex/responses") return fail(404, "Inference endpoint only");
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
      if (headers.some(name => ![...forwardedHeaders, "authorization", "chatgpt-account-id"].includes(name))) return fail(403, "Header not allowed");
      response.writeHead(204, { "access-control-allow-methods": "POST", "access-control-allow-headers": headers.join(","),
        "access-control-allow-private-network": "true" });
      return response.end();
    }
    if (request.method !== "POST") return fail(405, "POST only");
    const supplied = Buffer.from(request.headers.authorization ?? "");
    if (supplied.length !== authorization.length || !timingSafeEqual(supplied, authorization)) return fail(401, "Relay token required");
    if (Number(request.headers["content-length"]) > limit) return fail(413, "Request too large");
    if (active.size >= 2) return fail(429, "Both relay slots are busy");
    const controller = new AbortController();
    active.add(controller);
    const timeout = setTimeout(() => controller.abort(), 120000);
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
      if (!body || !models.includes(body.model) || body.stream !== true || body.store !== false) return fail(400, "Expected a configured model, stream=true and store=false");
      const auth = await credentials();
      const headers = new Headers();
      for (const name of forwardedHeaders) if (request.headers[name]) headers.set(name, request.headers[name]);
      headers.set("authorization", `Bearer ${auth.access}`);
      headers.set("chatgpt-account-id", auth.accountId);
      const upstream = await upstreamFetch(endpoint, { method: "POST", headers, body: bytes,
        redirect: "error", signal: controller.signal });
      response.writeHead(upstream.status, { "content-type": upstream.headers.get("content-type") ?? "application/octet-stream" });
      response.flushHeaders();
      let received = 0;
      for await (const bytes of upstream.body ?? []) {
        received += bytes.byteLength;
        if (received > 64 * 1024 * 1024) throw Error("Response too large");
        if (!response.write(bytes)) await once(response, "drain", { signal: controller.signal });
      }
      response.end();
    } catch {
      // Neither upstream headers/bodies nor local credentials belong in logs.
      if (!response.headersSent) fail(502, "Codex relay failed; check local login and connectivity");
      else response.destroy();
    } finally { clearTimeout(timeout); active.delete(controller); }
  });
  server.on("close", () => { for (const controller of active) controller.abort(); });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [portText = "9002", ...suppliedOrigins] = process.argv.slice(2);
  const port = Number(portText), origins = suppliedOrigins.length ? suppliedOrigins : ["http://localhost:9001"];
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || origins.some(origin => {
    const url = new URL(origin); return url.origin !== origin || url.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(url.hostname);
  })) throw Error("usage: codex-relay.mjs PORT [exact local HTTP origins...]");
  const codexDirectory = process.env.CODEX_HOME || resolve(homedir(), ".codex");
  async function credentials() {
    const auth = JSON.parse(await readFile(resolve(codexDirectory, "auth.json"), "utf8"));
    const claims = JSON.parse(Buffer.from(auth.tokens?.access_token?.split(".")[1] ?? "", "base64url"));
    if (auth.auth_mode !== "chatgpt" || !auth.tokens?.account_id || claims.exp * 1000 <= Date.now() + 5000)
      throw Error("A current subscription login is required: run codex login");
    return { access: auth.tokens.access_token, accountId: auth.tokens.account_id };
  }
  await credentials().catch(() => { throw Error("A current subscription login is required: run codex login"); });
  const catalog = JSON.parse(await readFile(resolve(codexDirectory, "models_cache.json"), "utf8"));
  const models = catalog.models.filter(model => model.input_modalities?.includes("image"));
  if (!models.length) throw Error("No vision models in the local Codex catalog; refresh it with Codex first");
  const token = relayToken();
  const server = createCodexRelay({ token, origins, credentials, models: models.map(model => model.slug) });
  const directory = await mkdtemp(resolve(tmpdir(), "dolly-codex-relay-"));
  async function close() {
    server.close(); server.closeAllConnections();
    await rm(directory, { recursive: true, force: true });
  }
  process.once("SIGINT", close); process.once("SIGTERM", close);
  try {
    server.listen(port, "127.0.0.1"); await once(server, "listening");
    const config = { providers: { "codex-local": { api: "openai-codex-responses", baseUrl: `http://127.0.0.1:${port}`, apiKey: token,
      models: models.map(piModel) } } };
    await writeFile(resolve(directory, "models.json"), JSON.stringify(config), { mode: 0o600 });
    console.log(`Codex subscription relay: http://127.0.0.1:${port}\nPi models configuration (private): ${directory}/models.json\nAllowed origins: ${origins.join(", ")}\nCredentials are read-only; refresh an expired login using Codex. Ctrl-C removes relay configuration.`);
  } catch (error) { await close(); throw error; }
}
