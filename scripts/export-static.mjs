#!/usr/bin/env node

import { lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { fileManifest, verifyRelease } from "./site-release.mjs";
import { deploymentBase, renderReleasePage, snapshotPackPath } from "./release-layout.mjs";
import { sha256 } from "./snapshot-identity.mjs";

export async function exportStaticSite(site, output, base = "/") {
  deploymentBase(base);
  site = resolve(site);
  output = resolve(output);
  try {
    await lstat(output);
    throw new Error("static export destination already exists");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  site = await realpath(site);
  output = resolve(await realpath(dirname(output)), basename(output));
  if (output.startsWith(site + sep)) throw new Error("static export cannot modify its source release");
  const digest = await verifyRelease(site);
  const manifest = await readFile(resolve(site, "release/files.sha256"), "utf8");
  if (sha256(manifest) !== digest) throw new Error("release changed before export");
  const files = new Map(manifest.trimEnd().split("\n").map(row => [row.slice(66), row.slice(0, 64)]));
  for (const path of ["release/files.sha256", "release/acceptance.txt"]) {
    files.set(path, sha256(await readFile(resolve(site, path))));
  }
  const staging = await mkdtemp(resolve(dirname(output), ".dolly-static-"));
  try {
    const written = new Set();
    async function write(path, bytes) {
      if (written.has(path)) throw new Error(`duplicate deployment path: ${path}`);
      written.add(path);
      await mkdir(dirname(resolve(staging, path)), { recursive: true });
      await writeFile(resolve(staging, path), bytes, { flag: "wx" });
    }
    for (const [path, expected] of files) {
      const bytes = await readFile(resolve(site, path));
      if (sha256(bytes) !== expected) throw new Error(`release changed during export: ${path}`);
      await write(snapshotPackPath.test(path) ? path : `_dolly/${digest}/${path}`, bytes);
      if (path.endsWith(".html")) {
        await write(path, renderReleasePage(bytes.toString("utf8"), path, digest, files, base));
      } else if (path === "coi-serviceworker.js" || path === ".nojekyll") {
        await write(path, bytes);
      }
    }
    await write("deployment.sha256", await fileManifest(staging, [...written]));
    await rename(staging, output);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  return digest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [site, output, base] = process.argv.slice(2);
  if (!site || !output) throw new Error("usage: export-static.mjs VERIFIED_RELEASE NEW_DIRECTORY [PUBLIC_BASE]");
  console.log(`dolly: exported static release ${await exportStaticSite(site, output, base)} to ${resolve(output)}`);
}
