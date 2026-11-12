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
  // dist/dolly-runtime-worker.mjs: the runtime Worker's code in one file, fetched at once, not an
  // import level a round trip. The providers it imports by their manifests stay files of their own.
  const runtime = resolve(projectDir, "dist/dolly-runtime-worker.mjs");
  const bundled = await build({
    entryPoints: ["src/runtime-worker.mjs"], absWorkingDir: projectDir, write: false,
    // esnext keeps the JSON imports' attributes, which es2022 has not.
    bundle: true, platform: "browser", format: "esm", target: "esnext",
  });
  await writeFile(`${runtime}.${process.pid}.tmp`, bundled.outputFiles[0].contents);
  await rename(`${runtime}.${process.pid}.tmp`, runtime);
}

if (process.argv[1] === import.meta.filename) await bundleProcessWorker();
