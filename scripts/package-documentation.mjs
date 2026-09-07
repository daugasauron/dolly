#!/usr/bin/env node

import { copyFile, lstat, mkdir, readdir, readFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const linkedSources = new Set([
  "src/dolly.c", "src/dollyfile.c", "src/upload.c", "config/source-pins.sh", "config/zig-sdk-files.txt",
]);

export function documentationLinks(source) {
  return [...source.replace(/```[\s\S]*?```/g, "").matchAll(/\[[^\]\n]*\]\(([^\s)]+)\)/g)]
    .map(match => match[1].split(/[?#]/, 1)[0])
    .filter(path => path && !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(path));
}

export async function packageDocumentation(project, site, roots) {
  const pending = [...roots];
  const visited = new Set();
  while (pending.length) {
    const path = pending.pop();
    if (visited.has(path)) continue;
    const source = resolve(project, path);
    const destination = resolve(site, path);
    if (!source.startsWith(project + sep) || !destination.startsWith(site + sep)) {
      throw new Error(`documentation link escapes the site: ${path}`);
    }
    let alreadyPublished = false;
    try { alreadyPublished = (await lstat(destination)).isFile(); } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (!alreadyPublished && !linkedSources.has(path) &&
        !/^docs\/[a-z0-9-]+\.md$/.test(path) && path !== "abi/README.md") {
      throw new Error(`documentation links to an unpublished source: ${path}`);
    }
    if (!(await lstat(source)).isFile()) throw new Error(`documentation source is not a regular file: ${path}`);
    visited.add(path);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(source, destination);
    if (path.endsWith(".md")) {
      for (const link of documentationLinks(await readFile(source, "utf8"))) {
        const target = resolve(dirname(source), decodeURIComponent(link));
        if (!target.startsWith(project + sep)) throw new Error(`documentation link escapes the site: ${link}`);
        pending.push(target.slice(project.length + 1));
      }
    }
  }
  return visited;
}

export async function verifyDocumentationLinks(site) {
  const files = (await readdir(resolve(site, "docs"))).filter(path => path.endsWith(".md"))
    .map(path => `docs/${path}`);
  files.push("abi/README.md");
  for (const path of files) {
    for (const link of documentationLinks(await readFile(resolve(site, path), "utf8"))) {
      const target = resolve(site, dirname(path), decodeURIComponent(link));
      if (!target.startsWith(site + sep) || !(await lstat(target)).isFile()) {
        throw new Error(`${path}: unpublished documentation link ${link}`);
      }
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [project, site, ...roots] = process.argv.slice(2);
  if (!project || !site || !roots.length) throw new Error("usage: package-documentation.mjs PROJECT SITE DOCUMENT...");
  const files = await packageDocumentation(resolve(project), resolve(site), roots);
  console.log(`dolly: packaged ${files.size} linked documentation/source files`);
}
