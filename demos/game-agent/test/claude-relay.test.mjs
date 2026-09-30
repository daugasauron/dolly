import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, request as httpRequest } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import { streamSimple } from "@earendil-works/pi-ai/api/anthropic-messages";
import { createClaudeRelay, piModel } from "../claude-relay.mjs";

const levels = ["low", "medium", "high", "xhigh", "max"];
const opus = { id: "claude-opus-5-5", display_name: "Claude Opus 5.5", max_input_tokens: 1000000, max_tokens: 128000,
  capabilities: { thinking: { types: { adaptive: { supported: true } } },
    effort: Object.fromEntries(levels.map(level => [level, { supported: true }])) } };
const events = [
  ["message_start", { message: { id: "msg_fixture", type: "message", role: "assistant", model: "claude-opus-5-5", content: [],
    stop_reason: null, usage: { input_tokens: 5, output_tokens: 0 } } }],
  ["content_block_start", { index: 0, content_block: { type: "text", text: "" } }],
  ["ping", {}],
  ["content_block_delta", { index: 0, delta: { type: "text_delta", text: "OK" } }],
  ["content_block_stop", { index: 0 }],
  ["message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 1 } }],
  ["message_stop", {}],
];
const sse = (response, [type, data]) => response.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);

async function fakeAnthropic(t, reply) {
  const calls = [];
  const server = createServer(async (request, response) => {
    let text = "";
    for await (const chunk of request) text += chunk;
    const call = { url: request.url, headers: request.headers, body: text && JSON.parse(text), closed: once(response, "close") };
    calls.push(call); reply(call, response);
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => { server.closeAllConnections(); server.close(); });
  return { calls, url: `http://127.0.0.1:${server.address().port}` };
}

async function relay(t, client) {
  const token = "relay-capability-fixture", origin = "http://localhost:9001";
  const server = createClaudeRelay({ token, origins: [origin], models: ["claude-opus-5-5"], client });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}`;
  const headers = { origin, "x-api-key": token, "content-type": "application/json" };
  const post = (extra = {}, body = { model: "claude-opus-5-5", max_tokens: 64, messages: [{ role: "user", content: "Hi" }] }) =>
    fetch(`${url}/v1/messages`, { method: "POST", body: JSON.stringify(body), ...extra, headers: { ...headers, ...extra.headers } });
  return { token, origin, url, post };
}

test("relay model metadata exposes only the efforts adaptive Claude models accept", () => {
  const model = piModel(opus);
  assert.deepEqual(getSupportedThinkingLevels(model), levels, "adaptive models cannot disable thinking");
  assert.equal(model.compat.forceAdaptiveThinking, true);
  assert.deepEqual([model.contextWindow, model.maxTokens, model.input], [1000000, 64000, ["text", "image"]]);
  const budget = piModel({ ...opus, id: "claude-haiku-4-5-20251001", capabilities: { thinking: { types: { adaptive: { supported: false } } } } });
  assert.deepEqual(getSupportedThinkingLevels(budget), ["off", "minimal", "low", "medium", "high"]);
  assert.equal(budget.compat, undefined);
});

test("relay admits one local capability and origin and streams Claude events in order", async t => {
  let release;
  const upstream = await fakeAnthropic(t, (_call, response) => {
    response.writeHead(200, { "content-type": "text/event-stream" });
    sse(response, events[0]);
    release = () => { for (const event of events.slice(1)) sse(response, event); response.end(); };
  });
  const { token, origin, url, post } = await relay(t, new Anthropic({ baseURL: upstream.url, apiKey: "upstream-private-key" }));
  assert.equal((await post({ headers: { origin: "https://untrusted.example" } })).status, 403);
  assert.equal((await post({ headers: { "x-api-key": "" } })).status, 401);
  assert.equal((await post({ headers: { "x-api-key": token.replace("relay", "guess") } })).status, 401);
  assert.equal((await fetch(`${url}/v1/models`, { method: "POST", headers: { origin, "x-api-key": token } })).status, 404);
  assert.equal((await post({}, { model: "claude-unadvertised", messages: [] })).status, 400);
  assert.equal((await post({ body: "not JSON" })).status, 400);
  const badHost = await new Promise((resolve, reject) => {
    const request = httpRequest(`${url}/v1/messages`, { method: "POST", headers: { origin, "x-api-key": token, host: "attacker.example" } },
      response => { response.resume(); resolve(response.statusCode); });
    request.on("error", reject); request.end("{}");
  });
  assert.equal(badHost, 403);
  assert.equal(upstream.calls.length, 0, "rejected requests must never reach Claude");
  const preflight = headers => fetch(`${url}/v1/messages`, { method: "OPTIONS", headers: { origin,
    "access-control-request-method": "POST", "access-control-request-headers": headers } });
  const allowed = await preflight("x-api-key,anthropic-version,anthropic-beta,content-type,x-stainless-os,x-stainless-retry-count");
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get("access-control-allow-origin"), origin);
  assert.equal((await preflight("cookie")).status, 403);

  const body = { model: "claude-opus-5-5", max_tokens: 64, messages: [{ role: "user", content: "Hi" }], stream: true,
    thinking: { type: "adaptive", display: "summarized" }, output_config: { effort: "xhigh" } };
  const response = await post({ headers: { "anthropic-beta": "fixture-beta-2026-01-01", cookie: "ambient=secret" } }, body);
  assert.equal(response.status, 200);
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let text = "";
  while (!text.includes("\n\n")) text += decoder.decode((await reader.read()).value);
  assert.match(text, /^event: message_start\n/, "the first event arrives before Claude finishes");
  release();
  for (let chunk; !(chunk = await reader.read()).done;) text += decoder.decode(chunk.value);
  assert.deepEqual([...text.matchAll(/^event: (.+)$/gm)].map(match => match[1]), events.map(([type]) => type).filter(type => type !== "ping"));
  const [call] = upstream.calls;
  assert.equal(call.url, "/v1/messages");
  assert.deepEqual(call.body, body, "Pi's thinking and effort fields reach Claude unchanged");
  assert.equal(call.headers["x-api-key"], "upstream-private-key");
  assert.equal(call.headers["anthropic-beta"], "fixture-beta-2026-01-01");
  assert.equal(call.headers.cookie, undefined);
});

test("relay maps Claude errors to their status, follows no redirect and cancels Claude when the client leaves", async t => {
  const replies = [
    (call, response) => { response.writeHead(307, { location: `http://${call.headers.host}/v1/messages?redirected` }); response.end(); },
    (_call, response) => {
      response.writeHead(429, { "content-type": "application/json", "retry-after": "7" });
      response.end(JSON.stringify({ type: "error", error: { type: "rate_limit_error", message: "Rate limited" } }));
    },
    (_call, response) => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      sse(response, events[0]); sse(response, ["error", { error: { type: "overloaded_error", message: "Overloaded" } }]); response.end();
    },
    (_call, response) => { response.writeHead(200, { "content-type": "text/event-stream" }); sse(response, events[0]); },
  ];
  const upstream = await fakeAnthropic(t, (call, response) => replies.shift()(call, response));
  const { post } = await relay(t, new Anthropic({ baseURL: upstream.url, apiKey: "upstream-private-key" }));
  assert.equal((await post()).status, 502);
  const limited = await post();
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "7");
  assert.equal(limited.headers.get("access-control-expose-headers"), "retry-after", "Pi's browser fetch can honor the delay");
  assert.doesNotMatch(await limited.text(), /upstream-private-key/);
  const overloaded = await (await post()).text();
  assert.match(overloaded, /event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}\n\n$/);
  const cancelled = (await post()).body.getReader();
  await cancelled.read(); await cancelled.cancel();
  await upstream.calls[3].closed;
  assert.equal(upstream.calls.length, 4, "Claude requests are never redirected or retried by the relay");
});

