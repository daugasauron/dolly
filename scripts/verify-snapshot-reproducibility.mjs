#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, open, readFile, rm, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { discoverImageDefinitions } from "./image-definitions.mjs";
import { decodeSystemSnapshot } from "./system-snapshot-format.mjs";

function build({ projectDir, image, output, profile, port, state }) {
  return new Promise((resolveBuild, reject) => {
    // Always launch a browser build. Its server hides packaged snapshots;
    // only this owned profile can supply completed image artifacts.
    const child = spawn(resolve(projectDir, "scripts/test-browser.sh"), [], {
      cwd: projectDir,
      env: {
        ...process.env,
        DOLLY_IMAGE: image,
        DOLLY_BROWSER_MODE: "snapshot-unpackaged",
        DOLLY_SNAPSHOT_OUTPUT: output,
        DOLLY_BROWSER_PROFILE: profile,
        DOLLY_BROWSER_PORT: String(port),
        DOLLY_EXPECT_CACHE_STATE: state,
      },
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

export async function verifyReproducibility({ projectDir, image, runBuild = build }) {
  const scratch = await mkdtemp(resolve(projectDir, "dist/.snapshot-repro-"));
  const port = 20_000 + Number.parseInt(createHash("sha256").update(scratch).digest("hex").slice(0, 8), 16) % 20_000;
  const first = resolve(scratch, "cold-1.snapshot");
  try {
    let baseline;
    for (const [label, profileName, state] of [
      ["cold-1", "profile-1", "cold"],
      ["cold-2", "profile-2", "cold"],
      ["cached", "profile-1", "warm"],
    ]) {
      const output = resolve(scratch, `${label}.snapshot`);
      console.log(`dolly: running ${image} ${label} browser build`);
      await runBuild({ projectDir, image, output, profile: resolve(scratch, profileName), port, state });
      decodeSystemSnapshot(await readFile(output));
      const current = { size: (await stat(output)).size, digest: await sha256(output) };
      if (baseline && (baseline.size !== current.size || baseline.digest !== current.digest)) {
        const offset = await firstDifference(first, output, Math.min(baseline.size, current.size));
        throw new Error(`${image} ${label} snapshot differs from cold-1: ` +
          `${baseline.size}/${baseline.digest} versus ${current.size}/${current.digest}; first differing byte ${offset}`);
      }
      baseline ??= current;
      console.log(`dolly: ${label}: ${current.size} bytes (${current.digest})`);
    }
    console.log(`dolly: ${image}: two isolated cold builds and one cached build are byte-identical`);
    return baseline;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const projectDir = resolve(import.meta.dirname, "..");
  const definitions = await discoverImageDefinitions(projectDir);
  const image = process.env.DOLLY_SNAPSHOT_IMAGE;
  if (!definitions.some(definition => definition.image === image)) {
    throw new Error("set DOLLY_SNAPSHOT_IMAGE to one source-visible image before checking reproducibility");
  }
  await verifyReproducibility({ projectDir, image });
}
