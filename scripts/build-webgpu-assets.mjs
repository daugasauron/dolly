#!/usr/bin/env node
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, writeFile, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "dist/webgpu");
await mkdir(output, { recursive: true });
const manifestBytes = await readFile(resolve(root, "config/webgpu-assets.json"));
const manifest = JSON.parse(manifestBytes);
const valid = (bytes, asset) => bytes.length === asset.bytes && createHash("sha256").update(bytes).digest("hex") === asset.sha256;
const staging = await mkdtemp(resolve(dirname(output), ".webgpu-"));
try {
  for (const asset of manifest.models.flatMap(model => model.assets).filter(a => a.bundle)) {
    const name = `${asset.sha256}-${asset.file}`, destination = resolve(output, name);
    try { if (valid(await readFile(destination), asset)) continue; } catch { /* First build. */ }
    const response = await fetch(asset.url);
    if (!response.ok) throw new Error(`${asset.file}: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!valid(bytes, asset)) throw new Error(`${asset.file}: integrity check failed`);
    await writeFile(resolve(staging, name), bytes);
    await rename(resolve(staging, name), destination);
  }
  await writeFile(resolve(staging, "LICENSE.webllm.txt"),
    await readFile(resolve(root, "node_modules/@mlc-ai/web-llm/LICENSE")));
  await build({ stdin: { contents: 'export { MLCEngine } from "@mlc-ai/web-llm";', resolveDir: root },
    bundle: true, format: "esm", platform: "browser", target: "es2022", minify: true,
    plugins: [{ name: "webllm-corrections", setup(builder) {
      builder.onLoad({ filter: /@mlc-ai\/web-llm\/lib\/index\.js$/ }, async ({ path }) => {
        const source = await readFile(path, "utf8");
        // WebLLM 0.2.84 leaks every detached prefill result except the last.
        const assignment = "                logits = this.tvm.detachFromCurrentScope(yield this.embedAndForward(chunk, chunkLen));";
        if (createHash("sha256").update(source).digest("hex") !== "4917bf1b8969ca20a0b74b2773cbc9c14f77ce7427df491cd56c252f9a6070c7") {
          throw new Error("Recheck WebLLM's tensor lifetime and literal prompt substitution before updating its bundle");
        }
        return { contents: "/*! Dolly modifications: release intermediate prefill tensors and preserve literal prompt text in WebLLM 0.2.84. */\n" +
          source.replace(assignment, `                logits?.dispose();\n${assignment}`)
            .replace("replace(MessagePlaceholders.system, system_message)", "replace(MessagePlaceholders.system, () => system_message)")
            .replace("_a.replace(MessagePlaceholders[Role[role]], textContentPart)", "_a")
            .replace("replace(MessagePlaceholders.function, this.function_string)", "replace(MessagePlaceholders.function, () => this.function_string)")
            // Expand the template before inserting message data, which may contain placeholders or $ substitutions.
            .replace('replace(MessagePlaceholders.function, "");', 'replace(MessagePlaceholders.function, "");\n                message_str = message_str?.replace(MessagePlaceholders[Role[role]], () => textContentPart);'),
          loader: "js", resolveDir: dirname(path) };
      });
    } }],
    outfile: resolve(staging, "webllm.mjs"), legalComments: "linked" });
  for (const name of await readdir(staging)) await rename(resolve(staging, name), resolve(output, name));
  await writeFile(resolve(staging, "assets.json"), manifestBytes);
  await rename(resolve(staging, "assets.json"), resolve(output, "assets.json"));
} finally { await rm(staging, { recursive: true, force: true }); }
console.log("dolly: WebGPU browser assets ready (weights download only when the user loads the model)");
