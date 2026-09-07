import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import test from "node:test";

test("WebGPU preparation owns scratch, preserves complete outputs on failure and reuses verified assets", async () => {
  const script = await fs.readFile(new URL("../scripts/build-webgpu-assets.mjs", import.meta.url), "utf8");
  for (const failure of ["asset-write", "bundle", null]) {
    const root = await fs.mkdtemp(resolve(tmpdir(), "dolly-webgpu-"));
    try {
      const output = resolve(root, "dist/webgpu"), bytes = Buffer.from("verified asset");
      const asset = { file: "model.bin", bundle: true, bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"), url: "https://fixture.invalid/model.bin" };
      const assetName = `${asset.sha256}-${asset.file}`;
      const manifest = JSON.stringify({ models: [{ assets: [asset] }] });
      const previous = { [assetName]: "old asset", "assets.json": "old manifest",
        "LICENSE.webllm.txt": "old license", "webllm.mjs": "old bundle", "webllm.mjs.LEGAL.txt": "old legal" };
      await fs.mkdir(output, { recursive: true });
      for (const [name, data] of Object.entries(previous)) await fs.writeFile(resolve(output, name), data);
      for (const [name, data] of [["config/webgpu-assets.json", manifest],
        ["node_modules/@mlc-ai/web-llm/LICENSE", "new license"]]) {
        await fs.mkdir(dirname(resolve(root, name)), { recursive: true });
        await fs.writeFile(resolve(root, name), data);
      }
      let downloads = 0;
      const run = () => runInNewContext("(async () => {\n" + script.replace(/^#!.*\n/, "")
        .replace(/^import .*;\n/gm, "").replaceAll("import.meta.dirname", JSON.stringify(resolve(root, "scripts"))) + "\n})()", {
        ...fs, Buffer, createHash, dirname, resolve, console: { log() {} },
        fetch: async url => { assert.equal(url, asset.url); downloads++; return { ok: true, arrayBuffer: async () => bytes }; },
        writeFile: async (path, contents) => {
          if (failure === "asset-write" && path.includes(assetName)) {
            await fs.writeFile(path, "partial");
            throw new Error("injected asset write failure");
          }
          return fs.writeFile(path, contents);
        },
        build: async ({ outfile }) => {
          await fs.writeFile(outfile, "partial bundle");
          if (failure === "bundle") throw new Error("injected bundle failure");
          await fs.writeFile(outfile, "complete bundle");
          await fs.writeFile(`${outfile}.LEGAL.txt`, "complete legal");
        },
      });
      if (failure) {
        await assert.rejects(run, /injected/);
        for (const [name, data] of Object.entries(previous)) {
          if (name === assetName && failure === "bundle") continue;
          assert.equal(await fs.readFile(resolve(output, name), "utf8"), data, `${failure}: ${name}`);
        }
      } else {
        await run();
        await run();
        assert.equal(downloads, 1);
        for (const [name, data] of Object.entries({ [assetName]: bytes.toString(), "assets.json": manifest,
          "LICENSE.webllm.txt": "new license", "webllm.mjs": "complete bundle", "webllm.mjs.LEGAL.txt": "complete legal" })) {
          assert.equal(await fs.readFile(resolve(output, name), "utf8"), data);
        }
      }
      assert.deepEqual((await fs.readdir(output)).sort(), Object.keys(previous).sort(), "no abandoned staging");
      assert.deepEqual(await fs.readdir(dirname(output)), ["webgpu"], "scratch stays outside the published asset directory and is removed");
    } finally { await fs.rm(root, { recursive: true, force: true }); }
  }
});

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
