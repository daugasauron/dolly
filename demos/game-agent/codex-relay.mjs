#!/usr/bin/env node
// Local development inference service; never part of Dolly's browser host.
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { once } from "node:events";
import { createRelay, relayArguments, serveRelay } from "./local-relay.mjs";

const endpoint = "https://chatgpt.com/backend-api/codex/responses";
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
    contextWindow: model.context_window, maxTokens: 16384,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
}

export function createCodexRelay({ token, origins, credentials, models, fetch: upstreamFetch = fetch }) {
  return createRelay({ path: "/codex/responses", origins, models, capability: ["authorization", `Bearer ${token}`],
    allowHeader: name => [...forwardedHeaders, "authorization", "chatgpt-account-id"].includes(name),
    async forward({ request, response, body, bytes, signal, fail }) {
      if (body.stream !== true || body.store !== false) return fail(400, "Expected stream=true and store=false");
      const auth = await credentials();
      const headers = new Headers();
      for (const name of forwardedHeaders) if (request.headers[name]) headers.set(name, request.headers[name]);
      headers.set("authorization", `Bearer ${auth.access}`);
      headers.set("chatgpt-account-id", auth.accountId);
      const upstream = await upstreamFetch(endpoint, { method: "POST", headers, body: bytes, redirect: "error", signal });
      response.writeHead(upstream.status, { "content-type": upstream.headers.get("content-type") ?? "application/octet-stream" });
      response.flushHeaders();
      let received = 0;
      for await (const bytes of upstream.body ?? []) {
        received += bytes.byteLength;
        if (received > 64 * 1024 * 1024) throw Error("Response too large");
        if (!response.write(bytes)) await once(response, "drain", { signal });
      }
      response.end();
    } });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { port, origins } = relayArguments("codex-relay.mjs", 9002);
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
  await serveRelay({ server: createCodexRelay({ token, origins, credentials, models: models.map(model => model.slug) }),
    port, origins, provider: "codex-local", title: "Codex subscription relay",
    config: { api: "openai-codex-responses", apiKey: token, models: models.map(piModel) },
    notice: "Credentials are read-only; refresh an expired login using Codex." });
}
