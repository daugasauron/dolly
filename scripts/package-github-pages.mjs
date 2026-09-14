#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export async function packageGithubPages(site) {
  const template = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const index = resolve(site, "index.html");
  let menu = await readFile(index, "utf8");
  const rows = [];
  for (const image of ["dollyfile-studio", "pi-local"]) {
    if (menu.includes(`data-image="${image}"`)) throw Error(`${image} is already packaged locally`);
    const row = template.match(new RegExp(`<tr class="image" data-image="${image}">[\\s\\S]*?<\\/tr>`))?.[0];
    if (!row) throw Error(`missing menu row for ${image}`);
    rows.push(row.replaceAll('href="./', 'href="https://daugasauron.com/')
      .replace('<td class="description">', '<td class="description">Hosted on daugasauron.com. '));
    for (const route of [image, `${image}/rebuild`, `view/${image}`]) {
      const target = `https://daugasauron.com/${route}/`;
      await mkdir(resolve(site, route), { recursive: true });
      await writeFile(resolve(site, route, "index.html"), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${image} · Dolly</title>
<script>location.replace(${JSON.stringify(target)} + location.search + location.hash);</script></head>
<body><p><a href="${target}">Open ${image} on daugasauron.com →</a></p></body></html>\n`);
    }
  }
  const marker = '<tr class="group">';
  if (!menu.includes(marker)) throw Error("index is missing the build image section");
  await writeFile(index, menu.replace(marker, rows.join("\n") + "\n" + marker));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) throw Error("usage: package-github-pages.mjs STAGED_SITE");
  await packageGithubPages(process.argv[2]);
}
