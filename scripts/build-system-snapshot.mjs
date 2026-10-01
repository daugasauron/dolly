#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { availableParallelism, freemem } from "node:os";
import { resolve } from "node:path";
import { createInterface } from "node:readline";

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
import { ensureSnapshotPacks } from "./share-pages-snapshots.mjs";

const projectDir = resolve(import.meta.dirname, "..");
const planOnly = process.argv[2] === "--plan";
if (process.argv.length > 3 || (process.argv[2] !== undefined && !planOnly)) {
  throw new Error("usage: build-system-snapshot.mjs [--plan]");
}
// Each image build is one headless Chrome using about one core. Most peak below
// 5 GB, the largest catalog image at 17 GB (PSS, measured 2026-10-01): budget 10 GiB each.
const jobs = Number(process.env.DOLLY_IMAGE_JOBS ??
  Math.max(1, Math.min(availableParallelism(), Math.floor(freemem() / 10 / 2 ** 30))));
if (!Number.isSafeInteger(jobs) || jobs < 1) throw new Error("DOLLY_IMAGE_JOBS must be a positive integer");
const started = performance.now();
const loadGraph = createDollyfileGraphLoader(projectDir);
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

// Each concurrent builder needs its own Chrome profile; the port follows it.
function runSnapshotBuild(image, output, builder) {
  return new Promise((resolveBuild, reject) => {
    const env = { ...process.env, DOLLY_BROWSER_PROFILE: resolve(projectDir, `.cache/snapshot-browser-profile-${builder}`) };
    const child = spawn(process.execPath, [resolve(projectDir, "scripts/build-snapshot-browser.mjs"), image, output], {
      cwd: projectDir, env, stdio: ["ignore", "pipe", "pipe"],
    });
    const log = createWriteStream(resolve(projectDir, `build/image-logs/${image}.log`));
    for (const [stream, terminal] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
      stream.pipe(log, { end: false });
      createInterface({ input: stream, crlfDelay: Infinity }).on("line", line => terminal.write(`[${image}] ${line}\n`));
    }
    child.once("error", reject);
    child.once("close", (status, signal) => {
      log.end();
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
    if (JSON.stringify(metadata.hostRequirements ?? []) !== JSON.stringify(graphs.get(image).root.hostRequirements)) return stale("host requirements changed");
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

async function buildImage(image, inputs, builder) {
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
    await runSnapshotBuild(image, temporarySnapshotPath, builder);
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
        hostRequirements: graphs.get(image).root.hostRequirements,
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
async function produce(image, builder) {
  const inputs = inputsFor(image);
  let result = plan.get(image);
  if (result.action === "check") {
    result = await inspectSnapshot(image, inputs);
    console.log(`dolly: ${result.action} ${image}: ${result.reason}`);
  }
  if (result.action !== "reuse") await buildImage(image, inputs, builder);
  const metadata = result.metadata ?? await readMetadata(image);
  const packed = await ensureSnapshotPacks(resolve(projectDir, "dist"), metadata);
  if (packed !== metadata) {
    const temporary = `${metadataPath(image)}.${process.pid}.tmp`;
    try {
      await writeFile(temporary, `// Generated snapshot manifest.\nexport const DOLLY_SYSTEM_SNAPSHOT = Object.freeze(${JSON.stringify(packed, null, 2)});\n`);
      await rename(temporary, metadataPath(image));
    } finally { await rm(temporary, { force: true }); }
  }
  completed.set(image, packed);
}

// Start each image once its dependencies are complete, at most `jobs` at a
// time in plan order; a failure skips only the images that depend on it.
if (!planOnly) {
  await mkdir(resolve(projectDir, "build/image-logs"), { recursive: true });
  console.log(`dolly: building with ${jobs} concurrent browser${jobs === 1 ? "" : "s"}; logs in build/image-logs/`);
  const waiting = [...images], running = new Set(), idle = [...Array(jobs).keys()], done = new Set(), failed = [];
  while (waiting.length || running.size) {
    for (const image of [...waiting]) {
      const dependencies = graphs.get(image).artifacts.map(reference => reference.image);
      const blocked = dependencies.find(dependency => failed.includes(dependency));
      if (!blocked && (!idle.length || !dependencies.every(dependency => done.has(dependency)))) continue;
      waiting.splice(waiting.indexOf(image), 1);
      if (blocked) {
        console.log(`dolly: skipped ${image}: ${blocked} failed`);
        failed.push(image);
        continue;
      }
      const builder = idle.shift();
      const task = produce(image, builder).then(() => done.add(image), error => {
        console.error(`dolly: ${image} failed: ${error.message}`);
        failed.push(image);
      }).finally(() => { running.delete(task); idle.push(builder); });
      running.add(task);
    }
    if (running.size) await Promise.race(running);
    else if (waiting.length) throw new Error(`dependencies of ${waiting.join(", ")} did not finish`);
  }
  if (failed.length) {
    console.error(`dolly: ${failed.length} of ${images.length} images failed or were skipped: ${failed.join(", ")}`);
    process.exitCode = 1;
  }
}
