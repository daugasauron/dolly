#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { hostFiles } from "./host-modules.mjs";

// What an image's programs are built for: the seed, the process-side contracts
// of the modules (the process ABI, dso@0's loadable modules and the others'),
// and the kernel plugin and image contracts.
export const imageBuildInputs = Object.freeze(["dolly.data",
  ...hostFiles("process").map(({ file }) => `${basename(file, ".wat")}.wasm`),
  "dolly-kernel-plugin-0.wasm", "dolly-image-0.wasm"]);

export async function buildIdentities(wasmPath, dataPath) {
  const directory = dirname(dataPath);
  const image = createHash("sha256").update("dolly-image-build-1\0");
  for (const name of imageBuildInputs) {
    const input = createHash("sha256");
    for await (const chunk of createReadStream(name === "dolly.data" ? dataPath : resolve(directory, name))) input.update(chunk);
    image.update(name).update("\0").update(input.digest());
  }
  const imageBuildId = `sha256:${image.digest("hex")}`;
  const runtime = createHash("sha256").update("dolly-runtime-build-1\0").update(imageBuildId);
  for await (const chunk of createReadStream(wasmPath)) runtime.update(chunk);
  return { buildId: `sha256:${runtime.digest("hex")}`, imageBuildId };
}

// The files beside the runtime that name its identities, by file name: modules
// for the page, and the same as data for a host in another language.
export const buildIdModules = ({ buildId, imageBuildId }) => ({
  "dolly-build-id.mjs": `export const DOLLY_BUILD_ID = ${JSON.stringify(buildId)};\n`,
  "dolly-image-build-id.mjs": `export const DOLLY_IMAGE_BUILD_ID = ${JSON.stringify(imageBuildId)};\n`,
  "dolly-build-id.json": `${JSON.stringify({ buildId, imageBuildId })}\n`,
});

if (process.argv[1] === import.meta.filename) {
  const [wasmPath, dataPath, outputPath] = process.argv.slice(2);
  if (!wasmPath || !dataPath || !outputPath || process.argv.length !== 5) {
    throw new Error("usage: write-build-id.mjs RUNTIME.wasm RUNTIME.data OUTPUT.mjs");
  }
  const identities = await buildIdentities(wasmPath, dataPath);
  const modules = buildIdModules(identities);
  for (const [file, text] of Object.entries(modules)) await writeFile(resolve(dirname(outputPath), file), text);
  console.log(`dolly: runtime ${identities.buildId}; image inputs ${identities.imageBuildId}`);
}
