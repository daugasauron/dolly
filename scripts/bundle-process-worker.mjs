#!/usr/bin/env node
import { build } from "esbuild";
import { rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export async function bundleProcessWorker(projectDir = resolve(import.meta.dirname, "..")) {
  const outfile = resolve(projectDir, "dist/dolly-process-worker.mjs");
  const result = await build({
    entryPoints: [resolve(projectDir, "src/process-worker.mjs")], outfile, write: false,
    bundle: true, platform: "browser", format: "esm", target: "es2022", metafile: true,
  });
  if (Object.values(result.metafile.outputs).some(output => output.imports.length)) {
    throw new Error("Process worker bundle must have no external imports");
  }
  // Concurrent image builds serve this file while another server starts.
  await writeFile(`${outfile}.${process.pid}.tmp`, result.outputFiles[0].contents);
  await rename(`${outfile}.${process.pid}.tmp`, outfile);
}

if (process.argv[1] === import.meta.filename) await bundleProcessWorker();
