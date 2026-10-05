#!/usr/bin/env node
// Writes the generated pages at their served paths in this checkout: the menu
// index.html (from menu.html), the licences page, a terminal.html page per
// route, the Dollyfile views and the package index. Any static file server can
// then serve the checkout.

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
import { imageDescriptions, menuRow, pageRoutes } from "./image-menu.mjs";
import { bundleProcessWorker } from "./bundle-process-worker.mjs";
import { renderLicencesPage, upstreamInventory } from "./upstreams.mjs";
import { CANONICAL_ORIGIN } from "../src/static-asset.mjs";

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
await writeImageRegistry(projectDir, definitions, staticSources);
const descriptions = await imageDescriptions(projectDir);
// Applications (default first), then toolchains by directory, then packages.
const roles = [["application", "Applications"], ["toolchain", "Toolchains"], ["package", "Packages"]];
const rank = ({ image, parsed, filename }) =>
  [roles.findIndex(([role]) => role === parsed.role), image === "default" ? "" : dirname(filename), image];
const ordered = [...definitions].sort((a, b) => {
  const [left, right] = [rank(a), rank(b)];
  return left[0] - right[0] || left[1].localeCompare(right[1], "en") || left[2].localeCompare(right[2], "en");
});
const rows = ordered.map((definition, index) => {
  const description = descriptions.get(definition.image);
  if (!description) throw new Error(`${definition.image}: describe it as "- \`${definition.image}\`: …" in its README`);
  const heading = ordered[index - 1]?.parsed.role === definition.parsed.role ? "" :
    `<tr class="group"><th colspan="3">${roles.find(([role]) => role === definition.parsed.role)[1]}</th></tr>\n`;
  return heading + menuRow(definition.image, description, openable.has(definition.image));
});
const menu = await readFile(resolve(projectDir, "menu.html"), "utf8");
await writeFile(resolve(projectDir, "index.html"),
  menu.replace(/<tbody>[\s\S]*?<\/tbody>/, () => `<tbody>\n${rows.join("\n")}\n</tbody>`));
await mkdir(resolve(projectDir, "licences"), { recursive: true });
await writeFile(resolve(projectDir, "licences/index.html"),
  renderLicencesPage(menu, await upstreamInventory(projectDir, definitions)));
// The package index amy reads: one "NAME URL SHA256" line per package.
await writeFile(resolve(projectDir, "dist/dolly-packages.txt"), definitions
  .filter(({ parsed }) => parsed.role === "package")
  .map(({ image, filename, source }) =>
    `${image} ${CANONICAL_ORIGIN}/${filename} ${createHash("sha256").update(source).digest("hex")}\n`)
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
