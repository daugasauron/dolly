import assert from "node:assert/strict";
import test from "node:test";
import { DollyHttpPolicy } from "../src/http-policy.mjs";
import { LOCAL_MODEL, LOCAL_MODEL_ORIGIN, validateCompletion } from "../src/local-model-contract.mjs";
import { LocalModelService, localModelTransport } from "../src/local-model-service.mjs";
import { qwenRequest, qwenCompletions } from "../src/qwen-completions.mjs";

const request = () => ({ model: LOCAL_MODEL.id, stream: true, messages: [{ role: "user", content: "Hello" }] });
const tool = { type: "function", function: { name: "read", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } };
const url = new URL(`${LOCAL_MODEL_ORIGIN}/v1/chat/completions`);
const init = body => ({ method: "POST", body: new TextEncoder().encode(JSON.stringify(body)), signal: new AbortController().signal });

test("local capability and remote policy are independent; reserved addresses never reach Fetch", async () => {
  let fetched = 0;
  const remote = async () => { fetched++; return new Response("remote"); };
  const service = new LocalModelService();
  const allowed = localModelTransport(new DollyHttpPolicy({ rules: [] }), service, remote);
  const headers = new Headers({ authorization: "secret", "x-custom-key": "secret" });
  allowed.policy.authorize(url, "POST", headers, 10);
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
  assert.equal(validateCompletion(request()).model, LOCAL_MODEL.id);
  const parts = { ...request(), messages: [{ role: "user", content: [{ type: "text", text: "Hello" }] }] };
  assert.equal(validateCompletion(parts).messages[0].content, "Hello");
});

test("Qwen translates tool history and emits standard calls, without repairing invalid output", async () => {
  const input = { ...request(), tools: [tool], stream_options: { include_usage: true } };
  const engine = {
    resetChat: async () => {},
    chat: { completions: { async *create() {
      yield { choices: [{ delta: { content: "<thi" }, finish_reason: null }] };
      yield { choices: [{ delta: { content: "nk>\n\n</think>\n\n" }, finish_reason: null }] };
      yield { choices: [{ delta: { content: '<tool_call>{"name":"read","arguments":{"path":"/tmp/a"}}</tool_call>' }, finish_reason: null }] };
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
  assert.ok(translated.response_format.structural_tag.includes('"read"'));
  engine.chat.completions.create = async function* () { yield { choices: [{ delta: { content: "<tool_call>unfinished" }, finish_reason: "length" }] }; };
  await assert.rejects(async () => Array.fromAsync(qwenCompletions(engine, input)), /length/);
  engine.chat.completions.create = async function* () { yield { choices: [{ delta: { content: "<tool_call>unfinished" } }] }; };
  await assert.rejects(async () => Array.fromAsync(qwenCompletions(engine, input)), /finish reason/);
});

class FakeWorker extends EventTarget {
  constructor({ stuck = false } = {}) { super(); this.stuck = stuck; this.commands = []; this.pulls = 0; }
  postMessage(message) {
    this.commands.push(message.type);
    if (this.stuck && ["next", "cancel"].includes(message.type)) return;
    let value;
    if (message.type === "load") value = { contextWindow: 16384 };
    if (message.type === "next") value = this.pulls++ === 0
      ? { value: { choices: [{ index: 0, delta: { content: "hello" }, finish_reason: "stop" }] }, done: false }
      : { done: true };
    queueMicrotask(() => this.dispatchEvent(new MessageEvent("message", { data: { id: message.id, value } })));
  }
  terminate() { this.terminated = true; }
}

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
