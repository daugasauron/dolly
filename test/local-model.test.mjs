import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { DollyHttpPolicy } from "../src/http-policy.mjs";
import { LOCAL_MODELS, DEFAULT_LOCAL_MODEL, LOCAL_MODEL_ORIGIN, LOCAL_LIMITS, validateCompletion } from "../src/local-model-contract.mjs";
import { LocalModelService, localModelTransport } from "../src/local-model-service.mjs";
import { qwenRequest, qwenCompletions, qwenToolCalls } from "../src/qwen-completions.mjs";

const request = () => ({ model: DEFAULT_LOCAL_MODEL.id, stream: true, messages: [{ role: "user", content: "Hello" }] });
const tool = { type: "function", function: { name: "read", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } };
const url = new URL(`${LOCAL_MODEL_ORIGIN}/v1/chat/completions`);
const init = body => ({ method: "POST", body: new TextEncoder().encode(JSON.stringify(body)), signal: new AbortController().signal });

test("GPU preflight fails with setup guidance before any model download", async () => {
  const source = (await readFile(new URL("../src/webgpu-worker.mjs", import.meta.url), "utf8"))
    .replace(/^import .*;\n/gm, "")
    .replaceAll("import.meta.url", JSON.stringify(new URL("../src/webgpu-worker.mjs", import.meta.url).href));
  for (const adapter of [null, { info: { isFallbackAdapter: true } }, { features: new Set() }]) {
    let receive, downloads = 0;
    let respond;
    const response = new Promise(resolve => { respond = resolve; });
    runInNewContext(source, {
      LOCAL_MODELS, navigator: { gpu: { requestAdapter: async () => adapter } },
      fetch() { downloads++; throw new Error("Unexpected model asset request"); },
      addEventListener(_event, callback) { receive = callback; },
      postMessage(message) { if (message.id) respond(message); },
    });
    receive({ data: { id: 1, type: "load", modelId: DEFAULT_LOCAL_MODEL.id } });
    assert.match((await response).error, /GPU setup below/);
    assert.equal(downloads, 0);
  }
});

test("local capability and remote policy are independent; reserved addresses never reach Fetch", async () => {
  let fetched = 0;
  const remote = async () => { fetched++; return new Response("remote"); };
  const service = new LocalModelService();
  const allowed = localModelTransport(new DollyHttpPolicy({ rules: [] }), service, remote);
  const headers = new Headers({ authorization: "secret", "x-custom-key": "secret" });
  assert.equal(allowed.policy.authorize(url, "POST", headers, 10).timeoutMilliseconds, 600_000);
  assert.equal([...headers].length, 0);
  assert.throws(() => allowed.policy.authorize(new URL("https://example.com/"), "GET", headers, 0), /denied/);
  assert.equal((await allowed.fetchRequest(url, init(request()))).status, 409);
  const denied = localModelTransport(new DollyHttpPolicy(), undefined, remote);
  for (const address of [url.href, "https://wllama.dolly.invalid/v1/models", "http://webgpu.dolly.invalid/", "https://dolly.invalid/", "https://webgpu.dolly.invalid./"]) {
    assert.throws(() => denied.policy.authorize(new URL(address), "GET", new Headers(), 0), /denied/);
    assert.throws(() => denied.fetchRequest(address, { method: "GET" }), /denied/);
  }
  for (const suffix of ["?model=https://evil.test/", "#x", "/extra"]) {
    assert.throws(() => allowed.policy.authorize(new URL(url.href + suffix), "POST", new Headers(), 0), /denied/);
  }
  assert.equal(fetched, 0);
  await denied.fetchRequest("https://example.com/", { method: "GET" });
  assert.equal(fetched, 1);
});

test("request validation rejects unsupported capabilities and unreasonable work", () => {
  for (const change of [{ model: "https://evil.test/model" }, { max_tokens: 999999 }, { n: 2 },
    { extra_body: { model_lib: "evil" } }, { stream: false }, { tools: Array(33).fill(tool) },
    { messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: "evil" } }] }] }]) {
    assert.throws(() => validateCompletion({ ...request(), ...change }));
  }
  assert.equal(validateCompletion(request()).model, DEFAULT_LOCAL_MODEL.id);
  const parts = { ...request(), messages: [{ role: "user", content: [{ type: "text", text: "Hello" }] }] };
  assert.equal(validateCompletion(parts).messages[0].content, "Hello");
});

