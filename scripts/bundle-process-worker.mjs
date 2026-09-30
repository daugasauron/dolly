#!/usr/bin/env node
import { build } from "esbuild";
import { resolve } from "node:path";

export async function bundleProcessWorker(projectDir = resolve(import.meta.dirname, "..")) {
  const result = await build({
    entryPoints: [resolve(projectDir, "src/process-worker.mjs")],
    outfile: resolve(projectDir, "dist/dolly-process-worker.mjs"),
    bundle: true, platform: "browser", format: "esm", target: "es2022", metafile: true,
  });
  if (Object.values(result.metafile.outputs).some(output => output.imports.length)) {
    throw new Error("Process worker bundle must have no external imports");
  }
}

if (process.argv[1] === import.meta.filename) await bundleProcessWorker();
