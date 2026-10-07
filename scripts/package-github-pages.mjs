#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { imageDescriptions, menuRow } from "./image-menu.mjs";
import { discoverImageDefinitions } from "./image-definitions.mjs";
import { DOLLY_VERSION } from "../src/version.mjs";

// Applications the domain publishes beyond GitHub Pages' catalog link there.
export async function domainOnlyApplications(projectDir) {
  const catalog = async name => (await readFile(resolve(projectDir, "config", name), "utf8")).split("\n").filter(Boolean);
  const github = new Set(await catalog("github-pages-images.txt"));
  const roles = new Map((await discoverImageDefinitions(projectDir)).map(({ image, parsed }) => [image, parsed.role]));
  return (await catalog("domain-pages-images.txt")).filter(image => !github.has(image) && roles.get(image) === "application");
}

export async function packageGithubPages(site) {
  const projectDir = resolve(import.meta.dirname, "..");
  const descriptions = await imageDescriptions(projectDir);
  const index = resolve(site, "index.html");
  const menu = await readFile(index, "utf8");
  const rows = ['<tr class="group"><th colspan="3">Hosted on daugasauron.com</th></tr>'];
  // The domain serves nothing outside a version: link the one released with this site.
  const domain = `https://daugasauron.com/v${DOLLY_VERSION}/`;
  for (const image of await domainOnlyApplications(projectDir)) {
    if (menu.includes(`data-image="${image}"`)) throw Error(`${image} is already packaged locally`);
    rows.push(menuRow(image, descriptions.get(image), true).replaceAll('href="./', `href="${domain}`));
    for (const route of [image, `${image}/rebuild`, `view/${image}`]) {
      const target = `${domain}${route}/`;
      await mkdir(resolve(site, route), { recursive: true });
      await writeFile(resolve(site, route, "index.html"), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${image} · Dolly</title>
<script>location.replace(${JSON.stringify(target)} + location.search + location.hash);</script></head>
<body><p><a href="${target}">Open ${image} on daugasauron.com →</a></p></body></html>\n`);
    }
  }
  if (!menu.includes("</tbody>")) throw Error("index is missing the image table");
  await writeFile(index, menu.replace("</tbody>", rows.join("\n") + "\n</tbody>"));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) throw Error("usage: package-github-pages.mjs STAGED_SITE");
  await packageGithubPages(process.argv[2]);
}
