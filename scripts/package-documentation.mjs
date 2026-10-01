#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { lstat, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const recipePath = /^Dollyfile(?:-[a-z][a-z0-9]*(?:-[a-z0-9]+|\.[0-9]+)*)?$/;
// Documentation examples are text, not additional images to build and publish.
const documentPath = path => recipePath.test(path) ? `${path}.txt` : path;

function mapLinks(source, transform) {
  return source.replace(/```[\s\S]*?```|\[([^\]\n]*)\]\(([^\s)]+)\)/g,
    (match, label, link) => label === undefined ? match : `[${label}](${transform(link)})`);
}

export function documentationLinks(source) {
  return [...source.replace(/```[\s\S]*?```/g, "").matchAll(/\[[^\]\n]*\]\(([^\s)]+)\)/g)]
    .map(match => match[1].split(/[?#]/, 1)[0])
    .filter(path => path && !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(path));
}

// Docs may link to any git-tracked text file outside demos/ (core docs never
// depend on demos), and never outside the project or the site.
function publishableFiles(project) {
  return new Set(execFileSync("git", ["ls-files", "-z"], { cwd: project, encoding: "utf8" })
    .split("\0").filter(path => path && !path.startsWith("demos/")));
}

export async function packageDocumentation(project, site, roots) {
  const publishable = publishableFiles(project);
  const pending = [...roots];
  const visited = new Set();
  while (pending.length) {
    const path = pending.pop();
    if (visited.has(path)) continue;
    const source = resolve(project, path);
    const destination = resolve(site, documentPath(path));
    if (!source.startsWith(project + sep) || !destination.startsWith(site + sep)) {
      throw new Error(`documentation link escapes the site: ${path}`);
    }
    if (!publishable.has(path)) throw new Error(`documentation links to an unpublished source: ${path}`);
    if (!(await lstat(source)).isFile()) throw new Error(`documentation source is not a regular file: ${path}`);
    const bytes = await readFile(source);
    if (bytes.includes(0)) throw new Error(`documentation links to a binary file: ${path}`);
    visited.add(path);
    await mkdir(dirname(destination), { recursive: true });
    if (!path.endsWith(".md")) {
      // A file the site already publishes keeps its staged bytes.
      await writeFile(destination, bytes, { flag: "wx" }).catch(error => {
        if (error.code !== "EEXIST") throw error;
      });
      continue;
    }
    const contents = bytes.toString("utf8");
    const replacements = new Map();
    for (const link of documentationLinks(contents)) {
      const target = resolve(dirname(source), decodeURIComponent(link));
      if (!target.startsWith(project + sep)) throw new Error(`documentation link escapes the site: ${link}`);
      const relative = target.slice(project.length + 1);
      pending.push(relative);
      if (recipePath.test(relative)) replacements.set(link, `${link}.txt`);
    }
    await writeFile(destination, mapLinks(contents, link => {
      const [path] = link.split(/[?#]/, 1);
      return replacements.has(path) ? replacements.get(path) + link.slice(path.length) : link;
    }));
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
