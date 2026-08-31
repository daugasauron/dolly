#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  discoverImageDefinitions,
  inspectStaticSources,
  writeImageRegistry,
} from "./image-definitions.mjs";

const projectDir = resolve(import.meta.dirname, "..");
const outputDir = resolve(projectDir, "build/routes");
const template = await readFile(resolve(projectDir, "terminal.html"), "utf8");
const viewerTemplate = await readFile(resolve(projectDir, "viewer.html"), "utf8");
const definitions = await discoverImageDefinitions(projectDir);
const staticSources = await inspectStaticSources(projectDir, definitions);
await writeImageRegistry(projectDir, definitions, staticSources);
const routes = [
  ...definitions.flatMap(({ image }) => [
    { path: `${image}/index.html`, base: "../", image, mode: "snapshot", load: false },
    { path: `${image}/rebuild/index.html`, base: "../../", image, mode: "rebuild", load: false },
  ]),
  { path: "custom/rebuild/index.html", base: "../../", image: "custom", mode: "rebuild", load: false },
  { path: "rebuild/index.html", base: "../", image: "default", mode: "rebuild", load: false },
  { path: "load/index.html", base: "../", image: "default", mode: "snapshot", load: true },
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

for (const definition of definitions) {
  const output = resolve(outputDir, `view/${definition.image}/index.html`);
  await mkdir(resolve(output, ".."), { recursive: true });
  await writeFile(
    output,
    viewerTemplate
      .replaceAll("{{DOLLY_BASE}}", "../../")
      .replaceAll("{{DOLLY_IMAGE}}", definition.image),
  );
}

console.log(`dolly: generated ${routes.length + definitions.length} static routes`);