test("Pi's Anthropic client reaches Claude through the relay with its selected effort", async t => {
  const upstream = await fakeAnthropic(t, (_call, response) => {
    response.writeHead(200, { "content-type": "text/event-stream" });
    for (const event of events) sse(response, event);
    response.end();
  });
  const { token, url } = await relay(t, new Anthropic({ baseURL: upstream.url, apiKey: "upstream-private-key" }));
  const model = { ...piModel(opus), api: "anthropic-messages", provider: "claude-local", baseUrl: url };
  const stream = streamSimple(model, { messages: [{ role: "user", content: "Reply OK", timestamp: Date.now() }] },
    { apiKey: token, reasoning: "xhigh", maxTokens: 4096 });
  const result = await stream.result();
  assert.equal(result.stopReason, "stop", result.errorMessage);
  assert.equal(result.content.find(block => block.type === "text").text, "OK");
  const { body } = upstream.calls[0];
  assert.deepEqual([body.thinking, body.output_config, body.max_tokens], [{ type: "adaptive", display: "summarized" }, { effort: "xhigh" }, 4096]);
});

test("the private key file is read only when it is private and never echoed", async t => {
  const directory = await mkdtemp(resolve(tmpdir(), "dolly-claude-relay-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const key = "sk-ant-private-test-credential";
  const upstream = await fakeAnthropic(t, (_call, response) => {
    response.writeHead(401, { "content-type": "application/json" });
    response.end(JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }));
  });
  await mkdir(resolve(directory, ".config/dolly"), { recursive: true });
  const start = async (contents, mode) => {
    await writeFile(resolve(directory, ".config/dolly/claude-relay.env"), contents, { mode });
    const { ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, ...env } = process.env;
    const error = await promisify(execFile)(process.execPath, [fileURLToPath(new URL("../claude-relay.mjs", import.meta.url))],
      { env: { ...env, HOME: directory, ANTHROPIC_BASE_URL: upstream.url } }).then(() => assert.fail("relay started"), error => error);
    assert.ok(!error.stderr.includes(key) && !error.stdout.includes(key));
    return error.stderr;
  };
  assert.match(await start(key, 0o644), /chmod 600/);
  assert.equal(upstream.calls.length, 0, "a readable key file is never used");
  await rm(resolve(directory, ".config/dolly/claude-relay.env"));
  assert.match(await start(`${key}\n`, 0o600), /rejected.*401/);
  await rm(resolve(directory, ".config/dolly/claude-relay.env"));
  assert.match(await start(`ANTHROPIC_API_KEY=${key}\n`, 0o600), /rejected.*401/);
  assert.deepEqual(upstream.calls.map(call => [call.url.split("?")[0], call.headers["x-api-key"]]), [["/v1/models", key], ["/v1/models", key]]);
});
