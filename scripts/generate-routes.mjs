#!/usr/bin/env node

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  discoverImageDefinitions,
  inspectStaticSources,
  selectImageDefinitions,
  writeImageRegistry,
} from "./image-definitions.mjs";
import { createDollyfileGraphLoader } from "./dollyfile-graph.mjs";
import { renderDollyfilePage } from "./render-dollyfile-view.mjs";
import { imageDescriptions, menuRow } from "./image-menu.mjs";
import { recipeDemo } from "./recipe-files.mjs";
import { bundleProcessWorker } from "./bundle-process-worker.mjs";

const projectDir = resolve(import.meta.dirname, "..");
await bundleProcessWorker(projectDir);
const loadGraph = createDollyfileGraphLoader(projectDir);
const outputDir = resolve(projectDir, "build/routes");
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
const group = ({ path }) => recipeDemo(path) ?? "";
const ordered = [...definitions].sort((a, b) =>
  group(a).localeCompare(group(b), "en") ||
  Number(b.image === "default") - Number(a.image === "default") ||
  Number(headless.has(a.image)) - Number(headless.has(b.image)) || a.image.localeCompare(b.image, "en"));
const rows = ordered.map((definition, index) => {
  const description = descriptions.get(definition.image);
  if (!description) throw new Error(`${definition.image}: describe it as "- \`${definition.image}\`: …" in its README`);
  const heading = index === 0 || group(ordered[index - 1]) !== group(definition)
    ? `<tr class="group"><th colspan="3">${group(definition) ? `Demo: ${group(definition)}` : "Core"}</th></tr>\n` : "";
  return heading + menuRow(definition.image, description, !headless.has(definition.image));
});
const menuTemplate = await readFile(resolve(projectDir, "index.html"), "utf8");
const menu = menuTemplate.replace(/<tbody>[\s\S]*?<\/tbody>/, () => `<tbody>\n${rows.join("\n")}\n</tbody>`);
await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, "index.html"), menu);
const routes = [
  ...definitions.flatMap(({ image }) => [
    ...(headless.has(image) ? [] : [{ path: `${image}/index.html`, base: "../", image, mode: "snapshot", load: false }]),
    { path: `${image}/rebuild/index.html`, base: "../../", image, mode: "rebuild", load: false },
  ]),
  { path: "custom/rebuild/index.html", base: "../../", image: "custom", mode: "rebuild", load: false },
  { path: "custom/run/index.html", base: "../../", image: "custom", mode: "snapshot", load: false },
  { path: "rebuild/index.html", base: "../", image: primaryImage, mode: "rebuild", load: false },
  { path: "load/index.html", base: "../", image: primaryImage, mode: "snapshot", load: true },
  { path: "session/open.html", base: "", image: primaryImage, mode: "snapshot", load: true },
  { path: "404.html", base: "", image: primaryImage, mode: "snapshot", load: true },
];

for (const route of routes) {
  const output = resolve(outputDir, route.path);
  await mkdir(resolve(output, ".."), { recursive: true });
  const page = template
    .replaceAll("{{DOLLY_ROUTE_HEAD}}", route.load ? `<script>
      const match = /^(.*\\/)session\\/([A-Za-z0-9._-]{1,64})\\/?$/.exec(location.pathname);
      if (match && match[2] !== "." && match[2] !== "..") {
        const base = document.createElement("base");
        const target = new URL(location.href);
        target.pathname = match[1];
        target.search = "";
        target.hash = "";
        base.href = target.href;
        document.head.append(base);
        const session = new URL("session/" + match[2], base.href);
        if (new URL(location.href).searchParams.get("recover") === "1") session.search = "?recover=1";
        history.replaceState(null, "", session);
      } else {
        globalThis.DOLLY_NOT_FOUND = true;
      }
    </script>` : "")
    .replaceAll("{{DOLLY_BASE}}", route.base)
    .replaceAll("{{DOLLY_IMAGE}}", route.image)
    .replaceAll("{{DOLLY_MODE}}", route.mode)
    .replaceAll("{{DOLLY_LOAD_SESSION}}", String(route.load));
  await writeFile(output, page);
}

// Keep old bookmarks working, but all newly saved links use /session/NAME.
await writeFile(resolve(outputDir, "load/index.html"), `<!doctype html>
<meta charset="utf-8"><title>Dolly sessions</title><script>
const name = new URL(location.href).searchParams.get("session");
const valid = name && name !== "." && name !== ".." && /^[A-Za-z0-9._-]{1,64}$/.test(name);
location.replace(new URL("../session/" + (valid ? name : ""), location.href));
</script>`);
await writeFile(resolve(outputDir, "session/index.html"),
  await readFile(resolve(projectDir, "sessions.html"), "utf8"));
await writeFile(resolve(outputDir, "custom/index.html"),
  await readFile(resolve(projectDir, "custom.html"), "utf8"));

const graphPages = graphs.flatMap(({ definition, graph }) => [
  { path: `view/${definition.image}/index.html`, record: graph.root, graph },
  ...graph.modules.map((record) => ({
    path: `view/${definition.image}/modules/${record.name}/index.html`,
    record,
    graph,
  })),
]);
for (const page of graphPages) {
  const output = resolve(outputDir, page.path);
  await mkdir(resolve(output, ".."), { recursive: true });
  await writeFile(output, renderDollyfilePage(page.record, page.graph));
}

console.log(`dolly: generated ${routes.length + graphPages.length} static routes`);
