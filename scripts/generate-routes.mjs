#!/usr/bin/env node
// Writes the generated pages at their served paths in SITE (default: this
// checkout): the menu index.html (from menu.html), the licences page, a
// terminal.html page per route, the Dollyfile views, the package index
// amy-index.txt, and dist/'s registry and recipe rows. Any static file server
// can then serve the checkout. usage: generate-routes.mjs [SITE]

import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

import {
  discoverImageDefinitions,
  inspectStaticSources,
  selectImageDefinitions,
  imageRegistryJson,
} from "./image-definitions.mjs";
import { createDollyfileGraphLoader } from "./dollyfile-graph.mjs";
import { renderDollyfilePage } from "./render-dollyfile-view.mjs";
import { imageDescriptions, menuBody, menuGroup, opens, pageRoutes } from "./image-menu.mjs";
import { bundleProcessWorker } from "./bundle-process-worker.mjs";
import { renderLicencesPage, upstreamInventory } from "./upstreams.mjs";
import { amyIndex } from "./image-directory.mjs";
import { recipeRows } from "../site/dollyfile-view.mjs";

const projectDir = resolve(import.meta.dirname, "..");
const site = resolve(process.argv[2] ?? projectDir);
await bundleProcessWorker(projectDir);
const loadGraph = createDollyfileGraphLoader(projectDir);
const template = await readFile(resolve(projectDir, "terminal.html"), "utf8");
// The modules a route imports first (site/route.mjs imports site/site.mjs), as
// static imports name them: fetched together, not a round trip a level.
async function moduleGraph(entry) {
  const seen = new Set(), queue = [entry];
  while (queue.length) {
    const path = queue.shift();
    if (seen.has(path)) continue;
    seen.add(path);
    const text = await readFile(resolve(projectDir, path), "utf8");
    for (const [, specifier] of text.matchAll(/^\s*(?:import|export)\b(?:[^;'"`]*?\bfrom)?\s*["']([^"']+\.mjs)["']/gm))
      queue.push(relative(projectDir, resolve(projectDir, dirname(path), specifier)));
  }
  return [...seen];
}
const preload = (await moduleGraph("site/site.mjs"))
  .map(path => `<link rel="modulepreload" href="{{DOLLY_BASE}}${path}">`).join("\n    ");
const definitions = await selectImageDefinitions(await discoverImageDefinitions(projectDir));
const primaryImage = definitions.find(({ image }) => image === "default")?.image ??
  definitions[0].image;
const staticSources = await inspectStaticSources(projectDir, definitions);
const graphs = await Promise.all(definitions.map(async (definition) => ({
  definition,
  graph: await loadGraph(definition.filename),
})));
const openable = new Set(definitions.filter(({ parsed }) => opens(parsed)).map(({ image }) => image));
// A name that no longer opens, such as an application renamed to its package, keeps no page.
await Promise.all(definitions.filter(({ image }) => !openable.has(image))
  .map(({ image }) => rm(resolve(site, image, "index.html"), { force: true })));
await mkdir(resolve(site, "dist"), { recursive: true });
await writeFile(resolve(site, "dist/dolly-images.json"), await imageRegistryJson(projectDir, definitions, staticSources));
const descriptions = await imageDescriptions(projectDir, definitions);
const described = definitions.map(({ image, parsed }) => ({ image, description: descriptions.get(image), parsed }));
const groups = [["application", "Applications"], ["package", "Packages"], ["toolchain", "Toolchains"]]
  .map(([role, heading]) => [heading, described.filter(({ parsed }) => parsed.role === role)])
  .filter(([, images]) => images.length).map(([heading, images]) => menuGroup(heading, images));
const menu = (await readFile(resolve(projectDir, "menu.html"), "utf8")).replaceAll("{{DOLLY_PRIMARY}}", primaryImage);
await writeFile(resolve(site, "index.html"),
  menu.replace(/<tbody>[\s\S]*?<\/tbody>/, () => `<tbody>\n${menuBody(groups)}\n</tbody>`));
await mkdir(resolve(site, "licences"), { recursive: true });
await writeFile(resolve(site, "licences/index.html"),
  renderLicencesPage(menu, await upstreamInventory(projectDir, definitions)));
await writeFile(resolve(site, "amy-index.txt"), amyIndex(definitions.filter(({ parsed }) => parsed.role === "package")
  .map(({ image, filename, source }) => ({ image, dollyfile: filename, sha256: createHash("sha256").update(source).digest("hex") })),
  descriptions));
// What the engine executes for each recipe (its recipe.rows), by the recipe's SHA-256: a host
// rebuilds a catalog image from them without a parser of its own.
await mkdir(resolve(site, "dist/rows"), { recursive: true });
await Promise.all(definitions.map(({ source, parsed }) => {
  const sha256 = createHash("sha256").update(source).digest("hex");
  return writeFile(resolve(site, `dist/rows/${sha256}.rows`), recipeRows(parsed, sha256));
}));
const routes = pageRoutes(definitions.map(({ image }) => ({ image, openable: openable.has(image) })), primaryImage);
for (const route of routes) {
  const output = resolve(site, route.path);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, template
    .replaceAll("{{DOLLY_PRELOAD}}", preload)
    .replaceAll("{{DOLLY_BASE}}", "../".repeat(route.path.split("/").length - 1))
    .replaceAll("{{DOLLY_IMAGE}}", route.image)
    .replaceAll("{{DOLLY_MODE}}", route.mode)
    .replaceAll("{{DOLLY_LOAD_SESSION}}", String(route.loadSession ?? false)));
}

const graphPages = graphs.map(({ definition, graph }) =>
  ({ path: `view/${definition.image}/index.html`, record: graph.root, graph }));
await rm(resolve(site, "view"), { recursive: true, force: true });
for (const page of graphPages) {
  const output = resolve(site, page.path);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, renderDollyfilePage(page.record, page.graph));
}

console.log(`dolly: generated ${routes.length + graphPages.length} static routes`);
if (process.env.DOLLY_BUILD_IMAGES && site === projectDir) {
  console.log(`dolly: dist registers the ${definitions.length} images of ${process.env.DOLLY_BUILD_IMAGES}'s closure; ` +
    "the artifact tests fail until a plain npm run image registers the catalog");
}
