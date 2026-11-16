#!/usr/bin/env node
// Assembles the directory one Cloudflare Pages deployment uploads: every
// published version from the archive, the new version exported from its sealed
// release, and the root files. Nothing is uploaded here.
import { MAX_SNAPSHOT_BYTES } from "../page/snapshot-records.mjs";
import { PARTS_MANIFEST_START, STATIC_PART_BYTES, staticMaxParts } from "../page/static-asset.mjs";

import { link, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { brotliCompress, constants } from "node:zlib";
import { compareVersions, releaseVersion, robotsText, versionName } from "./release-layout.mjs";
import { fileManifest, releaseFiles } from "./site-release.mjs";
import { sha256 } from "./sha256.mjs";
import { siteContentSecurityPolicy } from "./serve.mjs";

const compress = promisify(brotliCompress);

export async function refuseExisting(output) {
  try {
    await lstat(output);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  throw new Error(`export destination already exists: ${output}`);
}
// A published version never changes but by its one allowed addition (docs/deployment.md): a
// later deployment adds its showcase, agents/, which it had none of, and the link to it on its
// page, index.html. PUBLISHED and EXPORTED are its deployment.sha256 before and after.
export function refuseChange(name, published, exported) {
  const rows = list => new Map(list.trimEnd().split("\n").map(row => [row.slice(66), row.slice(0, 64)]));
  const before = rows(published), after = rows(exported);
  const own = path => path === "index.html" || path.startsWith("release/");
  const added = [...after.keys()].filter(path => !before.has(path) && !own(path));
  const refused = [...[...before].filter(([path, sha256]) => !own(path) && after.get(path) !== sha256).map(([path]) => `changed ${path}`),
    ...added.filter(path => !path.startsWith("agents/")).map(path => `added ${path}`)];
  if (refused.length || !added.length || [...before.keys()].some(path => path.startsWith("agents/"))) {
    throw new Error(`${name} is already published, and a published version only adds its showcase, agents/: ` +
      (refused.slice(0, 10).join(", ") || "it has one already, or this adds none"));
  }
}

// Pages' documented limits: 25 MiB a file, 20,000 files a deployment, and
// 100 rules of 2,000-character lines in _headers.
const fileLimit = 25 * 1024 * 1024;

export async function pagesAsset(bytes, path) {
  if (bytes.subarray(0, PARTS_MANIFEST_START.length).toString("latin1") === PARTS_MANIFEST_START) {
    throw new Error(`a page would read this file as a parts manifest: ${path}`);
  }
  if (bytes.length <= fileLimit) return { bytes, compressed: false };
  const snapshot = /^dist\/packs\/[0-9a-f]{64}\.snapshot\.gz$/.test(path);
  if (!snapshot && !path.startsWith("dist/static/") && path !== "dist/dolly.data") {
    throw new Error(`oversized browser asset requires a new delivery check: ${path}`);
  }
  if (!snapshot) {
    const encoded = await compress(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } });
    if (encoded.length <= fileLimit) return { bytes: encoded, compressed: true };
  }
  const parts = [];
  for (let offset = 0; offset < bytes.length; offset += STATIC_PART_BYTES) parts.push(bytes.subarray(offset, offset + STATIC_PART_BYTES));
  if (bytes.length > MAX_SNAPSHOT_BYTES || parts.length > staticMaxParts()) throw new Error(`multipart asset exceeds limits: ${path}`);
  return { compressed: false, parts, bytes: Buffer.from(JSON.stringify({ byteLength: bytes.length, sha256: sha256(bytes),
    parts: parts.map(part => ({ byteLength: part.length, sha256: sha256(part) })) })) };
}

// A version's deployment.headers: the headers its compressed files need, as
// _headers rules with paths relative to the version. A file in parts needs
// none: the page knows its manifest by its content.
export function versionHeaders(compressed) {
  return [...compressed].sort().map(path => {
    if (!/^dist\/(static\/[a-zA-Z0-9_./-]+|dolly\.data)$/.test(path)) throw new Error(`invalid Pages header path: ${path}`);
    // SOURCE artifacts are opaque downloads, not streaming browser modules.
    return `/${path}\n  Content-Encoding: br` +
      (path.startsWith("dist/static/") ? "\n  Content-Type: application/octet-stream" : "") + "\n";
  }).join("\n");
}

// The first version whose pages hold no inline script: from it on, a version's paths and the
// root's pages (the newest version's) get the site's Content-Security-Policy. The versions
// before it were deployed without one, and their pages need their inline scripts.
const firstWithPolicy = "v0.1.6";

