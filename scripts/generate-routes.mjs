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
const definitions = await selectImageDefinitions(await discoverImageDefinitions(projectDir));
const primaryImage = definitions.find(({ image }) => image === "default")?.image ??
  definitions[0].image;
const staticSources = await inspectStaticSources(projectDir, definitions);
const graphs = await Promise.all(definitions.map(async (definition) => ({
  definition,
  graph: await loadDollyfileGraph(projectDir, definition.filename),
})));
await writeImageRegistry(projectDir, definitions, staticSources);
const selectedNames = new Set(definitions.map(definition => definition.image));
const menuNames = new Set();
let menu = (await readFile(resolve(projectDir, "index.html"), "utf8"))
  .replace(/<section class="image">[\s\S]*?<\/section>/g, section => {
    const name = /<h3>([^<]+)<\/h3>/.exec(section)?.[1];
    if (!selectedNames.has(name)) return "";
    menuNames.add(name);
    return section;
  });
for (const { image } of definitions) {
  if (menuNames.has(image)) continue;
  menu = menu.replace("</nav>", `<section class="image"><h3>${image}</h3>
    <div class="image-links"><a href="./${image}/">open →</a>
    <a href="./${image}/rebuild/">rebuild</a><a href="./view/${image}/">Dollyfile</a></div>
    </section></nav>`);
}
await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, "index.html"), menu);
const routes = [
  ...definitions.flatMap(({ image }) => [
    { path: `${image}/index.html`, base: "../", image, mode: "snapshot", load: false },
    { path: `${image}/rebuild/index.html`, base: "../../", image, mode: "rebuild", load: false },
  ]),
  { path: "custom/rebuild/index.html", base: "../../", image: "custom", mode: "rebuild", load: false },
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
        history.replaceState(null, "", new URL("session/" + match[2], base.href));
      } else {
        globalThis.DOLLY_NOT_FOUND = true;
      }
    </script>` : "")
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

// Keep old bookmarks working, but all newly saved links use /session/NAME.
await writeFile(resolve(outputDir, "load/index.html"), `<!doctype html>
<meta charset="utf-8"><title>Dolly sessions</title><script>
const name = new URL(location.href).searchParams.get("session");
const valid = name && name !== "." && name !== ".." && /^[A-Za-z0-9._-]{1,64}$/.test(name);
location.replace(new URL("../session/" + (valid ? name : ""), location.href));
</script>`);
await writeFile(resolve(outputDir, "session/index.html"),
  await readFile(resolve(projectDir, "sessions.html"), "utf8"));

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
