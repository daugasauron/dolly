#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, open, rm, stat } from "node:fs/promises";
import { resolve } from "node:path";

import { discoverImageDefinitions } from "./image-definitions.mjs";

const projectDir = resolve(import.meta.dirname, "..");
const definitions = await discoverImageDefinitions(projectDir);
const image = process.env.DOLLY_SNAPSHOT_IMAGE;
if (image === undefined || !definitions.some((definition) => definition.image === image)) {
  throw new Error(
    "set DOLLY_SNAPSHOT_IMAGE to one source-visible image before checking reproducibility",
  );
}

const snapshot = resolve(projectDir, `dist/dolly-${image}-system.snapshot`);
const first = resolve(
  projectDir,
  `dist/.dolly-${image}-reproducibility.${process.pid}.snapshot`,
);

function build() {
  return new Promise((resolveBuild, reject) => {
    const child = spawn(process.execPath, [
      resolve(projectDir, "scripts/build-system-snapshot.mjs"),
    ], {
      cwd: projectDir,
      env: { ...process.env, DOLLY_SNAPSHOT_IMAGE: image },
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (status, signal) => {
      if (status === 0) resolveBuild();
      else reject(new Error(
        `first-principles ${image} rebuild exited with ${
          signal ? `signal ${signal}` : `status ${status}`
        }`,
      ));
    });
  });
}

async function sha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function firstDifference(leftPath, rightPath, size) {
  const left = await open(leftPath, "r");
  const right = await open(rightPath, "r");
  const chunkSize = 1024 * 1024;
  const leftBytes = Buffer.allocUnsafe(chunkSize);
  const rightBytes = Buffer.allocUnsafe(chunkSize);
  try {
    for (let offset = 0; offset < size; offset += chunkSize) {
      const length = Math.min(chunkSize, size - offset);
      const [leftRead, rightRead] = await Promise.all([
        left.read(leftBytes, 0, length, offset),
        right.read(rightBytes, 0, length, offset),
      ]);
      if (leftRead.bytesRead !== length || rightRead.bytesRead !== length) return offset;
      for (let index = 0; index < length; index += 1) {
        if (leftBytes[index] !== rightBytes[index]) return offset + index;
      }
    }
    return -1;
  } finally {
    await Promise.all([left.close(), right.close()]);
  }
}

await rm(first, { force: true });
try {
  await build();
  await copyFile(snapshot, first);
  const firstStat = await stat(first);
  const firstDigest = await sha256(first);
  console.log(
    `dolly: first ${image} rebuild is ${firstStat.size} bytes (${firstDigest})`,
  );

  await build();
  const secondStat = await stat(snapshot);
  const secondDigest = await sha256(snapshot);
  if (firstStat.size !== secondStat.size) {
    throw new Error(
      `${image} snapshot is not reproducible: ${firstStat.size} versus ${secondStat.size} bytes`,
    );
  }
  if (firstDigest !== secondDigest) {
    const offset = await firstDifference(first, snapshot, firstStat.size);
    throw new Error(
      `${image} snapshot is not reproducible: ${firstDigest} versus ${secondDigest}; ` +
      `first differing byte ${offset}`,
    );
  }
  console.log(
    `dolly: two ${image} rebuilds are byte-identical (${firstStat.size} bytes, ${firstDigest})`,
  );
} finally {
  await rm(first, { force: true });
}
