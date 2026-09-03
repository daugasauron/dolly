#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, rm, stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

import { discoverImageDefinitions } from "./image-definitions.mjs";

const projectDir = resolve(import.meta.dirname, "..");
const definitions = await discoverImageDefinitions(projectDir);
const definitionByImage = new Map(
  definitions.map((definition) => [definition.image, definition]),
);
const { DOLLY_BUILD_ID } = await import("../dist/dolly-build-id.mjs");

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function expectedRecipes(image) {
  const result = [];
  const seen = new Set();
  let definition = definitionByImage.get(image);
  while (definition) {
    if (seen.has(definition.image)) {
      throw new Error(`Dollyfile inheritance cycle at ${image}`);
    }
    seen.add(definition.image);
    result.unshift({
      image: definition.image,
      path: `/${definition.filename}`,
      sha256: digest(definition.source),
    });
    if (!definition.extends) break;
    definition = definitionByImage.get(definition.extends);
    if (!definition) throw new Error(`Dollyfile parent is missing for ${image}`);
  }
  return result;
}

async function fileDigest(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function removePair(snapshotPath, metadataPath, image, reason) {
  await Promise.all([
    rm(snapshotPath, { force: true }),
    rm(metadataPath, { force: true }),
  ]);
  console.log(`dolly: pruned stale ${image} snapshot (${reason})`);
}

for (const definition of definitions) {
  const { image } = definition;
  const snapshotPath = resolve(projectDir, `dist/dolly-${image}-system.snapshot`);
  const metadataPath = resolve(
    projectDir,
    `dist/dolly-${image}-system-snapshot.mjs`,
  );
  let snapshotMetadata;
  let snapshotStat;
  try {
    [snapshotStat] = await Promise.all([
      stat(snapshotPath),
      readFile(metadataPath),
    ]);
    const imported = await import(
      `${pathToFileURL(metadataPath).href}?build=${encodeURIComponent(DOLLY_BUILD_ID)}`
    );
    snapshotMetadata = imported.DOLLY_SYSTEM_SNAPSHOT;
  } catch (error) {
    if (error?.code === "ENOENT") {
      await Promise.all([
        rm(snapshotPath, { force: true }),
        rm(metadataPath, { force: true }),
      ]);
      continue;
    }
    await removePair(snapshotPath, metadataPath, image, "unreadable metadata");
    continue;
  }

  const recipes = expectedRecipes(image);
  let reason = null;
  if (snapshotMetadata?.image !== image) reason = "image mismatch";
  else if (snapshotMetadata.buildId !== DOLLY_BUILD_ID) reason = "runtime changed";
  else if (snapshotMetadata.byteLength !== snapshotStat.size) reason = "size mismatch";
  else if (JSON.stringify(snapshotMetadata.recipes) !== JSON.stringify(recipes)) {
    reason = "recipe changed";
  } else if (snapshotMetadata.sha256 !== await fileDigest(snapshotPath)) {
    reason = "digest mismatch";
  }

  if (reason) await removePair(snapshotPath, metadataPath, image, reason);
  else console.log(`dolly: retained current ${image} snapshot`);
}