test("discovered models match pinned assets and weight sizes, without loading a worker", async () => {
  const service = new LocalModelService({ createWorker: () => { throw new Error("Unexpected model load"); } });
  const catalog = await (await service.fetch(new URL(`${LOCAL_MODEL_ORIGIN}/v1/models`))).json();
  const manifest = JSON.parse(await readFile(new URL("../config/webgpu-assets.json", import.meta.url)));
  assert.deepEqual(catalog.data.map(m => m.id), manifest.models.map(m => m.model));
  assert.equal(catalog.data[0].id, DEFAULT_LOCAL_MODEL.id);
  for (const model of catalog.data) {
    const pinned = manifest.models.find(m => m.model === model.id);
    assert.match(pinned.baseURL, /\/resolve\/[0-9a-f]{40}\/$/);
    assert.equal(model.download_bytes, pinned.assets.filter(a => !a.bundle).reduce((sum, a) => sum + a.bytes, 0));
    assert.equal(validateCompletion({ ...request(), model: model.id }).model, model.id);
    for (const asset of pinned.assets) {
      assert.match(asset.sha256, /^[0-9a-f]{64}$/);
      assert.ok(asset.bytes > 0);
      assert.ok(asset.url.startsWith(pinned.baseURL) || /binary-mlc-llm-libs\/[0-9a-f]{40}\//.test(asset.url));
      assert.equal(asset.bundle, !asset.file.endsWith(".bin"));
    }
  }
  assert.equal(service.state, "unloaded");
});

test("Qwen translates tool history and emits standard calls, without repairing invalid output", async () => {
  const input = { ...request(), tools: [tool], stream_options: { include_usage: true } };
  const envelope = '<tool_call>\n<function=read>\n<parameter=path>\n/tmp/a\n</parameter>\n</function>\n</tool_call>';
  const engine = {
    resetChat: async () => {},
    chat: { completions: { async *create() {
      yield { choices: [{ delta: { content: "<thi" }, finish_reason: null }] };
      yield { choices: [{ delta: { content: "nk>\n\n</think>\n\n" }, finish_reason: null }] };
      yield { choices: [{ delta: { content: envelope }, finish_reason: null }] };
      yield { choices: [{ delta: {}, finish_reason: "stop" }], usage: { completion_tokens: 25 } };
    } } },
  };
  const chunks = await Array.fromAsync(qwenCompletions(engine, input));
  const choice = chunks.find(c => c.choices?.[0]?.finish_reason)?.choices[0];
  assert.equal(choice.finish_reason, "tool_calls");
  assert.equal(choice.delta.tool_calls[0].function.arguments, '{"path":"/tmp/a"}');
  const call = choice.delta.tool_calls[0];
  const translated = qwenRequest({ ...input, messages: [...input.messages,
    { role: "assistant", content: null, tool_calls: [call] },
    { role: "tool", tool_call_id: call.id, content: "file contents" }] });
  assert.equal(translated.messages.at(-1).role, "user");
  assert.match(translated.messages.at(-1).content, /file contents/);
  assert.match(translated.messages[0].content, /<tools>[\s\S]*"read"[\s\S]*<\/tools>/);
  assert.equal(translated.messages.at(-2).content, envelope);
  assert.equal(translated.messages.at(-1).content, "<tool_response>\nfile contents\n</tool_response>");
  assert.equal(translated.response_format, undefined);
  engine.chat.completions.create = async function* () {
    yield { choices: [{ delta: { content: 'Let me look.\n' + envelope }, finish_reason: "stop" }] };
  };
  const prefaced = await Array.fromAsync(qwenCompletions(engine, input));
  const prefacedChoice = prefaced.find(c => c.choices?.[0]?.finish_reason).choices[0];
  assert.equal(prefacedChoice.finish_reason, "tool_calls");
  assert.equal(prefacedChoice.delta.content, "Let me look.");
  const history = qwenRequest({ ...input, messages: [...input.messages,
    { role: "assistant", ...prefacedChoice.delta }, { role: "tool", tool_call_id: prefacedChoice.delta.tool_calls[0].id, content: "file contents" }] });
  assert.ok(history.messages.at(-2).content.startsWith("Let me look.\n<tool_call>"));
  engine.chat.completions.create = async function* () {
    yield { choices: [{ delta: { content: 'Let me look.\n<tool_call>\n<function=read>\n<parameter=path>' }, finish_reason: "length" }] };
  };
  await assert.rejects(async () => Array.fromAsync(qwenCompletions(engine, input)), /length/);
  engine.chat.completions.create = async function* () { yield { choices: [{ delta: { content: "<tool_call>unfinished" }, finish_reason: "length" }] }; };
  await assert.rejects(async () => Array.fromAsync(qwenCompletions(engine, input)), /length/);
  engine.chat.completions.create = async function* () { yield { choices: [{ delta: { content: "<tool_call>unfinished" } }] }; };
  await assert.rejects(async () => Array.fromAsync(qwenCompletions(engine, input)), /finish reason/);
});

test("Qwen native parameters preserve shell/code strings and reject incomplete or ambiguous calls", () => {
  const parameters = { type: "object", properties: {
    command: { type: "string" }, limit: { type: "integer" }, options: { type: "object" },
  }, required: ["command"], additionalProperties: false };
  const tools = [{ type: "function", function: { name: "bash", parameters } }];
  const args = { command: '\uFEFF  printf \'%s\\n\' "$value"\n# 日本語\n  ', limit: 7, options: { quiet: true } };
  const source = qwenRequest({ ...request(), tools, messages: [
    ...request().messages, { role: "assistant", tool_calls: [{ function: { name: "bash", arguments: JSON.stringify(args) } }] },
  ] }).messages.at(-1).content;
  const calls = qwenToolCalls(source + "\n" + source, tools);
  assert.equal(calls.length, 2);
  assert.notEqual(calls[0].id, calls[1].id);
  assert.deepEqual(JSON.parse(calls[0].function.arguments), args);
  for (const malformed of [
    source.slice(0, -1), source + "extra", source.replace("<function=bash>", "<function=unknown>"),
    source.replace("<parameter=command>", "<parameter=surprise>"),
    source.replace("<parameter=limit>", "<parameter=command>"),
    "<tool_call><function=bash></function></tool_call>",
    '<tool_call>{"name":"bash","arguments":{"command":"echo wrong format"}}</tool_call>',
  ]) assert.throws(() => qwenToolCalls(malformed, tools));
});

class FakeWorker extends EventTarget {
  constructor({ stuck = false, chunks = 1 } = {}) { super(); this.stuck = stuck; this.chunks = chunks; this.commands = []; this.pulls = 0; }
  postMessage(message) {
    this.commands.push(message.type);
    if (this.stuck && ["next", "cancel"].includes(message.type)) return;
    let value;
    if (message.type === "load") { this.modelId = message.modelId; value = { contextWindow: 16384 }; }
    if (message.type === "next") value = this.pulls++ < this.chunks
      ? { value: { choices: [{ index: 0, delta: { content: "hello" }, finish_reason: this.pulls === this.chunks ? "stop" : null }] }, done: false }
      : { done: true };
    queueMicrotask(() => this.dispatchEvent(new MessageEvent("message", { data: { id: message.id, value } })));
  }
  terminate() { this.terminated = true; }
}

test("only explicit idle loads switch models; guest requests cannot download or run a different size", async () => {
  const workers = [];
  const service = new LocalModelService({ createWorker: () => {
    assert.ok(workers.every(worker => worker.terminated));
    const worker = new FakeWorker(); workers.push(worker); return worker;
  } });
  await service.load();
  await service.load();
  await assert.rejects(service.load("https://evil.test/model"), /Unknown model/);
  assert.equal(workers.length, 1);
  const other = LOCAL_MODELS[1];
  const unavailable = await service.fetch(url, init({ ...request(), model: other.id }));
  assert.equal(unavailable.status, 409);
  assert.ok((await unavailable.json()).error.message.includes(other.id));
  assert.equal(workers[0].commands.includes("start"), false);
  await service.load(other.id);
  assert.equal(workers.length, 2);
  assert.equal(workers[1].modelId, other.id);
  assert.equal(service.model.id, other.id);
  const response = await service.fetch(url, init({ ...request(), model: other.id }));
  await assert.rejects(service.load(DEFAULT_LOCAL_MODEL.id), /busy/);
  assert.match(await response.text(), new RegExp(other.id.replaceAll(".", "\\.")));
  assert.equal(service.state, "ready");
  assert.ok(service.detail.includes(other.name));
  service.dispose();
  assert.equal(service.model, undefined);
});

test("streaming is demand driven, keeps the logical URL, and excludes overlapping generations", async () => {
  const worker = new FakeWorker();
  const service = new LocalModelService({ createWorker: () => worker });
  await service.load();
  const response = await service.fetch(url, init(request()));
  assert.equal(response.url, url.href);
  assert.equal(worker.pulls, 0);
  assert.equal((await service.fetch(url, init(request()))).status, 409);
  const reader = response.body.getReader();
  const first = await reader.read();
  assert.match(new TextDecoder().decode(first.value), /hello/);
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(worker.pulls, 1);
  assert.match(new TextDecoder().decode((await reader.read()).value), /\[DONE\]/);
  assert.equal((await reader.read()).done, true);
  assert.equal(service.state, "ready");
  service.dispose();
});

test("abort forcibly settles an unresponsive worker, releases the lease, and permits reload", async () => {
  let worker = new FakeWorker({ stuck: true });
  const service = new LocalModelService({ createWorker: () => worker, cancelGrace: 15 });
  await service.load();
  const controller = new AbortController();
  const response = await service.fetch(url, { ...init(request()), signal: controller.signal });
  const reading = response.body.getReader().read();
  const rejected = assert.rejects(reading, /stopped|abort/i);
  await new Promise(resolve => setTimeout(resolve, 1));
  controller.abort();
  await rejected;
  await service.stop();
  assert.equal(worker.terminated, true);
  assert.equal(service.pending.size, 0);
  assert.equal(service.active, undefined);
  worker = new FakeWorker();
  await service.load();
  assert.match(await (await service.fetch(url, init(request()))).text(), /hello/);
  service.dispose();
});

test("failed GPU cleanup unloads the worker instead of advertising a ready model", async () => {
  const worker = new FakeWorker();
  const post = worker.postMessage.bind(worker);
  worker.postMessage = message => message.type === "cancel"
    ? queueMicrotask(() => worker.dispatchEvent(new MessageEvent("message", {
      data: { id: message.id, error: "Local GPU model was lost; load it again." },
    }))) : post(message);
  const service = new LocalModelService({ createWorker: () => worker });
  await service.load();
  const response = await service.fetch(url, init(request()));
  const reader = response.body.getReader();
  await reader.read();
  await service.stop();
  await assert.rejects(reader.read(), /stopped/);
  assert.equal(service.state, "error");
  assert.match(service.detail, /GPU model was lost/);
  assert.equal(worker.terminated, true);
  assert.equal(service.pending.size, 0);
  assert.equal(service.active, undefined);
  assert.equal((await service.fetch(url, init(request()))).status, 409);
});

test("cancellation before stream demand leaves the idle model usable", async () => {
  const worker = new FakeWorker();
  const service = new LocalModelService({ createWorker: () => worker });
  await service.load();
  const response = await service.fetch(url, init(request()));
  await service.stop();
  await assert.rejects(response.text(), /stopped/);
  assert.deepEqual(worker.commands, ["load"]);
  assert.equal(service.state, "ready");
  assert.match(await (await service.fetch(url, init(request()))).text(), /hello/);
  service.dispose();
});

test("local inference permits slow progress beyond two minutes and reports a stalled engine through SSE", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let worker = new FakeWorker({ chunks: 3 });
  const service = new LocalModelService({ createWorker: () => worker });
  await service.load();
  const response = await service.fetch(url, init(request()));
  const reader = response.body.getReader();
  for (let chunk = 0; chunk < 3; chunk++) {
    assert.match(new TextDecoder().decode((await reader.read()).value), /hello/);
    t.mock.timers.tick(LOCAL_LIMITS.idleTimeoutMilliseconds - 1);
    assert.equal(service.state, "generating");
  }
  assert.match(new TextDecoder().decode((await reader.read()).value), /\[DONE\]/);
  assert.equal(service.state, "ready");
  service.dispose();
  worker = new FakeWorker({ stuck: true });
  await service.load();
  const stalled = await service.fetch(url, init(request()));
  const reading = stalled.body.getReader().read();
  await Promise.resolve();
  t.mock.timers.tick(LOCAL_LIMITS.idleTimeoutMilliseconds);
  const error = new TextDecoder().decode((await reading).value);
  assert.match(error, /Local model made no progress/);
  assert.doesNotMatch(error, /\[DONE\]/);
  t.mock.timers.tick(2000);
  await service.stop();
  assert.equal(worker.terminated, true);
  assert.equal(service.pending.size, 0);
});
