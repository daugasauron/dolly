#!/usr/bin/env node
// The files of a site that open a saved session without a network: the pages of
// a session and of the list of saves, the page's and the Workers' code, the host
// modules and the kernel; no image, since a save is its whole filesystem, and
// not the compiler seed a root build starts from (dist/dolly.data). The
// page keeps them when a session is saved (site/offline.mjs), each checked
// against its SHA-256 here. Usage: offline-files.mjs SITE > SITE/dist/dolly-offline.json
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

const kept = path => /^sessions?\/index\.html$/.test(path) || /^(?:page|site)\/[^/]+\.(?:mjs|css|svg)$/.test(path) ||
  /^host\/.+\.(?:mjs|json)$/.test(path) || /^dist\/(?:dolly-images\.json|IosevkaTerm-SemiBold(?:\.woff2|-page\.woff))$/.test(path) ||
  (/^dist\/dolly(?:-[a-z0-9-]+)?\.(?:wasm|mjs)$/.test(path) && !path.endsWith("-system-snapshot.mjs"));

// The list of SITE's files among PATHS (by default every file under SITE), as
// the JSON the site serves at dist/dolly-offline.json: [[path, sha256]...], a
// page by its directory's address.
export async function offlineFiles(site, paths) {
  paths ??= (await readdir(site, { recursive: true, withFileTypes: true })).filter(entry => entry.isFile())
    .map(entry => relative(site, resolve(entry.parentPath, entry.name)));
  return `${JSON.stringify(await Promise.all([...paths].filter(kept).sort().map(async path =>
    [path.replace(/index\.html$/, ""), createHash("sha256").update(await readFile(resolve(site, path))).digest("hex")])))}\n`;
}

if (process.argv[1] === import.meta.filename) process.stdout.write(await offlineFiles(resolve(process.argv[2])));
