#!/usr/bin/env node

import { chmod, lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { releaseFiles } from "./site-release.mjs";
import { releaseVersion } from "./release-layout.mjs";

export async function refuseExisting(output) {
  try {
    await lstat(output);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  throw new Error(`export destination already exists: ${output}`);
}

// What a host of one version carries: the sealed release, file for file, as
// vX.Y.Z/, and a page beside it that leads there. A page finds its files
// relative to itself, so the directory serves under any prefix.
export async function exportVersionedSite(site, output) {
  output = resolve(output);
  await refuseExisting(output);
  site = await realpath(site);
  output = resolve(await realpath(dirname(output)), basename(output));
  if (output.startsWith(site + sep)) throw new Error("static export cannot modify its source release");
  const version = releaseVersion(await readFile(resolve(site, "src/version.mjs"), "utf8"));
  const staging = await mkdtemp(resolve(dirname(output), ".dolly-static-"));
  try {
    for await (const [path, bytes] of releaseFiles(site)) {
      await mkdir(dirname(resolve(staging, version, path)), { recursive: true });
      await writeFile(resolve(staging, version, path), bytes, { flag: "wx" });
    }
    await writeFile(resolve(staging, "index.html"), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=${version}/"><title>Dolly</title></head>
<body><p><a href="${version}/">Dolly ${version.slice(1)} →</a></p></body></html>\n`);
    // mkdtemp makes a private directory; a host serves only what it may read.
    await chmod(staging, 0o755);
    await rename(staging, output);
    return version;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [site, output] = process.argv.slice(2);
  if (!site || !output) throw new Error("usage: export-static.mjs VERIFIED_RELEASE NEW_DIRECTORY");
  console.log(`dolly: exported ${await exportVersionedSite(site, output)} to ${resolve(output)}`);
}
