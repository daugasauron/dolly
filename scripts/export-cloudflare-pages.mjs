#!/usr/bin/env node
// Assembles the directory one Cloudflare Pages deployment uploads: every
// published version from the archive, the new version exported from its sealed
// release, and the root files. Nothing is uploaded here.
import { MAX_SNAPSHOT_BYTES } from "../src/snapshot-records.mjs";
import { STATIC_PART_BYTES, staticMaxParts } from "../src/static-asset.mjs";

import { link, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { brotliCompress, constants } from "node:zlib";
import { exportStaticSite, refuseExisting } from "./export-static.mjs";
import { compareVersions, releaseVersion, versionName } from "./release-layout.mjs";
import { fileManifest } from "./site-release.mjs";
import { sha256 } from "./snapshot-identity.mjs";

const compress = promisify(brotliCompress);
// Pages' documented limits: 25 MiB a file, 20,000 files a deployment, and
// 100 rules of 2,000-character lines in _headers.
const fileLimit = 25 * 1024 * 1024;

export async function pagesAsset(bytes, path) {
  if (bytes.length <= fileLimit) return { bytes, compressed: false };
  const snapshot = /^dist\/packs\/[0-9a-f]{64}\.snapshot\.gz$/.test(path);
  if (!snapshot && !path.includes("/static/") && !path.endsWith("/dist/dolly.data")) {
    throw new Error(`oversized browser asset requires a new delivery check: ${path}`);
  }
  if (!snapshot) {
    const encoded = await compress(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } });
    if (encoded.length <= fileLimit) return { bytes: encoded, compressed: true };
    if (!path.includes("/static/") && !path.endsWith("/dist/dolly.data")) {
      throw new Error(`asset exceeds Pages' 25 MiB limit after Brotli: ${path}`);
    }
  }
  const parts = [];
  for (let offset = 0; offset < bytes.length; offset += STATIC_PART_BYTES) parts.push(bytes.subarray(offset, offset + STATIC_PART_BYTES));
  if (bytes.length > MAX_SNAPSHOT_BYTES || parts.length > staticMaxParts()) throw new Error(`multipart asset exceeds limits: ${path}`);
  return { compressed: false, parts, bytes: Buffer.from(JSON.stringify({ byteLength: bytes.length, sha256: sha256(bytes),
    parts: parts.map(part => ({ byteLength: part.length, sha256: sha256(part) })) })) };
}

// A version's deployment.headers: the headers its compressed and split files
// need, as _headers rules with paths relative to the version.
export function versionHeaders(compressed, multipart) {
  return [
    ...[...compressed].sort().map(path => {
      if (!/^_dolly\/[a-f0-9]{64}\/[a-zA-Z0-9_./-]+$/.test(path)) throw new Error(`invalid Pages header path: ${path}`);
      // SOURCE artifacts are opaque downloads, not streaming browser modules.
      return `/${path}\n  Content-Encoding: br` +
        (path.includes("/static/") ? "\n  Content-Type: application/octet-stream" : "");
    }),
    ...[...multipart].sort().map(path => {
      if (!/^(_dolly\/[a-f0-9]{64}\/dist\/(static\/[a-zA-Z0-9_./-]+|dolly\.data)|dist\/packs\/[a-f0-9]{64}\.snapshot\.gz)$/.test(path)) throw new Error(`invalid Pages multipart path: ${path}`);
      return `/${path}\n  X-Dolly-Parts: 1\n  Content-Type: application/octet-stream`;
    }),
  ].map(rule => `${rule}\n`).join("\n");
}

