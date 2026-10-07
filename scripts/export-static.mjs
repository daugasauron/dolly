#!/usr/bin/env node

import { chmod, lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { fileManifest, releaseVersion, verifyRelease } from "./site-release.mjs";
import { deploymentBase, publicFiles, renderReleasePage, snapshotPackPath } from "./release-layout.mjs";
import { sha256 } from "./snapshot-identity.mjs";

export async function refuseExisting(output) {
  try {
    await lstat(output);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  throw new Error(`export destination already exists: ${output}`);
}

// One sealed release as static files served under BASE.
export async function exportStaticSite(site, output, base = "/") {
  deploymentBase(base);
  site = resolve(site);
  output = resolve(output);
  await refuseExisting(output);
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
      } else if (publicFiles.includes(path)) {
        await write(path, bytes);
      }
    }
    await write("deployment.sha256", await fileManifest(staging, [...written]));
    // mkdtemp makes a private directory; a host serves only what it may read.
    await chmod(staging, 0o755);
    await rename(staging, output);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  return digest;
}

// What a host of one version carries: the release under PREFIX/vX.Y.Z/ and a
// page at PREFIX/ that leads there.
export async function exportVersionedSite(site, output, prefix = "/") {
  deploymentBase(prefix);
  output = resolve(output);
  await refuseExisting(output);
  const version = releaseVersion(await readFile(resolve(site, "src/version.mjs"), "utf8"));
  const staging = await mkdtemp(resolve(dirname(output), ".dolly-versioned-"));
  try {
    const digest = await exportStaticSite(site, resolve(staging, version), `${prefix}${version}/`);
    await writeFile(resolve(staging, "index.html"), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=${version}/"><title>Dolly</title></head>
<body><p><a href="${version}/">Dolly ${version.slice(1)} →</a></p></body></html>\n`);
    await chmod(staging, 0o755);
    await rename(staging, output);
    return { version, release: digest };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [site, output, prefix] = process.argv.slice(2);
  if (!site || !output) throw new Error("usage: export-static.mjs VERIFIED_RELEASE NEW_DIRECTORY [PUBLIC_PREFIX]");
  const { version, release } = await exportVersionedSite(site, output, prefix);
  console.log(`dolly: exported ${version} (release ${release}) to ${resolve(output)}`);
}
