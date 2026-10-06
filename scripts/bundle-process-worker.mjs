#!/usr/bin/env node
import { build } from "esbuild";
import { rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { hostManifests } from "../host/manifests.mjs";

// dist/dolly-process-worker.mjs, and beside it dist/dolly-process-NAME.mjs for
// each module whose manifest names a processWorker: code that only the Worker
// of an executable recording the module imports.
export async function bundleProcessWorker(projectDir = resolve(import.meta.dirname, "..")) {
  const modules = hostManifests.filter(manifest => manifest.processWorker);
  for (const [name, entry] of [["worker", "src/process-worker.mjs"],
    ...modules.map(manifest => [manifest.name, `host/${manifest.name}/${manifest.processWorker}`])]) {
    const outfile = resolve(projectDir, `dist/dolly-process-${name}.mjs`);
    const result = await build({
      entryPoints: [entry], absWorkingDir: projectDir, outfile, write: false,
      bundle: true, platform: "browser", format: "esm", target: "es2022", metafile: true,
    });
    if (Object.values(result.metafile.outputs).some(output => output.imports.length)) {
      throw new Error(`${entry}: a process Worker bundle must have no external imports`);
    }
    const inherited = name === "worker" && Object.keys(result.metafile.inputs)
      .find(input => modules.some(manifest => input.startsWith(`host/${manifest.name}/`)));
    if (inherited) throw new Error(`every process Worker would load ${inherited}`);
    // Concurrent image builds serve this file while another server starts.
    await writeFile(`${outfile}.${process.pid}.tmp`, result.outputFiles[0].contents);
    await rename(`${outfile}.${process.pid}.tmp`, outfile);
  }
}

if (process.argv[1] === import.meta.filename) await bundleProcessWorker();
