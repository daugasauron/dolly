#!/usr/bin/env node
// Writes the generated pages at their served paths in this checkout: the menu
// index.html (from menu.html), the licences page, a terminal.html page per
// route, the Dollyfile views and the package index amy-index.txt. Any static
// file server can then serve the checkout.

import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  discoverImageDefinitions,
  inspectStaticSources,
  selectImageDefinitions,
  writeImageRegistry,
} from "./image-definitions.mjs";
import { createDollyfileGraphLoader } from "./dollyfile-graph.mjs";
import { renderDollyfilePage } from "./render-dollyfile-view.mjs";
import { imageDescriptions, menuBody, menuGroup, pageRoutes } from "./image-menu.mjs";
import { bundleProcessWorker } from "./bundle-process-worker.mjs";
import { renderLicencesPage, upstreamInventory } from "./upstreams.mjs";
import { alphabetical } from "../src/alphabetical.mjs";
import { siteReference } from "../src/static-asset.mjs";

const projectDir = resolve(import.meta.dirname, "..");
await bundleProcessWorker(projectDir);
const loadGraph = createDollyfileGraphLoader(projectDir);
const template = await readFile(resolve(projectDir, "terminal.html"), "utf8");
const definitions = await selectImageDefinitions(await discoverImageDefinitions(projectDir));
const primaryImage = definitions.find(({ image }) => image === "default")?.image ??
  definitions[0].image;
const staticSources = await inspectStaticSources(projectDir, definitions);
const graphs = await Promise.all(definitions.map(async (definition) => ({
  definition,
  graph: await loadGraph(definition.filename),
})));
// An image opens when it has ENTRY and a display; otherwise it only builds.
const openable = new Set(graphs.filter(({ definition, graph }) =>
  definition.parsed.entry && graph.root.hostRequirements.includes("display@0")).map(({ definition }) => definition.image));
// A name that no longer opens, such as an application renamed to its package, keeps no page.
await Promise.all(definitions.filter(({ image }) => !openable.has(image))
  .map(({ image }) => rm(resolve(projectDir, image, "index.html"), { force: true })));
await writeImageRegistry(projectDir, definitions, staticSources);
const descriptions = await imageDescriptions(projectDir, definitions);
const described = definitions.map(({ image, parsed }) => ({ image, description: descriptions.get(image), parsed }));
const groups = [["application", "Applications"], ["package", "Packages"], ["toolchain", "Toolchains"]]
  .map(([role, heading]) => [heading, described.filter(({ parsed }) => parsed.role === role)])
  .filter(([, images]) => images.length).map(([heading, images]) => menuGroup(heading, images));
const menu = (await readFile(resolve(projectDir, "menu.html"), "utf8")).replaceAll("{{DOLLY_PRIMARY}}", primaryImage);
await writeFile(resolve(projectDir, "index.html"),
  menu.replace(/<tbody>[\s\S]*?<\/tbody>/, () => `<tbody>\n${menuBody(groups)}\n</tbody>`));
await mkdir(resolve(projectDir, "licences"), { recursive: true });
await writeFile(resolve(projectDir, "licences/index.html"),
  renderLicencesPage(menu, await upstreamInventory(projectDir, definitions)));
// The package index people and amy read: "NAME PATH SHA256 DESCRIPTION" per
// package, the INSTALL row's operands and the description the menu shows.
await writeFile(resolve(projectDir, "amy-index.txt"), definitions
  .filter(({ parsed }) => parsed.role === "package").sort((left, right) => alphabetical(left.image, right.image))
  .map(({ image, filename, source }) => `${image} ${siteReference(filename)} ` +
    `${createHash("sha256").update(source).digest("hex")} ${descriptions.get(image)}\n`)
  .join(""));
const routes = pageRoutes(definitions.map(({ image }) => ({ image, openable: openable.has(image) })), primaryImage);
for (const route of routes) {
  const output = resolve(projectDir, route.path);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, template
    .replaceAll("{{DOLLY_BASE}}", "../".repeat(route.path.split("/").length - 1))
    .replaceAll("{{DOLLY_IMAGE}}", route.image)
    .replaceAll("{{DOLLY_MODE}}", route.mode)
    .replaceAll("{{DOLLY_LOAD_SESSION}}", String(route.loadSession ?? false)));
}

const graphPages = graphs.map(({ definition, graph }) =>
  ({ path: `view/${definition.image}/index.html`, record: graph.root, graph }));
await rm(resolve(projectDir, "view"), { recursive: true, force: true });
for (const page of graphPages) {
  const output = resolve(projectDir, page.path);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, renderDollyfilePage(page.record, page.graph));
}

console.log(`dolly: generated ${routes.length + graphPages.length} static routes`);
