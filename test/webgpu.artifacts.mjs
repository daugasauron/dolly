import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { LOCAL_MODELS } from "../src/local-model-contract.mjs";

test("the prepared WebLLM formatter preserves literal source code in every message role", async () => {
  const root = await fs.mkdtemp(resolve(tmpdir(), "dolly-webllm-template-"));
  try {
    const script = await fs.readFile(new URL("../scripts/build-webgpu-assets.mjs", import.meta.url), "utf8");
    let prepared;
    await runInNewContext("(async () => {\n" + script.replace(/^#!.*\n/, "")
      .replace(/^import .*;\n/gm, "").replaceAll("import.meta.dirname", JSON.stringify(resolve(root, "scripts"))) + "\n})()", {
      ...fs, Buffer, createHash, dirname, resolve, console: { log() {} },
      readFile: async (path, encoding) => path.endsWith("config/webgpu-assets.json") ? '{"models":[]}'
        : path.endsWith("LICENSE") ? "fixture license" : fs.readFile(path, encoding),
      build: async ({ plugins }) => {
        let load;
        plugins[0].setup({ onLoad(_filter, callback) { load = callback; } });
        prepared = (await load({ path: new URL("../node_modules/@mlc-ai/web-llm/lib/index.js", import.meta.url).pathname })).contents;
      },
    });
    const manifest = JSON.parse(await fs.readFile(new URL("../config/webgpu-assets.json", import.meta.url)));
    const asset = manifest.models[0].assets.find(asset => asset.file === "mlc-chat-config.json");
    const config = JSON.parse(await fs.readFile(new URL(`../dist/webgpu/${asset.sha256}-${asset.file}`, import.meta.url)));
    const Conversation = runInNewContext(prepared.slice(prepared.indexOf("class Conversation {"), prepared.indexOf("function getConversation(")) + "\nConversation", {
      Role: { user: "user", assistant: "assistant" },
      MessagePlaceholders: { system: "{system_message}", user: "{user_message}",
        assistant: "{assistant_message}", function: "{function_string}" },
    });
    const input = "$& $$ $' $` {function_string}\n日本語\n";
    const conversation = new Conversation(config.conv_template);
    conversation.override_system_message = input;
    conversation.appendMessage("user", input);
    conversation.appendMessage("assistant", input);
    assert.deepEqual(Array.from(conversation.getPromptArray(config)), ["system", "user", "assistant"].map(role =>
      `<|im_start|>${role}\n${input}<|im_end|>\n`));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("the worker's effective stop tokens match every pinned Qwen tokenizer", async () => {
  const source = (await readFile(new URL("../src/webgpu-worker.mjs", import.meta.url), "utf8"))
    .replace(/^import .*;\n/gm, "")
    .replaceAll("import.meta.url", JSON.stringify(new URL("../src/webgpu-worker.mjs", import.meta.url).href))
    .replace('await import("../dist/webgpu/webllm.mjs")', "{ MLCEngine: globalThis.MLCEngine }");
  const manifest = JSON.parse(await readFile(new URL("../config/webgpu-assets.json", import.meta.url)));
  for (const model of manifest.models) {
    const logicalId = model.model.split("-q4")[0];
    const asset = async file => {
      const pinned = model.assets.find(asset => asset.file === file);
      return JSON.parse(await readFile(new URL(`../dist/webgpu/${pinned.sha256}-${file}`, import.meta.url)));
    };
    const config = await asset("mlc-chat-config.json"), tokenizer = await asset("tokenizer.json");
    let receive, options, respond;
    const result = new Promise(resolve => { respond = resolve; });
    runInNewContext(source, {
      LOCAL_MODELS, URL, navigator: { gpu: { requestAdapter: async () => ({ features: new Set(
        model.model.includes("q4f16") ? ["shader-f16"] : []) }) } },
      fetch: async () => ({ ok: true, json: async () => manifest }),
      MLCEngine: class {
        constructor(value) { options = value.appConfig.model_list[0].overrides; }
        async reload(id) { assert.equal(id, logicalId); }
      },
      addEventListener(_event, callback) { receive = callback; },
      postMessage(message) { if (message.id) respond(message); },
    });
    receive({ data: { id: 1, type: "load", modelId: logicalId } });
    const loaded = await result;
    assert.equal(loaded.error, undefined);
    assert.equal(loaded.value.variant, model.model, "same logical model automatically selects the GPU-compatible variant");
    const effective = { ...config.conv_template, ...options.conv_config };
    assert.deepEqual(Array.from(effective.stop_token_ids), effective.stop_str.map(text => {
      const token = tokenizer.added_tokens.find(token => token.content === text && token.special);
      assert.ok(token, `${model.model}: missing stop token ${text}`);
      return token.id;
    }), model.model);
  }
});
