#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { writeFile } from "node:fs/promises";

const [wasmPath, dataPath, outputPath] = process.argv.slice(2);
if (!wasmPath || !dataPath || !outputPath) {
  throw new Error("usage: write-build-id.mjs RUNTIME.wasm RUNTIME.data OUTPUT.mjs");
}

const hash = createHash("sha256");
for (const path of [wasmPath, dataPath]) {
  for await (const chunk of createReadStream(path)) hash.update(chunk);
}
const buildId = `sha256:${hash.digest("hex")}`;
await writeFile(outputPath, `export const DOLLY_BUILD_ID = ${JSON.stringify(buildId)};\n`);
console.log(`dolly: wrote build id ${buildId}`);
