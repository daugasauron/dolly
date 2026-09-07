#!/usr/bin/env node
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { resolve } from "node:path";

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
  outfile: resolve(output, "webllm.mjs"), legalComments: "linked" });
console.log("dolly: WebGPU browser assets ready (weights download only when the user loads the model)");
