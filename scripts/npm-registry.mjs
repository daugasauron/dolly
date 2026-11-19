#!/usr/bin/env node
// An npm registry of a directory of package tarballs, as npmjs serves them: a name's document
// lists each of its tarballs, and its latest is its version that is no prerelease.
//   node scripts/npm-registry.mjs DIR   serves DIR on 127.0.0.1 (DOLLY_PORT, default 4873) and
//                                       sends every other name to npmjs: a release candidate's
//                                       packages, installed as from npmjs before they are published
// test/npm-browser.mjs serves its packages offline with it.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export async function registryPackages(directory) {
  const tarballs = [];
  for (const file of (await readdir(directory)).filter(name => name.endsWith(".tgz"))) {
    const manifest = JSON.parse(execFileSync("tar", ["-xzOf", join(directory, file), "package/package.json"], { encoding: "utf8" }));
    tarballs.push({ manifest, file, bytes: await readFile(join(directory, file)) });
  }
  const latest = new Map(tarballs.filter(({ manifest }) => !manifest.version.includes("-"))
    .map(tarball => [tarball.manifest.name, tarball]));
  return { tarballs, latest };
}

// What npm asks a registry for these packages, their documents and tarballs, at ORIGIN();
// any other request is OTHER's.
export function registryHandler({ tarballs, latest }, origin, other = (request, response) => response.writeHead(404).end()) {
  return (request, response) => {
    const path = decodeURIComponent(new URL(request.url, "http://x").pathname).slice(1);
    const tarball = tarballs.find(({ file }) => path === `-/${file}`);
    if (tarball) return response.writeHead(200, { "content-type": "application/octet-stream" }).end(tarball.bytes);
    if (!latest.has(path)) return other(request, response);
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({
      name: path, "dist-tags": { latest: latest.get(path).manifest.version },
      versions: Object.fromEntries(tarballs.filter(({ manifest }) => manifest.name === path).map(({ manifest, file, bytes }) =>
        [manifest.version, { ...manifest, dist: { tarball: `${origin()}/-/${file}`,
          shasum: createHash("sha1").update(bytes).digest("hex"),
          integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}` } }])),
    }));
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const directory = process.argv[2];
  if (!directory) {
    console.error("usage: node scripts/npm-registry.mjs DIR");
    process.exit(64);
  }
  const port = Number(process.env.DOLLY_PORT ?? 4873), origin = `http://127.0.0.1:${port}`;
  const packages = await registryPackages(directory);
  // npm asks this registry for npmjs's tarballs too, by their npmjs paths.
  const npmjs = (request, response) => response.writeHead(302, { location: `https://registry.npmjs.org${request.url}` }).end();
  createServer(registryHandler(packages, () => origin, npmjs)).listen(port, "127.0.0.1", () =>
    console.log(`dolly: the ${packages.latest.size} packages of ${directory}, any other from npmjs: npm_config_registry=${origin}/`));
}
