#!/usr/bin/env node

import { lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { brotliCompress, constants } from "node:zlib";
import { exportStaticSite } from "./export-static.mjs";
import { fileManifest } from "./site-release.mjs";
import { sha256 } from "./snapshot-identity.mjs";

const compress = promisify(brotliCompress);
const fileLimit = 25 * 1024 * 1024;

export async function pagesAsset(bytes, path) {
  if (bytes.length <= fileLimit) return { bytes, compressed: false };
  if (path.endsWith(".snapshot.gz")) throw new Error(`snapshot pack exceeds Pages' 25 MiB limit: ${path}`);
  if (!path.includes("/static/") && !path.endsWith("/dist/dolly.data")) {
    throw new Error(`oversized browser asset requires a new delivery check: ${path}`);
  }
  const encoded = await compress(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } });
  if (encoded.length > fileLimit) throw new Error(`asset exceeds Pages' 25 MiB limit after Brotli: ${path}`);
  return { bytes: encoded, compressed: true };
}

export function pagesHeaders(compressed) {
  const rules = [
    "/*\n  Cross-Origin-Opener-Policy: same-origin\n  Cross-Origin-Embedder-Policy: require-corp\n  Cross-Origin-Resource-Policy: same-origin\n  Cache-Control: no-store",
    ...["/_dolly/*", "/dist/packs/*"].map(path => `${path}\n  ! Cache-Control\n  Cache-Control: public, max-age=31536000, immutable, no-transform`),
    "/_dolly/:release/Dollyfile*\n  Content-Type: text/plain; charset=utf-8",
    "/_dolly/:release/modules/*\n  Content-Type: text/plain; charset=utf-8",
    ...[...compressed].sort().map(path => {
      if (!/^_dolly\/[a-f0-9]{64}\/[a-zA-Z0-9_./-]+$/.test(path)) throw new Error(`invalid Pages header path: ${path}`);
      // SOURCE artifacts are opaque downloads, not streaming browser modules.
      return `/${path}\n  Content-Encoding: br` +
        (path.includes("/static/") ? "\n  Content-Type: application/octet-stream" : "");
    }),
  ];
  const text = rules.join("\n\n") + "\n";
  if (rules.length > 100 || text.split("\n").some(line => line.length > 2000)) {
    throw new Error("Pages header limits exceeded; no retained release was silently removed");
  }
  return text;
}

export async function exportCloudflarePages(site, output, retained = []) {
  output = resolve(output);
  try {
    await lstat(output);
    throw new Error("Pages export destination already exists");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  output = resolve(await realpath(dirname(output)), basename(output));
  const releases = await Promise.all([site, ...retained].map(path => realpath(path)));
  if (releases.some(path => output.startsWith(path + sep))) throw new Error("Pages export cannot modify a source release");
  const staging = await mkdtemp(resolve(dirname(output), ".dolly-pages-"));
  const destination = resolve(staging, "pages");
  try {
    await mkdir(destination);
    const files = new Map(), compressed = new Set();
    let current;
    for (const [index, release] of releases.entries()) {
      const exported = resolve(staging, "release");
      const digest = await exportStaticSite(release, exported);
      if (!index) current = digest;
      const manifest = await readFile(resolve(exported, "deployment.sha256"), "utf8");
      for (const row of manifest.trimEnd().split("\n")) {
        const path = row.slice(66), hash = row.slice(0, 64);
        if (index && !path.startsWith("_dolly/") && !path.startsWith("dist/packs/")) continue;
        if (files.has(path)) {
          if (files.get(path) !== hash) throw new Error(`conflicting immutable asset: ${path}`);
          continue;
        }
        if (files.size + 3 > 20000) throw new Error("Pages' 20,000-file limit exceeded; reduce retained releases explicitly");
        const original = await readFile(resolve(exported, path));
        if (sha256(original) !== hash) throw new Error(`static export changed: ${path}`);
        const asset = await pagesAsset(original, path);
        if (asset.compressed) compressed.add(path);
        await mkdir(dirname(resolve(destination, path)), { recursive: true });
        await writeFile(resolve(destination, path), asset.bytes, { flag: "wx" });
        files.set(path, hash);
      }
      await rm(exported, { recursive: true });
    }
    await writeFile(resolve(destination, "_headers"), pagesHeaders(compressed), { flag: "wx" });
    await writeFile(resolve(destination, "deployment.sha256"), await fileManifest(destination, [...files.keys(), "_headers"]), { flag: "wx" });
    await rename(destination, output);
    return { release: current, files: files.size + 2, compressed: compressed.size };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [site, output, ...retained] = process.argv.slice(2);
  if (!site || !output) throw new Error("usage: export-cloudflare-pages.mjs VERIFIED_RELEASE NEW_DIRECTORY [RETAINED_RELEASE ...]");
  console.log(await exportCloudflarePages(site, output, retained));
}
