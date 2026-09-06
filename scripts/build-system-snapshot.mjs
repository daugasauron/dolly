#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  discoverImageDefinitions,
  selectImageDefinitions,
} from "./image-definitions.mjs";
import { loadDollyfileGraph, recipeRecords } from "./dollyfile-graph.mjs";
import { decodeSystemSnapshot } from "./system-snapshot-format.mjs";
import { sha256 as digest, verifySnapshotIdentity } from "./snapshot-identity.mjs";
import { readWasmInterface } from "./wasm-interface.mjs";
import { DOLLY_PROCESS_ABI_DIGEST } from "../dist/dolly-process-abi.mjs";
import { imageInputs, imageInputsMatch } from "../src/image-inputs.mjs";

const projectDir = resolve(import.meta.dirname, "..");
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
  await loadDollyfileGraph(projectDir, definition.filename),
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

async function buildImage(image) {
  const inputs = imageInputs(await Promise.all(graphs.get(image).artifacts.map(async reference => {
    const url = pathToFileURL(resolve(projectDir, `dist/dolly-${reference.image}-system-snapshot.mjs`));
    url.searchParams.set("inputs", String(Date.now()));
    const { DOLLY_SYSTEM_SNAPSHOT: metadata } = await import(url.href);
    return { recipeSha256: reference.sha256, sha256: metadata.sha256 };
  })));
  const snapshotPath = resolve(projectDir, `dist/dolly-${image}-system.snapshot`);
  const metadataPath = resolve(projectDir, `dist/dolly-${image}-system-snapshot.mjs`);
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
    if (process.env.DOLLY_FORCE_SNAPSHOT !== "1") {
      try {
        const metadataUrl = pathToFileURL(metadataPath);
        metadataUrl.searchParams.set("check", String(Date.now()));
        const { DOLLY_SYSTEM_SNAPSHOT: metadata } = await import(metadataUrl.href);
        const snapshot = await readFile(snapshotPath);
        const parsed = decodeSystemSnapshot(snapshot);
        const entry = verifyImage(image, parsed);
        if (metadata?.image === image &&
            metadata.buildId === DOLLY_BUILD_ID &&
            metadata.formatVersion === 2 && metadata.identityVersion === 2 &&
            imageInputsMatch(metadata.inputs, inputs) &&
            JSON.stringify(metadata.recipes) === JSON.stringify(expectedRecipes(image)) &&
            JSON.stringify(metadata.modules) === JSON.stringify(expectedModules(image)) &&
            JSON.stringify(metadata.entry) === JSON.stringify(entry) &&
            JSON.stringify(metadata.manifest) === JSON.stringify(parsed.manifest) &&
            metadata.byteLength === snapshot.length && metadata.sha256 === digest(snapshot)) {
          console.log(`dolly: ${image} snapshot is current (${metadata.sha256.slice(0, 16)}…)`);
          return;
        }
      } catch {
        // Missing, malformed, or stale output is rebuilt below.
      }
    }
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
        buildId: DOLLY_BUILD_ID,
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
    await rename(temporaryMetadataPath, metadataPath);
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

for (const image of images) await buildImage(image);
