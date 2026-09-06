#!/usr/bin/env node

import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { cp, lstat, mkdir, mkdtemp, readdir, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import { contractDigest, validateBrowserImports } from "./dolly-abi.mjs";
import { loadDollyfileGraph, recipeRecords } from "./dollyfile-graph.mjs";
import { discoverImageDefinitions, imageRegistrySource, inspectStaticSources } from "./image-definitions.mjs";
import { sha256, verifySnapshotIdentity } from "./snapshot-identity.mjs";
import { decodeSystemSnapshot } from "./system-snapshot-format.mjs";
import { readWasmInterface } from "./wasm-interface.mjs";
import { verifyDocumentationLinks } from "./package-documentation.mjs";

// Generated metadata is data, not executable input to the release verifier.
export function parseGeneratedConstant(source, name) {
  if (!/^[A-Z][A-Z0-9_]*$/.test(name)) throw new Error("invalid constant name");
  const prefix = new RegExp(`^(?://[^\\n]*\\n)*export const ${name} = `);
  if (!prefix.test(source)) throw new Error(`invalid generated ${name}`);
  let value = source.replace(prefix, "").trim();
  if (!value.endsWith(";")) throw new Error(`invalid generated ${name}`);
  value = value.slice(0, -1);
  if (value.startsWith("Object.freeze(") && value.endsWith(")")) value = value.slice(14, -1);
  return JSON.parse(value);
}

function safePath(path) {
  if (!path || /[\\\r\n\0]/.test(path) || path.split("/").some(part => !part || part === "." || part === "..")) {
    throw new Error(`invalid release path: ${path}`);
  }
  return path;
}

export async function fileManifest(root, paths) {
  const lines = [];
  for (const path of [...paths].sort()) {
    const absolute = resolve(root, safePath(path));
    if (!(await lstat(absolute)).isFile()) throw new Error(`release input is not a regular file: ${path}`);
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(absolute)) hash.update(chunk);
    lines.push(`${hash.digest("hex")}  ${path}\n`);
  }
  return lines.join("");
}

async function siteFiles(root, prefix = "") {
  const paths = [];
  for (const entry of await readdir(resolve(root, prefix), { withFileTypes: true })) {
    const path = prefix + entry.name;
    if (path === "release/files.sha256" || path === "release/acceptance.txt") continue;
    if (entry.isDirectory()) paths.push(...await siteFiles(root, `${path}/`));
    else paths.push(path);
  }
  return paths;
}

export async function siteManifest(root) {
  return fileManifest(root, await siteFiles(root));
}

export async function sourceManifest(root) {
  const paths = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", ".",
    ":(exclude).pi/**", ":(exclude).pi-subagents/**", ":(exclude)work/**"], { cwd: root, encoding: "utf8" })
    .split("\0").filter(Boolean);
  return fileManifest(root, paths);
}

export async function verifySite(site) {
  await verifyDocumentationLinks(site);
  const constant = async (file, name) => parseGeneratedConstant(await readFile(resolve(site, "dist", file), "utf8"), name);
  const buildId = await constant("dolly-build-id.mjs", "DOLLY_BUILD_ID");
  const runtimeHash = createHash("sha256");
  for (const file of ["dolly.wasm", "dolly.data"]) {
    for await (const chunk of createReadStream(resolve(site, "dist", file))) runtimeHash.update(chunk);
  }
  if (buildId !== `sha256:${runtimeHash.digest("hex")}`) throw new Error("release runtime build ID mismatch");
  const processContract = await readWasmInterface(resolve(site, "dist/dolly-process-0.wasm"));
  const processDigest = await constant("dolly-process-abi.mjs", "DOLLY_PROCESS_ABI_DIGEST");
  if (processDigest !== Buffer.from(contractDigest(processContract)).toString("hex")) {
    throw new Error("release process ABI digest mismatch");
  }
  const browserContract = await readWasmInterface(resolve(site, "dist/dolly-browser-0.wasm"));
  const runtime = await readWasmInterface(resolve(site, "dist/dolly.wasm"));
  validateBrowserImports(browserContract.imports, runtime.imports);
  const definitions = await discoverImageDefinitions(site);
  const sources = await inspectStaticSources(site, definitions, resolve(site, "static"));
  if (await readFile(resolve(site, "dist/dolly-images.mjs"), "utf8") !==
      await imageRegistrySource(site, definitions, sources)) throw new Error("release image registry mismatch");
  for (const definition of definitions) {
    const image = definition.image;
    const graph = await loadDollyfileGraph(site, definition.filename);
    const metadata = await constant(`dolly-${image}-system-snapshot.mjs`, "DOLLY_SYSTEM_SNAPSHOT");
    if (metadata.image !== image || metadata.buildId !== buildId ||
        metadata.formatVersion !== 2 || metadata.identityVersion !== 2 ||
        !Number.isSafeInteger(metadata.byteLength) || metadata.byteLength < 16 ||
        metadata.byteLength > 512 * 1024 * 1024 ||
        ![undefined, "gzip"].includes(metadata.encoding)) throw new Error(`${image}: release snapshot identity mismatch`);
    let bytes = await readFile(resolve(site, `dist/dolly-${image}-system.snapshot${metadata.encoding ? ".gz" : ""}`));
    if (metadata.encoding === "gzip") {
      if (bytes.length !== metadata.encodedByteLength) throw new Error(`${image}: encoded snapshot size mismatch`);
      bytes = gunzipSync(bytes, { maxOutputLength: metadata.byteLength });
    }
    if (bytes.length !== metadata.byteLength || sha256(bytes) !== metadata.sha256) {
      throw new Error(`${image}: release snapshot digest mismatch`);
    }
    const parsed = decodeSystemSnapshot(bytes);
    const entry = verifySnapshotIdentity(definition, graph, parsed, processContract, processDigest);
    for (const [key, expected] of Object.entries({
      recipes: recipeRecords(graph),
      modules: graph.root.uses.map(({ location, sha256 }) => ({ location, sha256 })),
      entry, manifest: parsed.manifest,
    })) {
      if (JSON.stringify(metadata[key]) !== JSON.stringify(expected)) throw new Error(`${image}: release ${key} mismatch`);
    }
  }
  return definitions.map(({ image }) => image);
}

