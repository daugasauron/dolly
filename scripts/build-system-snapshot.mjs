#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  discoverImageDefinitions,
  selectImageDefinitions,
} from "./image-definitions.mjs";
import { createDollyfileGraphLoader, recipeRecords } from "./dollyfile-graph.mjs";
import { decodeSystemSnapshot } from "./system-snapshot-format.mjs";
import { sha256 as digest, verifySnapshotIdentity } from "./snapshot-identity.mjs";
import { readWasmInterface } from "./wasm-interface.mjs";
import { DOLLY_PROCESS_ABI_DIGEST } from "../dist/dolly-process-abi.mjs";
import { imageInputs, imageInputsMatch } from "../src/image-inputs.mjs";
import { parseGeneratedConstant } from "./site-release.mjs";

const projectDir = resolve(import.meta.dirname, "..");
const planOnly = process.argv[2] === "--plan";
if (process.argv.length > 3 || (process.argv[2] !== undefined && !planOnly)) {
  throw new Error("usage: build-system-snapshot.mjs [--plan]");
}
const started = performance.now();
const loadGraph = createDollyfileGraphLoader(projectDir);
const snapshotBrowserProfile = process.env.DOLLY_BROWSER_PROFILE ??
  resolve(projectDir, ".cache/snapshot-browser-profile");
const snapshotBrowserPort = process.env.DOLLY_BROWSER_PORT ?? String(
  20_000 + (Number.parseInt(
    createHash("sha256").update(projectDir).digest("hex").slice(0, 8), 16,
  ) % 20_000),
);
const definitions = await selectImageDefinitions(await discoverImageDefinitions(projectDir));
const graphs = new Map(await Promise.all(definitions.map(async (definition) => [
  definition.image,
  await loadGraph(definition.filename),
])));
const definitionByImage = new Map(definitions.map((definition) => [definition.image, definition]));
const requestedImage = process.env.DOLLY_SNAPSHOT_IMAGE;
if (requestedImage !== undefined && !definitionByImage.has(requestedImage)) {
  throw new Error("DOLLY_SNAPSHOT_IMAGE must name a source-visible image");
}
const images = [], scheduled = new Set();
function schedule(image) {
  if (scheduled.has(image)) return;
  scheduled.add(image);
  for (const reference of graphs.get(image).artifacts) schedule(reference.image);
  images.push(image);
}
for (const image of requestedImage === undefined ? definitions.map(definition => definition.image) : [requestedImage]) schedule(image);
const { DOLLY_BUILD_ID } = await import("../dist/dolly-build-id.mjs");
const { DOLLY_IMAGE_BUILD_ID } = await import("../dist/dolly-image-build-id.mjs");
const processContract = await readWasmInterface(resolve(projectDir, "dist/dolly-process-0.wasm"));

function expectedRecipes(image) {
  return recipeRecords(graphs.get(image));
}

function expectedModules(image) {
  return graphs.get(image).root.uses.map(({ location, sha256 }) => ({
    location,
    sha256,
  }));
}

