#!/usr/bin/env node
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { resolve } from "node:path";

const projectDir = resolve(import.meta.dirname, "..");
const [image, option] = process.argv.slice(2);
if (process.argv.length > 4 || !/^[a-z][a-z0-9-]{0,31}$/.test(image ?? "") || (option !== undefined && option !== "--package")) {
  throw new Error("usage: npm run image -- IMAGE [--package]");
}
try { await access(resolve(projectDir, "dist/dolly-build-id.mjs")); }
catch { throw new Error("Build the Wasm runtime once with npm run build:runtime, then retry this image build."); }
const environment = { ...process.env, DOLLY_BUILD_IMAGES: image, DOLLY_SNAPSHOT_IMAGE: image };
async function run(command, args) {
  await new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd: projectDir, env: environment, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", status => status === 0 ? resolveRun() : reject(new Error(`${command} failed (${status})`)));
  });
}
const started = performance.now();
await run(process.execPath, ["scripts/update-module-pins.mjs"]);
await run("bash", ["scripts/prepare-image-sources.sh"]);
await run(process.execPath, ["scripts/generate-routes.mjs"]);
await run(process.execPath, ["scripts/build-system-snapshot.mjs"]);
if (option === "--package") await run("./scripts/package-pages.sh", []);
console.log(`dolly: ${image} ready in ${((performance.now() - started) / 1000).toFixed(1)}s using the existing runtime`);
if (option === "--package") console.log(`dolly: npm run serve, then open /${image}/ or /view/${image}/`);
