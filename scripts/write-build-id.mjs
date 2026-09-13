#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export const imageBuildInputs = Object.freeze([
  "dolly.data", "dolly-seed.mjs", "dolly-process-0.wasm", "dolly-process-dso-0.wasm",
  "dolly-kernel-plugin-0.wasm", "dolly-snapshot-0.wasm",
]);

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

if (process.argv[1] === import.meta.filename) {
  const [wasmPath, dataPath, outputPath] = process.argv.slice(2);
  if (!wasmPath || !dataPath || !outputPath || process.argv.length !== 5) {
    throw new Error("usage: write-build-id.mjs RUNTIME.wasm RUNTIME.data OUTPUT.mjs");
  }
  const { buildId, imageBuildId } = await buildIdentities(wasmPath, dataPath);
  await writeFile(outputPath, `export const DOLLY_BUILD_ID = ${JSON.stringify(buildId)};\n`);
  await writeFile(resolve(dirname(outputPath), "dolly-image-build-id.mjs"),
    `export const DOLLY_IMAGE_BUILD_ID = ${JSON.stringify(imageBuildId)};\n`);
  console.log(`dolly: runtime ${buildId}; image inputs ${imageBuildId}`);
}