// The root _headers for VERSIONS, each { name, paths, headers }: its files and
// its deployment.headers.
export function pagesHeaders(versions) {
  const policy = `  Content-Security-Policy: ${siteContentSecurityPolicy}`;
  const withPolicy = versions.map(({ name }) => name).filter(name => compareVersions(name, firstWithPolicy) >= 0);
  const rules = [
    "/*\n  Cross-Origin-Opener-Policy: same-origin\n  Cross-Origin-Embedder-Policy: require-corp\n  Cross-Origin-Resource-Policy: same-origin\n  Cache-Control: no-store",
    ...(withPolicy.length ? ["/", "/404.html", ...withPolicy.map(name => `/${name}/*`)] : []).map(path => `${path}\n${policy}`),
    // A published version never changes, so its files are immutable. Its pages
    // (a directory's address) are not: a removed version must stop loading.
    "/:version/*\n  ! Cache-Control\n  Cache-Control: public, max-age=31536000, immutable, no-transform",
    ...["/:version/*/", "/:version/"].map(path => `${path}\n  ! Cache-Control\n  Cache-Control: no-store`),
    "/:version/Dollyfile*\n  Content-Type: text/plain; charset=utf-8",
    "/:version/demos/*\n  Content-Type: text/plain; charset=utf-8",
  ];
  // Each rule a version needs, and how each version holding a file stores it:
  // by the rule its deployment.headers names, if any.
  const wanting = new Map(), storing = new Map();
  for (const { name, paths, headers } of versions) {
    const named = new Map();
    for (const rule of headers.trimEnd().split("\n\n").filter(Boolean)) {
      // No splat or placeholder: a rule names one file.
      if (!/^\/[A-Za-z0-9_.\/-]+(\n  [A-Za-z-]+: [A-Za-z0-9\/ -]+)+$/.test(rule)) throw new Error(`${name}: invalid deployment.headers`);
      wanting.set(rule, [...wanting.get(rule) ?? [], name]);
      named.set(rule.slice(0, rule.indexOf("\n")), rule);
    }
    for (const path of paths) {
      storing.set(`/${path}`, [...storing.get(`/${path}`) ?? [], named.get(`/${path}`)]);
    }
  }
  // One rule serves a file in every version when all that hold the file store
  // it the same way; otherwise each version that needs the rule names its own.
  for (const [rule, names] of [...wanting].sort()) {
    const everyHolder = storing.get(rule.slice(0, rule.indexOf("\n")))?.every(stored => stored === rule);
    rules.push(...everyHolder ? [`/:version${rule}`] : names.map(name => `/${name}${rule}`));
  }
  const text = rules.join("\n\n") + "\n";
  if (rules.length > 100 || text.split("\n").some(line => line.length > 2000)) {
    throw new Error(`Pages' 100 header rules exceeded: ${versions.map(({ name }) => name).join(", ")} need ${rules.length}; ` +
      "remove a published version explicitly");
  }
  return text;
}

// A sealed release as Pages stores it: every file at its own path, those over
// 25 MiB compressed or in parts, the headers those need, and the list of all. A
// file stored whole is a hard link to the release's own, which nothing writes in
// place, so the export takes no space of its own (a copy of 0.1.7 filled the disk).
async function exportVersion(site, directory) {
  const written = [], compressed = [];
  async function write(path, bytes, sealed) {
    await mkdir(dirname(resolve(directory, path)), { recursive: true });
    if (sealed) await link(await realpath(resolve(site, path)), resolve(directory, path));
    else await writeFile(resolve(directory, path), bytes, { flag: "wx" });
    written.push(path);
  }
  for await (const [path, bytes] of releaseFiles(site)) {
    const asset = await pagesAsset(bytes, path);
    if (asset.compressed) compressed.push(path);
    for (const [index, part] of asset.parts?.entries() ?? []) await write(`${path}.part-${index}`, part, false);
    await write(path, asset.bytes, asset.bytes === bytes);
  }
  await write("deployment.headers", versionHeaders(compressed));
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
      const name = releaseVersion(await readFile(resolve(site, "page/version.mjs"), "utf8"));
      // A published version's later deployment is exported beside it, then takes its place.
      const published = versions.has(name) && await readFile(resolve(archive, name, "deployment.sha256"), "utf8");
      const directory = resolve(published ? staging : destination, name);
      versions.set(name, await exportVersion(site, directory));
      if (published) {
        refuseChange(name, published, await readFile(resolve(directory, "deployment.sha256"), "utf8"));
        await rm(resolve(destination, name), { recursive: true });
        await rename(directory, resolve(destination, name));
      }
    }
    const names = [...versions.keys()].sort(compareVersions), newest = names.at(-1);
    if (!newest) throw new Error("no version to deploy");
    const published = path => readFile(resolve(destination, path), "utf8");
    const root = {
      // An agent asking for /llms.txt is led to the newest version's, whose links are relative to it.
      "_redirects": `/ /${newest}/ 302\n/llms.txt /${newest}/llms.txt 302\n`,
      "_headers": pagesHeaders(await Promise.all(names.map(async name =>
        ({ name, paths: versions.get(name), headers: await published(`${name}/deployment.headers`) })))),
      "404.html": await published(`${newest}/404.html`),
      "robots.txt": robotsText(await published(`${newest}/llms.txt`), names),
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
