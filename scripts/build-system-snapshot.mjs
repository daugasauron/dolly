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
import {
  decodeSnapshotEntry,
  decodeSnapshotEnvironment,
  decodeSystemSnapshot,
} from "./system-snapshot-format.mjs";

const projectDir = resolve(import.meta.dirname, "..");
const snapshotBrowserProfile = process.env.DOLLY_BROWSER_PROFILE ??
  resolve(projectDir, ".cache/snapshot-browser-profile");
const snapshotBrowserPort = process.env.DOLLY_BROWSER_PORT ?? String(
  20_000 + (Number.parseInt(
    createHash("sha256").update(projectDir).digest("hex").slice(0, 8), 16,
  ) % 20_000),
);
const definitions = selectImageDefinitions(await discoverImageDefinitions(projectDir));
const graphs = new Map(await Promise.all(definitions.map(async (definition) => [
  definition.image,
  await loadDollyfileGraph(projectDir, definition.filename),
])));
const definitionByImage = new Map(definitions.map((definition) => [definition.image, definition]));
const requestedImage = process.env.DOLLY_SNAPSHOT_IMAGE;
if (requestedImage !== undefined && !definitionByImage.has(requestedImage)) {
  throw new Error("DOLLY_SNAPSHOT_IMAGE must name a source-visible image");
}
const images = requestedImage === undefined
  ? [...definitions]
      .sort((left, right) => left.parsed.uses.length - right.parsed.uses.length)
      .map((definition) => definition.image)
  : [requestedImage];
const decoder = new TextDecoder("utf-8", { fatal: true });
const { DOLLY_BUILD_ID } = await import("../dist/dolly-build-id.mjs");

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

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

function verifySnapshotIdentity(image, parsed, recipes) {
  const selected = decoder.decode(parsed.files.get("/etc/dolly/image") ?? new Uint8Array());
  if (selected !== image) throw new Error(`snapshot selected image ${selected}, expected ${image}`);
  const expectedLock = "DOLLY-RECIPES 1\n" +
    recipes.map((recipe) => `${recipe.locator} ${recipe.sha256}\n`).join("");
  const actualLock = decoder.decode(
    parsed.files.get("/etc/dolly/recipes.lock") ?? new Uint8Array(),
  );
  if (actualLock !== expectedLock) throw new Error("snapshot recipe lock does not match source");
  const sourceByPath = new Map(
    graphs.get(image).records.map((record) => [`/${record.relative}`, record.source]),
  );
  for (const recipe of recipes) {
    const source = sourceByPath.get(recipe.sourcePath);
    const embedded = parsed.files.get(recipe.retainedPath);
    if (!embedded || digest(embedded) !== recipe.sha256 ||
        decoder.decode(embedded) !== source) {
      throw new Error(`snapshot did not retain the exact ${recipe.sourcePath}`);
    }
  }
  const selectedRecipe = definitionByImage.get(image);
  const selectedBytes = parsed.files.get("/etc/dolly/Dollyfile");
  if (!selectedBytes || decoder.decode(selectedBytes) !== selectedRecipe.source) {
    throw new Error("snapshot canonical Dollyfile does not match the selected recipe");
  }
  const environment = decodeSnapshotEnvironment(
    parsed.files.get("/etc/dolly/environment"),
  );
  const expectedEnvironment = [...graphs.get(image).exporters.values()]
    .map(({ exported }) => exported)
    .filter(({ type }) => type === "ENV");
  if (environment.size !== expectedEnvironment.length) {
    throw new Error("snapshot environment does not match image exports");
  }
  for (const exported of expectedEnvironment) {
    const [operation, appended] = exported.details;
    if (!environment.has(exported.name) ||
        (operation !== "APPEND" && environment.get(exported.name) !== operation) ||
        (operation === "APPEND" &&
         !environment.get(exported.name).split(":").includes(appended))) {
      throw new Error(`snapshot environment does not match ENV ${exported.name}`);
    }
  }
  return decodeSnapshotEntry(parsed.files.get("/etc/dolly/entry"));
}

async function buildImage(image) {
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
        const entry = verifySnapshotIdentity(image, parsed, expectedRecipes(image));
        if (metadata?.image === image &&
            metadata.buildId === DOLLY_BUILD_ID &&
            metadata.formatVersion === 1 && metadata.identityVersion === 2 &&
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
    await runSnapshotBuild(image, temporarySnapshotPath);
    const snapshot = await readFile(temporarySnapshotPath);
    const parsed = decodeSystemSnapshot(snapshot);
    const recipes = expectedRecipes(image);
    const entry = verifySnapshotIdentity(image, parsed, recipes);
    const sha256 = digest(snapshot);
    const metadata = `// Generated by scripts/build-system-snapshot.mjs.\n` +
      `export const DOLLY_SYSTEM_SNAPSHOT = Object.freeze(${JSON.stringify({
        image,
        buildId: DOLLY_BUILD_ID,
        formatVersion: 1,
        identityVersion: 2,
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
      `(${sha256.slice(0, 16)}…) for ${DOLLY_BUILD_ID}`,
    );
  } finally {
    await Promise.all([
      rm(temporarySnapshotPath, { force: true }),
      rm(temporaryMetadataPath, { force: true }),
    ]);
  }
}

for (const image of images) await buildImage(image);
