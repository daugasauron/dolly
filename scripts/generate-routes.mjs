#!/usr/bin/env node

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  discoverImageDefinitions,
  inspectStaticSources,
  selectImageDefinitions,
  writeImageRegistry,
} from "./image-definitions.mjs";
import { loadDollyfileGraph } from "./dollyfile-graph.mjs";
import { renderDollyfilePage } from "./render-dollyfile-view.mjs";

const projectDir = resolve(import.meta.dirname, "..");
const outputDir = resolve(projectDir, "build/routes");
const template = await readFile(resolve(projectDir, "terminal.html"), "utf8");
const definitions = selectImageDefinitions(await discoverImageDefinitions(projectDir));
const primaryImage = definitions.find(({ image }) => image === "default")?.image ??
  definitions[0].image;
const staticSources = await inspectStaticSources(projectDir, definitions);
const graphs = await Promise.all(definitions.map(async (definition) => ({
  definition,
  graph: await loadDollyfileGraph(projectDir, definition.filename),
})));
await writeImageRegistry(projectDir, definitions, staticSources);
const routes = [
  ...definitions.flatMap(({ image }) => [
    { path: `${image}/index.html`, base: "../", image, mode: "snapshot", load: false },
    { path: `${image}/rebuild/index.html`, base: "../../", image, mode: "rebuild", load: false },
  ]),
  { path: "custom/rebuild/index.html", base: "../../", image: "custom", mode: "rebuild", load: false },
  { path: "rebuild/index.html", base: "../", image: primaryImage, mode: "rebuild", load: false },
  { path: "load/index.html", base: "../", image: primaryImage, mode: "snapshot", load: true },
];

for (const route of routes) {
  const output = resolve(outputDir, route.path);
  await mkdir(resolve(output, ".."), { recursive: true });
  const page = template
    .replaceAll("{{DOLLY_BASE}}", route.base)
    .replaceAll("{{DOLLY_IMAGE}}", route.image)
    .replaceAll("{{DOLLY_MODE}}", route.mode)
    .replaceAll("{{DOLLY_LOAD_SESSION}}", String(route.load))
    .replaceAll(
      "{{DOLLY_PHONE_EXTRA}}",
      route.image === "gamedev"
        ? '<button type="button" data-dolly-input="/demo\\r">Framebuffer demo</button>'
        : "",
    );
  await writeFile(output, page);
}

const graphPages = graphs.flatMap(({ definition, graph }) => [
  { path: `view/${definition.image}/index.html`, record: graph.root, graph },
  ...graph.modules.map((record) => ({
    path: `view/${definition.image}/modules/${record.name}/index.html`,
    record,
    graph,
  })),
]);
await rm(resolve(outputDir, "view"), { recursive: true, force: true });
for (const page of graphPages) {
  const output = resolve(outputDir, page.path);
  await mkdir(resolve(output, ".."), { recursive: true });
  await writeFile(output, renderDollyfilePage(page.record, page.graph));
}

console.log(`dolly: generated ${routes.length + graphPages.length} static routes`);
