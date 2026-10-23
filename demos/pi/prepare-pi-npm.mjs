#!/usr/bin/env node
// node demos/pi/prepare-pi-npm.mjs: prints a directory holding the part of the
// npm registry that janis-install --registry reads to install Pi, made from
// package-lock.json, which pins Pi's tree: NAME/metadata.json with the locked
// versions as the tarballs' own package.json describe them, and the tarballs at
// NAME/-/FILE, each checked against the lock's integrity. Downloads stay in .cache/npm.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";

const projectDir = resolve(import.meta.dirname, "../..");
const lockText = readFileSync(resolve(projectDir, "package-lock.json"));
const lock = JSON.parse(lockText);
const output = resolve(projectDir, "build/generated", `pi-npm-${createHash("sha256").update(lockText).digest("hex").slice(0, 16)}`);
const cache = resolve(projectDir, ".cache/npm");
// npm's tarballs carry pax keywords of node-tar's that GNU tar reports and ignores.
const quiet = { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] };

// What npm installed for the project's dependencies; janis-install skips the optional ones a copy lacks.
const locked = Object.entries(lock.packages).filter(([path, entry]) => path && !entry.dev && !entry.optional)
  .map(([path, entry]) => ({ name: path.slice(path.lastIndexOf("node_modules/") + "node_modules/".length), ...entry }));

async function tarball({ name, version, resolved, integrity }) {
  const [, algorithm, digest] = /^(sha512)-(.+)$/.exec(integrity) ?? [];
  if (!algorithm) throw new Error(`${name}@${version}: no sha512 integrity in package-lock.json`);
  const path = `${cache}/${Buffer.from(digest, "base64").toString("hex")}.tgz`;
  if (!existsSync(path)) {
    const response = await fetch(resolved);
    if (!response.ok) throw new Error(`${resolved}: ${response.status}`);
    mkdirSync(cache, { recursive: true });
    writeFileSync(`${path}.part`, Buffer.from(await response.arrayBuffer()));
    renameSync(`${path}.part`, path);
  }
  if (createHash("sha512").update(readFileSync(path)).digest("base64") !== digest) throw new Error(`${path}: not ${integrity}`);
  return path;
}

if (!existsSync(output)) {
  const staging = `${output}.part`;
  rmSync(staging, { recursive: true, force: true });
  const documents = new Map();
  for (const entry of locked) {
    const archive = await tarball(entry), url = new URL(entry.resolved);
    const top = execFileSync("tar", ["-tzf", archive], quiet).split("\n").find(path => /^[^/]+\/package\.json$/.test(path));
    const { name, version, dependencies, optionalDependencies, peerDependencies, peerDependenciesMeta, bin, os, cpu, license, repository } =
      JSON.parse(execFileSync("tar", ["-xzOf", archive, top], quiet));
    if (name !== entry.name || version !== entry.version) throw new Error(`${entry.resolved}: holds ${name}@${version}`);
    const document = documents.get(name) ?? { name, "dist-tags": {}, versions: {} };
    document.versions[version] = { name, version, dependencies, optionalDependencies, peerDependencies, peerDependenciesMeta,
      bin, os, cpu, license, repository, dist: { integrity: entry.integrity, tarball: entry.resolved } };
    documents.set(name, document);
    mkdirSync(`${staging}${url.pathname.slice(0, url.pathname.lastIndexOf("/"))}`, { recursive: true });
    copyFileSync(archive, `${staging}${url.pathname}`);
  }
  for (const [name, document] of documents) writeFileSync(`${staging}/${name}/metadata.json`, `${JSON.stringify(document, null, 1)}\n`);
  renameSync(staging, output);
}
console.log(output);