// The root _headers for VERSIONS, each { name, paths, headers }: its files and
// its deployment.headers. Versions name their release differently, so a file's
// rule matches it in any of them.
const anyRelease = path => path.replace(/^\/_dolly\/[0-9a-f]{64}\//, "/_dolly/:release/");
export function pagesHeaders(versions) {
  const rules = [
    "/*\n  Cross-Origin-Opener-Policy: same-origin\n  Cross-Origin-Embedder-Policy: require-corp\n  Cross-Origin-Resource-Policy: same-origin\n  Cache-Control: no-store",
    ...["/:version/_dolly/*", "/:version/dist/packs/*"].map(path => `${path}\n  ! Cache-Control\n  Cache-Control: public, max-age=31536000, immutable, no-transform`),
    "/:version/_dolly/:release/Dollyfile*\n  Content-Type: text/plain; charset=utf-8",
    "/:version/_dolly/:release/demos/*\n  Content-Type: text/plain; charset=utf-8",
  ];
  const wanting = new Map(), holding = new Map();
  for (const { name, paths, headers } of versions) {
    for (const path of paths) holding.set(anyRelease(`/${path}`), (holding.get(anyRelease(`/${path}`)) ?? 0) + 1);
    for (const block of headers.trimEnd().split("\n\n").filter(Boolean)) {
      // No splat or placeholder: a rule names one file.
      if (!/^\/[A-Za-z0-9_.\/-]+(\n  [A-Za-z-]+: [A-Za-z0-9\/ -]+)+$/.test(block)) throw new Error(`${name}: invalid deployment.headers`);
      const rule = anyRelease(block);
      wanting.set(rule, [...wanting.get(rule) ?? [], name]);
    }
  }
  // One rule serves a file in every version when all that hold the file need
  // the same headers; otherwise each version names its own.
  for (const [rule, names] of [...wanting].sort()) {
    const everyHolder = names.length === holding.get(rule.slice(0, rule.indexOf("\n")));
    rules.push(...everyHolder ? [`/:version${rule}`] : names.map(name => `/${name}${rule}`));
  }
  const text = rules.join("\n\n") + "\n";
  if (rules.length > 100 || text.split("\n").some(line => line.length > 2000)) {
    throw new Error(`Pages' 100 header rules exceeded: ${versions.map(({ name }) => name).join(", ")} need ${rules.length}; ` +
      "remove a published version explicitly");
  }
  return text;
}

// robots.txt works only at the root, so its rules name each version's paths.
export const pagesRobots = (source, names) =>
  source.replace(/^Disallow: \/(.*)$/gm, (_, path) => names.map(name => `Disallow: /${name}/${path}`).join("\n"));

// A sealed release as Pages stores it: files over 25 MiB compressed or in
// parts, the headers those need, and the list of every file.
async function exportVersion(site, name, directory, scratch) {
  await exportStaticSite(site, scratch, `/${name}/`);
  const written = [], compressed = [], multipart = [];
  async function write(path, bytes) {
    await mkdir(dirname(resolve(directory, path)), { recursive: true });
    await writeFile(resolve(directory, path), bytes, { flag: "wx" });
    written.push(path);
  }
  for (const row of (await readFile(resolve(scratch, "deployment.sha256"), "utf8")).trimEnd().split("\n")) {
    const path = row.slice(66);
    const asset = await pagesAsset(await readFile(resolve(scratch, path)), path);
    if (asset.compressed) compressed.push(path);
    if (asset.parts) {
      multipart.push(path);
      for (const [index, part] of asset.parts.entries()) await write(`${path}.part-${index}`, part);
    }
    await write(path, asset.bytes);
  }
  await rm(scratch, { recursive: true });
  await write("deployment.headers", versionHeaders(compressed, multipart));
  await writeFile(resolve(directory, "deployment.sha256"), await fileManifest(directory, written), { flag: "wx" });
  return written;
}

// ARCHIVE holds one directory per published version, as it was deployed, with
// its deployment.sha256. They enter the deployment as hard links; SITE, a
// sealed release of a version not yet published, is exported beside them.
export async function exportCloudflarePages(archive, output, site) {
  output = resolve(output);
  await refuseExisting(output);
  output = resolve(await realpath(dirname(output)), basename(output));
  for (const source of [archive, ...site ? [site] : []]) {
    if (output.startsWith(await realpath(source) + sep)) throw new Error("Pages export cannot modify its sources");
  }
  const staging = await mkdtemp(resolve(dirname(output), ".dolly-pages-"));
  const destination = resolve(staging, "pages");
  try {
    const versions = new Map();
    for (const name of await readdir(archive)) {
      if (!versionName.test(name)) throw new Error(`the archive holds something that is not a version: ${name}`);
      const manifest = await readFile(resolve(archive, name, "deployment.sha256"), "utf8");
      const paths = manifest.trimEnd().split("\n").map(row => row.slice(66));
      if (await fileManifest(resolve(archive, name), paths) !== manifest) throw new Error(`published ${name} differs from its deployment.sha256`);
      for (const path of [...paths, "deployment.sha256"]) {
        await mkdir(dirname(resolve(destination, name, path)), { recursive: true });
        await link(resolve(archive, name, path), resolve(destination, name, path));
      }
      versions.set(name, paths);
    }
    if (site) {
      const name = releaseVersion(await readFile(resolve(site, "src/version.mjs"), "utf8"));
      if (versions.has(name)) throw new Error(`${name} is already published, and a published version never changes`);
      versions.set(name, await exportVersion(site, name, resolve(destination, name), resolve(staging, "release")));
    }
    const names = [...versions.keys()].sort(compareVersions), newest = names.at(-1);
    if (!newest) throw new Error("no version to deploy");
    const published = path => readFile(resolve(destination, path), "utf8");
    const root = {
      "_redirects": `/ /${newest}/ 302\n`,
      "_headers": pagesHeaders(await Promise.all(names.map(async name =>
        ({ name, paths: versions.get(name), headers: await published(`${name}/deployment.headers`) })))),
      "404.html": await published(`${newest}/404.html`),
      "robots.txt": pagesRobots(await published(`${newest}/robots.txt`), names),
    };
    const counts = Object.fromEntries(names.map(name => [name, versions.get(name).length + 1]));
    const files = Object.keys(root).length + Object.values(counts).reduce((sum, count) => sum + count, 0);
    if (files > 20000) {
      throw new Error(`Pages' 20,000-file limit exceeded by ${files - 20000}: ` +
        `${names.map(name => `${name} has ${counts[name]} files`).join(", ")}; remove a published version explicitly`);
    }
    for (const [path, text] of Object.entries(root)) await writeFile(resolve(destination, path), text, { flag: "wx" });
    await rename(destination, output);
    return { newest, versions: counts, files, headerRules: root._headers.split("\n\n").length };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [archive, output, site] = process.argv.slice(2);
  if (!archive || !output) throw new Error("usage: export-cloudflare-pages.mjs ARCHIVE NEW_DIRECTORY [VERIFIED_RELEASE]");
  console.log(await exportCloudflarePages(archive, output, site));
}
