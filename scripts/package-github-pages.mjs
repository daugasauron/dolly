#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { imageDescriptions, menuRow } from "./image-menu.mjs";

export async function packageGithubPages(site) {
  const descriptions = await imageDescriptions(resolve(import.meta.dirname, ".."));
  const index = resolve(site, "index.html");
  const menu = await readFile(index, "utf8");
  const rows = ['<tr class="group"><th colspan="3">Hosted on daugasauron.com</th></tr>'];
  for (const image of ["dollyfile-studio", "pi-local", "zero-ad"]) {
    if (menu.includes(`data-image="${image}"`)) throw Error(`${image} is already packaged locally`);
    rows.push(menuRow(image, descriptions.get(image), true).replaceAll('href="./', 'href="https://daugasauron.com/'));
    for (const route of [image, `${image}/rebuild`, `view/${image}`]) {
      const target = `https://daugasauron.com/${route}/`;
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
