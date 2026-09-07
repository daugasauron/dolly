#!/usr/bin/env node
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "dist/webgpu");
await mkdir(output, { recursive: true });
const manifestBytes = await readFile(resolve(root, "config/webgpu-assets.json"));
const manifest = JSON.parse(manifestBytes);
const valid = (bytes, asset) => bytes.length === asset.bytes && createHash("sha256").update(bytes).digest("hex") === asset.sha256;
for (const asset of manifest.models.flatMap(model => model.assets).filter(a => a.bundle)) {
  const destination = resolve(output, `${asset.sha256}-${asset.file}`);
  try { if (valid(await readFile(destination), asset)) continue; } catch { /* First build. */ }
  const response = await fetch(asset.url);
  if (!response.ok) throw new Error(`${asset.file}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!valid(bytes, asset)) throw new Error(`${asset.file}: integrity check failed`);
  await writeFile(`${destination}.tmp`, bytes);
  await rename(`${destination}.tmp`, destination);
}
await writeFile(resolve(output, "assets.json"), manifestBytes);
await writeFile(resolve(output, "LICENSE.webllm.txt"),
  await readFile(resolve(root, "node_modules/@mlc-ai/web-llm/LICENSE")));
await build({ stdin: { contents: 'export { MLCEngine } from "@mlc-ai/web-llm";', resolveDir: root },
  bundle: true, format: "esm", platform: "browser", target: "es2022", minify: true,
  plugins: [{ name: "webllm-prefill-tensor-lifetime", setup(builder) {
    builder.onLoad({ filter: /@mlc-ai\/web-llm\/lib\/index\.js$/ }, async ({ path }) => {
      const source = await readFile(path, "utf8");
      // WebLLM 0.2.84 leaks every detached prefill result except the last.
      const assignment = "                logits = this.tvm.detachFromCurrentScope(yield this.embedAndForward(chunk, chunkLen));";
      if (createHash("sha256").update(source).digest("hex") !== "4917bf1b8969ca20a0b74b2773cbc9c14f77ce7427df491cd56c252f9a6070c7") {
        throw new Error("Recheck WebLLM's prefill tensor lifetime before updating its bundle");
      }
      return { contents: "/*! Dolly modification: release intermediate prefill tensors in WebLLM 0.2.84. */\n" +
        source.replace(assignment, `                logits?.dispose();\n${assignment}`),
        loader: "js", resolveDir: dirname(path) };
    });
  } }],
  outfile: resolve(output, "webllm.mjs"), legalComments: "linked" });
console.log("dolly: WebGPU browser assets ready (weights download only when the user loads the model)");
