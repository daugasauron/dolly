import assert from "node:assert/strict";
import test from "node:test";
import { validateToolArguments } from "@earendil-works/pi-ai";
import { codec } from "../src/classicube/agent/player.js";
import * as crypto from "node:crypto";
import { efforts, validateTask, visionModels, signIn } from "../src/classicube/agent/auth.mjs";

test("OpenRouter code login binds a portable S256 challenge to its one-use verifier", async t => {
  const logs = []; const original = globalThis.__janisBuiltin;
  globalThis.__janisBuiltin = name => { assert.equal(name, "crypto"); return {
    randomBytes: crypto.randomBytes,
    createHash: algorithm => {
      const hash = crypto.createHash(algorithm);
      return { update(value) { hash.update(value); return this; }, digest(encoding) {
        assert.equal(encoding, undefined, "do not depend on the runtime's unsupported base64url encoding"); return hash.digest();
      } };
    },
  }; };
  t.after(() => { if (original) globalThis.__janisBuiltin = original; else delete globalThis.__janisBuiltin; });
  t.mock.method(console, "log", text => logs.push(text));
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://openrouter.ai/api/v1/auth/keys"); assert.equal(options.method, "POST");
    const body = JSON.parse(options.body);
    assert.equal(body.code, "one-use-code"); assert.match(body.code_verifier, /^[A-Za-z0-9_-]{43}$/);
    const authorize = new URL(logs.join("\n").match(/https:\/\/openrouter\.ai\/auth\?[^\s]+/)[0]);
    assert.equal(authorize.searchParams.has("callback_url"), false, "the sandbox uses code-paste login");
    assert.equal(authorize.searchParams.get("code_challenge"), crypto.createHash("sha256").update(body.code_verifier).digest("base64url"));
    return new Response(JSON.stringify({ key: "fixture-key" }));
  });
  assert.equal(await signIn(async (_label, options) => { assert.equal(options.secret, true); return "one-use-code"; }), "fixture-key");
});

test("ClassiCube tools encode relative look separately from bounded menu coordinates", () => {
  const arguments_ = { actions: [{ type: "look", dx: -200, dy: 350, milliseconds: 16 },
    { type: "click", x: 320, y: 240, button: "right" }, { type: "key", key: "W", milliseconds: 500 }] };
  const tool = { name: "game_input", parameters: codec.parameters };
  assert.deepEqual(validateToolArguments(tool, { name: tool.name, arguments: arguments_ }), arguments_);
  const packet = new DataView(codec.encodeBatch(arguments_.actions, 4).buffer);
  assert.equal(packet.getUint32(0, true), 0x31424343);
  assert.equal(packet.getUint32(16, true), 6);
  assert.equal(packet.getInt32(20, true), -200); assert.equal(packet.getInt32(24, true), 350);
  const click = new DataView(codec.encodeBatch([{ type: "click", button: "right" }], 1).buffer);
  assert.equal(click.getInt32(20, true), 320); assert.equal(click.getInt32(24, true), 240);
  assert.throws(() => codec.encodeBatch([{ type: "click", button: "right", x: 320 }], 1));
  const look = new DataView(codec.encodeBatch([{ type: "look", dy: 50 }], 1).buffer);
  assert.equal(look.getInt32(20, true), 0); assert.equal(look.getInt32(24, true), 50);
  assert.throws(() => codec.encodeBatch([{ type: "look" }], 1));
  for (const action of [{ type: "look", x: 20, y: 20 }, { type: "look", dx: 1601, dy: 0 },
    { type: "click", x: 640, y: 240, button: "left" }, { type: "key", key: "W", milliseconds: 2001 },
    { type: "teleport", x: 10, y: 10 }, { type: "look", dx: 0, dy: 0, button: "left" }])
    assert.throws(() => codec.encodeBatch([action], 1));
  assert.throws(() => codec.encodeBatch([{ type: "wait", milliseconds: 2000 }, { type: "key", key: "W" }], 1));
});

test("model selection excludes text-only and non-tool models, preserving effort restrictions", () => {
  const base = { id: "test/vision", name: "Vision", context_length: 32000,
    architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] },
    supported_parameters: ["tools", "reasoning"], pricing: { prompt: "0.000001", completion: "0.000002" } };
  const models = visionModels([base, { ...base, id: "text", architecture: { input_modalities: ["text"] } },
    { ...base, id: "image-only", architecture: { input_modalities: ["image"], output_modalities: ["image"] } },
    { ...base, id: "no-tools", supported_parameters: [] }], [{ id: base.id, thinkingLevelMap: { off: null, xhigh: "high" } }]);
  assert.equal(models.length, 1); assert.equal(models[0].cost.input, 1); assert.equal(models[0].cost.output, 2);
  assert.deepEqual(efforts(models[0]), ["minimal", "low", "medium", "high", "xhigh"]);
  assert.deepEqual(efforts({ reasoning: false }), ["off"]);
  const task = { model: base.id, effort: "low", prompt: "Build a house", seconds: 60, budget: 0.25 };
  assert.equal(validateTask(task), task);
  for (const change of [{ prompt: " " }, { prompt: "a".repeat(4097) }, { seconds: Infinity }, { seconds: 9 }, { budget: 0 }, { effort: "extreme" }])
    assert.throws(() => validateTask({ ...task, ...change }));
  const subscription = { ...task, provider: "codex-local", budget: 0 };
  assert.equal(validateTask(subscription), subscription);
  assert.throws(() => validateTask({ ...subscription, budget: 1 }));
  assert.throws(() => validateTask({ ...task, provider: "unconfigured" }));
});
