import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { request as httpRequest } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { zstdCompressSync } from "node:zlib";
import { getSupportedThinkingLevels, clampThinkingLevel } from "@earendil-works/pi-ai";
import { createCodexRelay, relayToken, piModel } from "../scripts/codex-relay.mjs";

test("malformed local credentials never appear in relay startup errors", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "dolly-relay-auth-test-"));
  try {
    const secret = "private-test-credential";
    await writeFile(resolve(directory, "auth.json"), `{${secret}`, { mode: 0o600 });
    await assert.rejects(promisify(execFile)(process.execPath, ["scripts/codex-relay.mjs"],
      { env: { ...process.env, CODEX_HOME: directory } }), error => {
        assert.match(error.stderr, /run codex login/);
        assert.ok(!error.stderr.includes(secret) && !error.stdout.includes(secret));
        return true;
      });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("relay model metadata preserves supported reasoning levels instead of silently clamping", () => {
  const levels = ["low", "medium", "high", "xhigh", "max"];
  const model = piModel({ slug: "astra-test", context_window: 272000,
    supported_reasoning_levels: levels.map(effort => ({ effort })) });
  assert.deepEqual(getSupportedThinkingLevels(model), levels);
  for (const level of levels) assert.equal(clampThinkingLevel(model, level), level);
  assert.equal(model.contextWindow, 65536);
  assert.equal(model.thinkingLevelMap.minimal, null, "do not advertise an unsupported effort");
});

test("subscription relay has one authenticated inference destination and streams unchanged bytes", async t => {
  const token = relayToken(), origin = "http://localhost:9001";
  const calls = [];
  let release;
  const server = createCodexRelay({ token, origins: [origin], models: ["astra-test"],
    credentials: async () => ({ access: "upstream-private-token", accountId: "upstream-account" }),
    fetch: async (url, request) => {
      calls.push({ url, request });
      return new Response(new ReadableStream({ start(controller) {
        request.signal.addEventListener("abort", () => controller.error(Error("aborted")), { once: true });
        controller.enqueue(new TextEncoder().encode("data: first\n\n"));
        release = () => { controller.enqueue(new TextEncoder().encode("data: last\n\n")); controller.close(); };
      } }), { headers: { "content-type": "text/event-stream" } });
    } });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}/codex/responses`;
  const headers = { origin, authorization: `Bearer ${token}`, "content-type": "application/json" };
  const body = JSON.stringify({ model: "astra-test", stream: true, store: false, input: [] });
  const request = (path = url, extra = {}) => fetch(path, { method: "POST", body, headers, ...extra });
  assert.equal((await request(url, { headers: { ...headers, origin: "https://untrusted.example" } })).status, 403);
  assert.equal((await request(url, { headers: { origin } })).status, 401);
  assert.equal((await request(url + "?target=https://example.com")).status, 404);
  assert.equal((await request(url.replace("/codex/responses", "/auth.json"))).status, 404);
  assert.equal((await request(url, { body: '{"model":"unavailable"}' })).status, 400);
  assert.equal((await request(url, { body: "not JSON" })).status, 400);
  const badHost = await new Promise((resolve, reject) => {
    const request = httpRequest(url, { method: "POST", headers: { ...headers, host: "attacker.example" } }, response => {
      response.resume(); resolve(response.statusCode);
    });
    request.on("error", reject); request.end(body);
  });
  assert.equal(badHost, 403);
  assert.equal(calls.length, 0, "rejected requests must never reach the provider");
  const preflight = await fetch(url, { method: "OPTIONS", headers: { origin,
    "access-control-request-method": "POST", "access-control-request-headers": "authorization,content-type,chatgpt-account-id" } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), origin);
  assert.equal((await fetch(url, { method: "OPTIONS", headers: { origin,
    "access-control-request-method": "POST", "access-control-request-headers": "cookie" } })).status, 403);
  const response = await request(url, { headers: { ...headers, "chatgpt-account-id": "forged-account", cookie: "ambient=secret" } });
  assert.equal(response.status, 200);
  const reader = response.body.getReader();
  assert.equal(new TextDecoder().decode((await reader.read()).value), "data: first\n\n", "first event arrives before completion");
  release();
  assert.equal(new TextDecoder().decode((await reader.read()).value), "data: last\n\n");
  assert.equal((await reader.read()).done, true);
  assert.equal(calls[0].url, "https://chatgpt.com/backend-api/codex/responses");
  assert.equal(calls[0].request.redirect, "error");
  assert.equal(calls[0].request.headers.get("authorization"), "Bearer upstream-private-token");
  assert.equal(calls[0].request.headers.get("chatgpt-account-id"), "upstream-account");
  assert.equal(calls[0].request.headers.get("cookie"), null);
  assert.equal(calls[0].request.body.toString(), body);
  const compressed = zstdCompressSync(body);
  const compressedResponse = await request(url, { body: compressed, headers: { ...headers, "content-encoding": "zstd" } });
  release(); await compressedResponse.text();
  assert.deepEqual(calls[1].request.body, compressed, "native Pi compression must survive the relay unchanged");
  const cancelled = await request();
  const aborted = once(calls[2].request.signal, "abort");
  await cancelled.body.cancel(); await aborted;
  assert.equal(calls[2].request.signal.aborted, true, "client cancellation must cancel upstream inference");
});
