#!/usr/bin/env node
// Writes the generated pages at their served paths in this checkout: the menu
// index.html (from menu.html), a terminal.html page per route and the
// Dollyfile views. Any static file server can then serve the checkout.

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
import { imageDescriptions, menuRow } from "./image-menu.mjs";
import { bundleProcessWorker } from "./bundle-process-worker.mjs";

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
const headless = new Set(graphs.filter(({ graph }) => !graph.root.hostRequirements.includes("display@0"))
  .map(({ definition }) => definition.image));
await writeImageRegistry(projectDir, definitions, staticSources);
const descriptions = await imageDescriptions(projectDir);
// Runnable images first (default leading), then one build image section.
const isBuild = image => /-(build|sdk|runtime|tools)$/.test(image) || ["system", "ripgrep"].includes(image);
const ordered = [...definitions].sort((a, b) =>
  Number(b.image === "default") - Number(a.image === "default") ||
  Number(isBuild(a.image)) - Number(isBuild(b.image)) || a.image.localeCompare(b.image, "en"));
const firstBuild = ordered.find(({ image }) => isBuild(image))?.image;
const rows = ordered.map(definition => {
  const description = descriptions.get(definition.image);
  if (!description) throw new Error(`${definition.image}: describe it as "- \`${definition.image}\`: …" in its README`);
  const heading = definition.image === firstBuild ? '<tr class="group"><th colspan="3">Build images</th></tr>\n' : "";
  return heading + menuRow(definition.image, description, !headless.has(definition.image));
});
const menu = await readFile(resolve(projectDir, "menu.html"), "utf8");
await writeFile(resolve(projectDir, "index.html"),
  menu.replace(/<tbody>[\s\S]*?<\/tbody>/, () => `<tbody>\n${rows.join("\n")}\n</tbody>`));
const routes = [
  ...definitions.flatMap(({ image }) => [
    ...(headless.has(image) ? [] : [{ path: `${image}/index.html`, image, mode: "snapshot" }]),
    { path: `${image}/rebuild/index.html`, image, mode: "rebuild" },
  ]),
  { path: "custom/rebuild/index.html", image: "custom", mode: "rebuild" },
  { path: "custom/run/index.html", image: "custom", mode: "snapshot" },
  { path: "rebuild/index.html", image: primaryImage, mode: "rebuild" },
  // One page opens every saved session: /session/?name=NAME.
  { path: "session/index.html", image: primaryImage, mode: "snapshot", loadSession: true },
];
for (const route of routes) {
  const output = resolve(projectDir, route.path);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, template
    .replaceAll("{{DOLLY_BASE}}", "../".repeat(route.path.split("/").length - 1))
    .replaceAll("{{DOLLY_IMAGE}}", route.image)
    .replaceAll("{{DOLLY_MODE}}", route.mode)
    .replaceAll("{{DOLLY_LOAD_SESSION}}", String(route.loadSession ?? false)));
}

const graphPages = graphs.flatMap(({ definition, graph }) => [
  { path: `view/${definition.image}/index.html`, record: graph.root, graph },
  ...graph.modules.map((record) => ({
    path: `view/${definition.image}/modules/${record.name}/index.html`,
    record,
    graph,
  })),
]);
await rm(resolve(projectDir, "view"), { recursive: true, force: true });
for (const page of graphPages) {
  const output = resolve(projectDir, page.path);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, renderDollyfilePage(page.record, page.graph));
}

console.log(`dolly: generated ${routes.length + graphPages.length} static routes`);
