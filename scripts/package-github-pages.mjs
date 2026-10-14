#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { imageDescriptions, menuBody, menuGroup, menuGroups } from "./image-menu.mjs";
import { discoverImageDefinitions } from "./image-definitions.mjs";
import { PUBLIC_ORIGIN, siteReference } from "../src/static-asset.mjs";

// Applications the domain publishes beyond GitHub Pages' catalog link there.
async function domainOnlyApplications(projectDir) {
  const catalog = async name => (await readFile(resolve(projectDir, "config", name), "utf8")).split("\n").filter(Boolean);
  const github = new Set(await catalog("github-pages-images.txt")), domain = new Set(await catalog("domain-pages-images.txt"));
  return (await discoverImageDefinitions(projectDir))
    .filter(({ image, parsed }) => domain.has(image) && !github.has(image) && parsed.role === "application");
}

export async function packageGithubPages(site) {
  const projectDir = resolve(import.meta.dirname, "..");
  const index = resolve(site, "index.html");
  const menu = await readFile(index, "utf8");
  // The domain serves each version under its own path and nothing beside it.
  const domain = new URL(PUBLIC_ORIGIN).host, hosted = PUBLIC_ORIGIN + siteReference("");
  const applications = await domainOnlyApplications(projectDir);
  const descriptions = await imageDescriptions(projectDir, applications);
  for (const { image } of applications) {
    if (menu.includes(`data-image="${image}"`)) throw Error(`${image} is already packaged locally`);
    for (const route of [image, `${image}/rebuild`, `view/${image}`]) {
      const target = `${hosted}${route}/`;
      await mkdir(resolve(site, route), { recursive: true });
      await writeFile(resolve(site, route, "index.html"), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${image} · Dolly</title>
<script>location.replace(${JSON.stringify(target)} + location.search + location.hash);</script></head>
<body><p><a href="${target}">Open ${image} on ${domain} →</a></p></body></html>\n`);
    }
  }
  const body = /<tbody>\n?([\s\S]*?)\n?<\/tbody>/.exec(menu);
  if (!body) throw Error("index is missing the image table");
  // Their group takes its place among the menu's groups, by its heading.
  const group = menuGroup(`Hosted on ${domain}`, applications.map(({ image, parsed }) =>
    ({ image, description: descriptions.get(image), parsed }))).replaceAll('href="./', `href="${hosted}`);
  await writeFile(index, menu.replace(body[0], () => `<tbody>\n${menuBody([...menuGroups(body[1]), group])}\n</tbody>`));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) throw Error("usage: package-github-pages.mjs STAGED_SITE");
  await packageGithubPages(process.argv[2]);
}
