#!/usr/bin/env node
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { resolve } from "node:path";

const projectDir = resolve(import.meta.dirname, "..");
const arguments_ = process.argv.slice(2);
const image = arguments_[0]?.startsWith("--") ? undefined : arguments_.shift();
const option = arguments_.shift();
if (arguments_.length || (image !== undefined && !/^[a-z][a-z0-9-]{0,31}$/.test(image)) ||
    (option !== undefined && !["--package", "--plan", "--reproducible"].includes(option))) {
  throw new Error("usage: npm run image -- [IMAGE] [--package|--plan|--reproducible]");
}
try { await Promise.all(["dolly-build-id.mjs", "dolly-image-build-id.mjs"]
  .map(name => access(resolve(projectDir, "dist", name)))); }
catch { throw new Error("Build the Wasm runtime once with npm run build:runtime, then retry this image build."); }
const environment = { ...process.env };
if (image !== undefined) {
  environment.DOLLY_BUILD_IMAGES = image;
  environment.DOLLY_SNAPSHOT_IMAGE = image;
} else if (!environment.DOLLY_BUILD_IMAGES && environment.DOLLY_SNAPSHOT_IMAGE) {
  environment.DOLLY_BUILD_IMAGES = environment.DOLLY_SNAPSHOT_IMAGE;
}
if (option === "--reproducible" && !environment.DOLLY_SNAPSHOT_IMAGE) {
  throw new Error("Choose one IMAGE or set DOLLY_SNAPSHOT_IMAGE before checking reproducibility.");
}
async function run(phase, command, args) {
  const started = performance.now();
  await new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd: projectDir, env: environment, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", status => status === 0 ? resolveRun() : reject(new Error(`${command} failed (${status})`)));
  });
  console.log(`dolly: ${phase} took ${((performance.now() - started) / 1000).toFixed(1)}s`);
}
const started = performance.now();
if (option === "--plan") {
  await run("plan", process.execPath, ["scripts/build-system-snapshot.mjs", "--plan"]);
  process.exit(0);
}
await run("recipe pinning", process.execPath, ["scripts/update-module-pins.mjs"]);
await run("source preparation and pinning", "bash", ["scripts/prepare-image-sources.sh"]);
await run("source inspection and routes", process.execPath, ["scripts/generate-routes.mjs"]);
await run("snapshots", process.execPath, [option === "--reproducible"
  ? "scripts/verify-snapshot-reproducibility.mjs" : "scripts/build-system-snapshot.mjs"]);
if (option === "--package") await run("packaging", "./scripts/package-pages.sh", []);
console.log(`dolly: ${environment.DOLLY_SNAPSHOT_IMAGE ?? environment.DOLLY_BUILD_IMAGES ?? "all images"} ready in ${((performance.now() - started) / 1000).toFixed(1)}s using the existing runtime`);
if (option === "--package") console.log("dolly: npm run serve, then open the image menu");
