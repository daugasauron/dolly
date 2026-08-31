#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { discoverImageDefinitions } from "./image-definitions.mjs";

const projectDir = resolve(import.meta.dirname, "..");
const definitions = await discoverImageDefinitions(projectDir);
const definitionByImage = new Map(definitions.map((definition) => [definition.image, definition]));
const images = definitions.map((definition) => definition.image);
const decoder = new TextDecoder("utf-8", { fatal: true });

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function imageChain(image) {
  const result = [];
  const seen = new Set();
  let definition = definitionByImage.get(image);
  while (definition) {
    if (seen.has(definition.image)) throw new Error(`Dollyfile inheritance cycle at ${image}`);
    seen.add(definition.image);
    result.unshift(definition);
    if (!definition.extends) break;
    definition = definitionByImage.get(definition.extends);
    if (!definition) throw new Error(`Dollyfile parent ${result[0].extends} is missing`);
  }
  return result;
}

function expectedRecipes(image) {
  return imageChain(image).map((definition) => ({
    image: definition.image,
    path: `/${definition.filename}`,
    sha256: digest(definition.source),
  }));
}

function runSnapshotBuild(image, output) {
  return new Promise((resolveBuild, reject) => {
    const child = spawn(resolve(projectDir, "scripts/test-browser.sh"), [], {
      cwd: projectDir,
      env: {
        ...process.env,
        DOLLY_BROWSER_MODE: "snapshot-export",
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

function parseSnapshot(bytes) {
  if (bytes.length < 16 || bytes.length > 512 * 1024 * 1024 ||
      bytes.subarray(0, 8).toString("ascii") !== "DOLLYSNP" ||
      bytes.readUInt32LE(8) !== 1) {
    throw new Error("headless rebuild produced an invalid Dolly snapshot header");
  }
  const count = bytes.readUInt32LE(12);
  if (count === 0 || count > 100_000) throw new Error("snapshot has an invalid file count");
  let offset = 16;
  const files = new Map();
  for (let index = 0; index < count; index += 1) {
    if (offset > bytes.length - 12) throw new Error("snapshot record header is truncated");
    const pathLength = bytes.readUInt32LE(offset);
    const dataLength64 = bytes.readBigUInt64LE(offset + 4);
    offset += 12;
    if (pathLength === 0 || pathLength > 4096 ||
        dataLength64 > BigInt(512 * 1024 * 1024)) {
      throw new Error("snapshot record has invalid lengths");
    }
    const dataLength = Number(dataLength64);
    if (offset > bytes.length - pathLength - dataLength) {
      throw new Error("snapshot record is truncated");
    }
    const path = decoder.decode(bytes.subarray(offset, offset + pathLength));
    offset += pathLength;
    if (!path.startsWith("/") || files.has(path)) throw new Error(`invalid snapshot path ${path}`);
    files.set(path, bytes.subarray(offset, offset + dataLength));
    offset += dataLength;
  }
  if (offset !== bytes.length) throw new Error("snapshot has trailing bytes");
  const manifest = [...files.keys()];
  const sorted = [...manifest].sort();
  if (JSON.stringify(manifest) !== JSON.stringify(sorted)) {
    throw new Error("snapshot records are not sorted by path");
  }
  return { files, manifest };
}

function parseEntry(bytes) {
  if (!bytes || bytes.length < 16 || bytes.subarray(0, 8).toString("ascii") !== "DOLLYENT" ||
      bytes.readUInt32LE(8) !== 1) throw new Error("snapshot has an invalid ENTRY record");
  const count = bytes.readUInt32LE(12);
  if (count === 0 || count > 256) throw new Error("snapshot has an invalid ENTRY argc");
  let offset = 16;
  const entry = [];
  for (let index = 0; index < count; index += 1) {
    if (offset > bytes.length - 4) throw new Error("snapshot ENTRY is truncated");
    const length = bytes.readUInt32LE(offset);
    offset += 4;
    if (length === 0 || length > 4096 || offset > bytes.length - length) {
      throw new Error("snapshot ENTRY has an invalid argument");
    }
    entry.push(decoder.decode(bytes.subarray(offset, offset + length)));
    offset += length;
  }
  if (offset !== bytes.length || !entry[0].startsWith("/")) {
    throw new Error("snapshot ENTRY has invalid trailing data");
  }
  return entry;
}

function verifySnapshotIdentity(image, parsed, recipes) {
  const selected = decoder.decode(parsed.files.get("/etc/dolly/image") ?? new Uint8Array());
  if (selected !== image) throw new Error(`snapshot selected image ${selected}, expected ${image}`);
  const expectedLock = "DOLLY-RECIPES 1\n" +
    recipes.map((recipe) => `${recipe.path} ${recipe.sha256}\n`).join("");
  const actualLock = decoder.decode(
    parsed.files.get("/etc/dolly/recipes.lock") ?? new Uint8Array(),
  );
  if (actualLock !== expectedLock) throw new Error("snapshot recipe lock does not match source");
  for (const recipe of recipes) {
    const definition = definitionByImage.get(recipe.image);
    const embedded = parsed.files.get(`/etc/dolly/recipes/${recipe.image}.Dollyfile`);
    if (!embedded || digest(embedded) !== recipe.sha256 ||
        decoder.decode(embedded) !== definition.source) {
      throw new Error(`snapshot did not retain the exact ${definition.filename}`);
    }
  }
  const selectedRecipe = definitionByImage.get(image);
  const selectedBytes = parsed.files.get("/etc/dolly/Dollyfile");
  if (!selectedBytes || decoder.decode(selectedBytes) !== selectedRecipe.source) {
    throw new Error("snapshot canonical Dollyfile does not match the selected recipe");
  }
  return parseEntry(parsed.files.get("/etc/dolly/entry"));
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
    await runSnapshotBuild(image, temporarySnapshotPath);
    const snapshot = await readFile(temporarySnapshotPath);
    const parsed = parseSnapshot(snapshot);
    const recipes = expectedRecipes(image);
    const entry = verifySnapshotIdentity(image, parsed, recipes);
    const { DOLLY_BUILD_ID } = await import("../dist/dolly-build-id.mjs");
    const sha256 = digest(snapshot);
    const metadata = `// Generated by scripts/build-system-snapshot.mjs.\n` +
      `export const DOLLY_SYSTEM_SNAPSHOT = Object.freeze(${JSON.stringify({
        image,
        buildId: DOLLY_BUILD_ID,
        formatVersion: 1,
        identityVersion: 2,
        recipes,
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