export async function verifyRelease(site, sourceRoot) {
  const manifest = await readFile(resolve(site, "release/files.sha256"), "utf8");
  if (manifest !== await siteManifest(site)) throw new Error("release file manifest mismatch");
  const images = await verifySite(site);
  const expected = `DOLLY-ACCEPTANCE 1\nfiles sha256:${sha256(manifest)}\n` +
    images.map(image => `PASS image-inventory ${image}\n`).join("");
  if (await readFile(resolve(site, "release/acceptance.txt"), "utf8") !== expected) {
    throw new Error("release browser acceptance is missing or belongs to different bytes");
  }
  if (sourceRoot) {
    const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: sourceRoot, encoding: "utf8" });
    if (await readFile(resolve(site, "release/source.commit"), "utf8") !== commit ||
        await readFile(resolve(site, "release/source.sha256"), "utf8") !== await sourceManifest(sourceRoot)) {
      throw new Error("release source does not match the selected checkout");
    }
  }
  return sha256(manifest);
}

export async function publishRelease(site, releases) {
  const digest = await verifyRelease(site);
  await mkdir(releases, { recursive: true });
  const temporary = await mkdtemp(resolve(releases, ".publish-"));
  try {
    const candidate = resolve(temporary, "site");
    await cp(site, candidate, { recursive: true, force: false, errorOnExist: true });
    if (await verifyRelease(candidate) !== digest) throw new Error("release changed while staging publication");
    const destination = resolve(releases, digest);
    try {
      await rename(candidate, destination);
    } catch (error) {
      if (!["EEXIST", "ENOTEMPTY"].includes(error.code) || await verifyRelease(destination) !== digest) throw error;
    }
    await symlink(digest, resolve(temporary, "current"));
    await rename(resolve(temporary, "current"), resolve(releases, "current"));
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
  return digest;
}

async function acceptSite(site, project) {
  const images = await verifySite(site);
  const manifest = await siteManifest(site);
  for (const image of images) {
    await new Promise((resolveRun, reject) => {
      const env = { ...process.env, DOLLY_IMAGE: image, DOLLY_BROWSER_MODE: "image-inventory", DOLLY_BROWSER_SITE: site };
      // Acceptance owns its profile and must visit these staged bytes, not an external app.
      for (const name of ["DOLLY_BROWSER_PAGE", "DOLLY_BROWSER_PROFILE", "DOLLY_BROWSER_PORT", "DOLLY_BUILD_IMAGES"]) delete env[name];
      const child = spawn(resolve(project, "scripts/test-browser.sh"), [], { cwd: project, env, stdio: "inherit" });
      child.once("error", reject);
      child.once("exit", (code, signal) => code === 0 ? resolveRun() :
        reject(new Error(`${image}: release browser acceptance failed (${signal ?? code})`)));
    });
  }
  if (await siteManifest(site) !== manifest) throw new Error("release changed during acceptance");
  await writeFile(resolve(site, "release/files.sha256"), manifest);
  await writeFile(resolve(site, "release/acceptance.txt"),
    `DOLLY-ACCEPTANCE 1\nfiles sha256:${sha256(manifest)}\n` +
    images.map(image => `PASS image-inventory ${image}\n`).join(""));
  await verifyRelease(site, project);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, directory, sourceDirectory] = process.argv.slice(2);
  if (!directory) throw new Error("usage: site-release.mjs source|accept|verify|publish SITE [PROJECT|RELEASES]");
  const site = resolve(directory);
  const project = sourceDirectory ? resolve(sourceDirectory) : undefined;
  if (command === "source" && project) {
    await mkdir(resolve(site, "release"), { recursive: true });
    await writeFile(resolve(site, "release/source.commit"),
      execFileSync("git", ["rev-parse", "HEAD"], { cwd: project, encoding: "utf8" }));
    await writeFile(resolve(site, "release/source.sha256"), await sourceManifest(project));
  } else if (command === "accept" && project) {
    await acceptSite(site, project);
  } else if (command === "verify") {
    console.log(`dolly: verified release ${await verifyRelease(site, project)}`);
  } else if (command === "publish" && project) {
    console.log(`dolly: published release ${await publishRelease(site, project)}`);
  } else throw new Error("usage: site-release.mjs source|accept|verify|publish SITE [PROJECT|RELEASES]");
}