function runSnapshotBuild(image, output) {
  return new Promise((resolveBuild, reject) => {
    const child = spawn(resolve(projectDir, "scripts/test-browser.sh"), [], {
      cwd: projectDir,
      env: {
        ...process.env,
        DOLLY_BROWSER_MODE: "snapshot-export",
        DOLLY_BROWSER_PROFILE: snapshotBrowserProfile,
        DOLLY_BROWSER_PORT: snapshotBrowserPort,
        DOLLY_IMAGE: image,
        DOLLY_SNAPSHOT_OUTPUT: output,
      },
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (status, signal) => {
      if (status === 0) resolveBuild();
      else reject(new Error(
        `Dolly ${image} snapshot browser exited with ${signal ? `signal ${signal}` : `status ${status}`}`,
      ));
    });
  });
}

function verifyImage(image, parsed) {
  return verifySnapshotIdentity(definitionByImage.get(image), graphs.get(image), parsed,
    processContract, DOLLY_PROCESS_ABI_DIGEST);
}

const metadataPath = image => resolve(projectDir, `dist/dolly-${image}-system-snapshot.mjs`);
const readMetadata = async image => parseGeneratedConstant(await readFile(metadataPath(image), "utf8"), "DOLLY_SYSTEM_SNAPSHOT");

async function inspectSnapshot(image, inputs) {
  if (process.env.DOLLY_FORCE_SNAPSHOT === "1") return { action: "build", reason: "forced" };
  try {
    const metadata = await readMetadata(image);
    const stale = reason => ({ action: "build", reason });
    if (metadata?.image !== image) return stale("metadata image mismatch");
    if (metadata.buildId !== DOLLY_IMAGE_BUILD_ID) return stale("seed or image ABI changed");
    if (metadata.formatVersion !== 2 || metadata.identityVersion !== 2) return stale("snapshot format changed");
    const recipes = expectedRecipes(image);
    if (JSON.stringify(metadata.recipes) !== JSON.stringify(recipes)) {
      const changed = recipes.find(recipe => !metadata.recipes?.some(old =>
        old.sourcePath === recipe.sourcePath && old.sha256 === recipe.sha256));
      return stale(changed ? `recipe changed: ${changed.sourcePath}` : "recipe graph changed");
    }
    if (JSON.stringify(metadata.modules) !== JSON.stringify(expectedModules(image))) return stale("module list changed");
    if (inputs === null) return { action: "check", reason: "dependency output pending" };
    if (!imageInputsMatch(metadata.inputs, inputs)) {
      const changed = graphs.get(image).artifacts.filter(reference => {
        const expected = inputs.find(input => input.recipeSha256 === reference.sha256);
        return !metadata.inputs?.some(old => old.recipeSha256 === reference.sha256 && old.sha256 === expected.sha256);
      });
      return stale(`dependency output changed: ${changed.map(reference => reference.image).join(", ") || "input list"}`);
    }
    const snapshot = await readFile(resolve(projectDir, `dist/dolly-${image}-system.snapshot`));
    if (metadata.byteLength !== snapshot.length) return stale("snapshot size mismatch");
    if (metadata.sha256 !== digest(snapshot)) return stale("snapshot digest mismatch");
    const parsed = decodeSystemSnapshot(snapshot), entry = verifyImage(image, parsed);
    if (JSON.stringify(metadata.entry) !== JSON.stringify(entry)) return stale("entry metadata mismatch");
    if (JSON.stringify(metadata.manifest) !== JSON.stringify(parsed.manifest)) return stale("manifest mismatch");
    return { action: "reuse", reason: `${metadata.sha256.slice(0, 16)}…`, metadata };
  } catch (error) {
    return { action: "build", reason: error.code === "ENOENT"
      ? `missing ${error.path?.split("/").at(-1) ?? "snapshot metadata"}` : `invalid artifact: ${error.message}` };
  }
}

async function buildImage(image, inputs) {
  const snapshotPath = resolve(projectDir, `dist/dolly-${image}-system.snapshot`);
  const temporarySnapshotPath = resolve(
    projectDir, `dist/.dolly-${image}-system.snapshot.${process.pid}.tmp`,
  );
  const temporaryMetadataPath = resolve(
    projectDir, `dist/.dolly-${image}-system-snapshot.${process.pid}.mjs.tmp`,
  );
  await Promise.all([
    rm(temporarySnapshotPath, { force: true }),
    rm(temporaryMetadataPath, { force: true }),
  ]);
  try {
    const started = performance.now();
    await runSnapshotBuild(image, temporarySnapshotPath);
    const observedInputs = JSON.parse(await readFile(`${temporarySnapshotPath}.inputs.json`, "utf8"));
    if (!imageInputsMatch(observedInputs, inputs)) throw new Error(`${image}: build used different image inputs`);
    const snapshot = await readFile(temporarySnapshotPath);
    const parsed = decodeSystemSnapshot(snapshot);
    const recipes = expectedRecipes(image);
    const entry = verifyImage(image, parsed);
    const sha256 = digest(snapshot);
    const metadata = `// Generated by scripts/build-system-snapshot.mjs.\n` +
      `export const DOLLY_SYSTEM_SNAPSHOT = Object.freeze(${JSON.stringify({
        image,
        buildId: DOLLY_IMAGE_BUILD_ID,
        runtimeBuildId: DOLLY_BUILD_ID,
        formatVersion: 2,
        identityVersion: 2,
        inputs,
        recipes,
        modules: expectedModules(image),
        entry,
        manifest: parsed.manifest,
        byteLength: snapshot.length,
        sha256,
      }, null, 2)});\n`;
    await writeFile(temporaryMetadataPath, metadata);
    await rename(temporarySnapshotPath, snapshotPath);
    await rename(temporaryMetadataPath, metadataPath(image));
    console.log(
      `dolly: packaged ${snapshot.length} byte ${image} snapshot ` +
      `(${sha256.slice(0, 16)}…) in ${((performance.now() - started) / 1000).toFixed(1)}s for ${DOLLY_BUILD_ID}`,
    );
  } finally {
    await Promise.all([
      rm(`${temporarySnapshotPath}.inputs.json`, { force: true }),
      rm(temporarySnapshotPath, { force: true }),
      rm(temporaryMetadataPath, { force: true }),
    ]);
  }
}

const completed = new Map(), plan = new Map();
function inputsFor(image) {
  const references = graphs.get(image).artifacts;
  if (references.some(reference => !completed.has(reference.image))) return null;
  return imageInputs(references.map(reference => ({
    recipeSha256: reference.sha256, sha256: completed.get(reference.image).sha256,
  })));
}
console.log(`dolly: image plan for pinned recipes (${images.length} images)`);
for (const image of images) {
  const result = await inspectSnapshot(image, inputsFor(image));
  plan.set(image, result);
  if (result.metadata) completed.set(image, result.metadata);
  const pending = graphs.get(image).artifacts.filter(reference => !completed.has(reference.image));
  console.log(`  ${result.action.padEnd(5)} ${image}: ${result.reason}${result.action === "check"
    ? ` (${pending.map(reference => reference.image).join(", ")})` : ""}`);
}
console.log(`dolly: inspected image inputs and cached outputs in ${((performance.now() - started) / 1000).toFixed(1)}s`);
if (!planOnly) for (const image of images) {
  let result = plan.get(image);
  const inputs = inputsFor(image);
  if (inputs === null) throw new Error(`${image}: dependencies did not finish`);
  if (result.action === "check") {
    result = await inspectSnapshot(image, inputs);
    console.log(`dolly: ${result.action} ${image}: ${result.reason}`);
  }
  if (result.action !== "reuse") await buildImage(image, inputs);
  completed.set(image, result.metadata ?? await readMetadata(image));
}
