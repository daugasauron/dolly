#!/usr/bin/env node
import { cp, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export async function packageDomain(site) {
  const index = resolve(site, "index.html");
  const source = await readFile(index, "utf8");
  if (!source.includes("<!-- site-links -->")) throw Error("index is missing the site-links marker");
  await cp(new URL("../sites/daugasauron.com/agents", import.meta.url), resolve(site, "agents"),
    { recursive: true, force: false, errorOnExist: true });
  await writeFile(index, source.replace("<!-- site-links -->",
    '<p><a href="./agents/">Agents at play →</a></p>'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) throw Error("usage: package-domain.mjs STAGED_SITE");
  await packageDomain(process.argv[2]);
}
