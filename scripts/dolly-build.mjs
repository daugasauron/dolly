#!/usr/bin/env node
// An npm user's image: builds a Dollyfile FROM an installed image package in a
// browser, with that browser's Dolly runtime, into an image directory that
// boot() loads and a host serves (docs/embedding.md, "Your own image").
//   npx dolly-build from IMAGE NAME     prints a recipe for NAME FROM IMAGE
//   npx dolly-build Dollyfile-NAME OUT [--browser chrome|chromium|firefox]
// OUT is new: the image's catalog, metadata and packs, the recipes it was built
// from and an index.mjs, as an image package holds. It runs in the directory whose
// node_modules/@daugasauron/ holds the runtime, the image packages and the host
// module packages (pnpm links there what it keeps elsewhere); the runtime runs
// only in the browser.
import { cp, mkdtemp, readdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { chromium, firefox } from "playwright-core";
import { catalogRecord, catalogSource, indexSource, metadataSource, snapshotMetadata } from "./image-directory.mjs";
import { buildImageInPage, savePageSnapshot } from "./page-image-build.mjs";
import { isolationHeaders, mimeTypes } from "./serve.mjs";
import { ensureSnapshotPacks } from "./share-pages-snapshots.mjs";
import { verifySnapshotIdentity } from "./snapshot-identity.mjs";
import { decodeSystemSnapshot } from "./system-snapshot-format.mjs";
import { readWasmInterface } from "./wasm-interface.mjs";
import { loadRecipeGraph } from "../src/dollyfile-graph.mjs";
import { imageFileName, inspectDollyfile } from "../src/dollyfile-view.mjs";
import { imageInputs } from "../src/image-inputs.mjs";
import { siteReference, sitePath } from "../src/static-asset.mjs";

const scope = resolve("node_modules/@daugasauron");
if (!existsSync(join(scope, "dolly"))) throw new Error("run dolly-build where node_modules/@daugasauron/dolly is installed");
const load = path => import(pathToFileURL(path).href);
const { positionals, values: { browser: browserName } } = parseArgs({ allowPositionals: true,
  options: { browser: { type: "string", default: "chrome" } } });
const browsers = {
  chrome: () => chromium.launch({ channel: "chrome", headless: true }),
  chromium: () => chromium.launch({ headless: true }),
  firefox: () => firefox.launch({ headless: true }),
};
const usage = "usage: dolly-build from IMAGE NAME | dolly-build Dollyfile-NAME OUT [--browser chrome|chromium|firefox]";
if (!browsers[browserName] || positionals.length !== 3 && positionals.length !== 2 ||
    (positionals.length === 3) !== (positionals[0] === "from")) throw new Error(usage);

// The image packages installed beside this one, each with its own image and its catalog.
const packages = await Promise.all((await readdir(scope)).filter(name => name.startsWith("dolly-image-"))
  .map(async name => ({ directory: await realpath(join(scope, name)), image: name.slice("dolly-image-".length),
    ...await load(join(scope, name, "dist/dolly-images.mjs")) })));
const installed = image => packages.find(candidate => candidate.image === image)
  ?? fail(`${image}: no image package holds it; install @daugasauron/dolly-image-${image}`);
function fail(message) { throw new Error(message); }

if (positionals[0] === "from") {
  const [, base, name] = positionals;
  const definition = installed(base).DOLLY_IMAGES.find(candidate => candidate.image === base);
  if (definition.role === "package") fail(`${base} is a package: INSTALL it instead`);
  if (definition.entry?.some(word => /\s/.test(word))) fail(`${base}: its ENTRY has a word with a space`);
  process.stdout.write(`DOLLY 7\nAPPLICATION ${name}\n` +
    definition.hostRequirements.map(requirement => `REQUIRES HOST ${requirement}\n`).join("") +
    `\nFROM ${siteReference(definition.dollyfile)} ${definition.sha256}\n\n` +
    "# Your rows: FILE (its body indented four spaces) and SLOP, before ENTRY.\n\n" +
    (definition.entry ? `ENTRY ${definition.entry.join(" ")}\n` : ""));
  process.exit(0);
}

const [recipePath, outArgument] = positionals.map(path => resolve(path));
const filename = basename(recipePath), source = await readFile(recipePath, "utf8");
const parsed = inspectDollyfile(source, filename), image = parsed.image;
if (imageFileName(filename) !== image) fail(`${filename}: name it Dollyfile-${image}`);
if (!parsed.from) fail(`${filename}: FROM an installed image`);
if (existsSync(outArgument)) fail(`${outArgument} exists: remove it first`);
const base = packages.find(candidate => candidate.DOLLY_IMAGES.some(definition => definition.image === candidate.image &&
  siteReference(definition.dollyfile) === parsed.from.location && definition.sha256 === parsed.from.sha256))
  ?? fail(`${filename}: no installed image package is its FROM at that pin (dolly-build from IMAGE prints the row)`);
if (base.DOLLY_IMAGES.some(definition => definition.image === image)) fail(`${image} is already an image of ${base.image}`);

// The host modules it declares, from the packages that hold them: the runtime's
// own and one package each.
const modules = new Map();
for (const name of await readdir(join(scope, "dolly/host"))) {
  if (existsSync(join(scope, "dolly/host", name, "module.json"))) modules.set(name, `dolly/host/${name}/module.json`);
}
for (const name of (await readdir(scope)).filter(name => name.startsWith("dolly-host-"))) {
  modules.set(JSON.parse(await readFile(join(scope, name, "module.json"), "utf8")).name, `${name}/module.json`);
}
const declared = parsed.hostRequirements.map(requirement => requirement.split("@")[0]);
const missing = declared.filter(name => !modules.has(name));
if (missing.length) fail(`${image} declares ${missing.join(", ")}: install the host module packages that hold them`);

// The new directory: the base's catalog, metadata and recipes, and this recipe
// beside them; the base's packs are served from its package for the build alone.
const staging = await mkdtemp(join(dirname(outArgument), ".dolly-build-"));
try {
  await cp(base.directory, staging, { recursive: true, filter: path => ![
    join(base.directory, "dist/packs"), join(base.directory, "dist/dolly-images.mjs"), join(base.directory, "index.mjs"),
    join(base.directory, "package.json"), join(base.directory, "README.md")].includes(path) });
  await writeFile(join(staging, filename), source);
  const graph = await loadRecipeGraph(reference => readFile(join(staging, sitePath(reference).slice(1))), siteReference(filename));
  await writeFile(join(staging, "dist/dolly-images.mjs"), catalogSource([...base.DOLLY_IMAGES,
    catalogRecord({ image, filename, source, parsed }, graph)], base.DOLLY_STATIC_SOURCES));

  const page = "<!doctype html><title>dolly-build</title>";
  const roots = [["/dolly/", join(scope, "dolly")], ["/image/", staging], ["/image/dist/packs/", join(base.directory, "dist/packs")]];
  const server = createServer(async (request, response) => {
    const path = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    if (path === "/") return response.writeHead(200, { ...isolationHeaders, "content-type": "text/html" }).end(page);
    for (const [prefix, root] of roots.toReversed().filter(([prefix]) => path.startsWith(prefix))) {
      const file = resolve(root, path.slice(prefix.length));
      if (!file.startsWith(root + sep)) break;
      const body = await readFile(file).catch(() => null);
      if (body) return response.writeHead(200, { ...isolationHeaders,
        "content-type": mimeTypes.get(extname(file)) ?? "application/octet-stream" }).end(body);
    }
    response.writeHead(404).end();
  });
  await new Promise(listening => server.listen(0, "127.0.0.1", listening));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await browsers[browserName]();
  let inputs;
  try {
    const tab = await browser.newPage();
    tab.setDefaultTimeout(0);
    await tab.exposeFunction("dollyBuildLog", text => void process.stderr.write(text));
    // The recipes' own upstream URLs are the only network the build may use.
    const rules = graph.records.flatMap(record => record.sources.filter(entry => sitePath(entry.location) === null))
      .map(entry => ({ origin: new URL(entry.location).origin, path: new URL(entry.location).pathname, methods: ["GET"] }));
    await tab.addInitScript(rules => { globalThis.DOLLY_HTTP_POLICY = { maxRequests: 256, rules }; }, rules);
    await tab.goto(`${origin}/`);
    ({ inputs } = await tab.evaluate(`(${buildImageInPage})(${JSON.stringify(`${origin}/dolly/`)}, ` +
      `${JSON.stringify(`${origin}/image/`)}, ${JSON.stringify(image)})`));
    await savePageSnapshot(tab, join(staging, `dist/dolly-${image}-system.snapshot`));
  } finally {
    await browser.close();
    server.close();
  }

  // Checked and described as the catalog's images are, by the runtime it runs on.
  const runtime = join(scope, "dolly/dist");
  const snapshotPath = join(staging, `dist/dolly-${image}-system.snapshot`), snapshot = await readFile(snapshotPath);
  const decoded = decodeSystemSnapshot(snapshot);
  const entry = verifySnapshotIdentity({ image, source, parsed }, graph, decoded,
    await readWasmInterface(join(runtime, "dolly-process-0.wasm")),
    (await load(join(runtime, "dolly-process-abi.mjs"))).DOLLY_PROCESS_ABI_DIGEST);
  const build = { buildId: (await load(join(runtime, "dolly-build-id.mjs"))).DOLLY_BUILD_ID,
    imageBuildId: (await load(join(runtime, "dolly-image-build-id.mjs"))).DOLLY_IMAGE_BUILD_ID };
  const packed = await ensureSnapshotPacks(join(staging, "dist"),
    snapshotMetadata(image, graph, imageInputs(inputs), snapshot, decoded, entry, build));
  await writeFile(join(staging, `dist/dolly-${image}-system-snapshot.mjs`), metadataSource(packed));
  await rm(snapshotPath);

  await writeFile(join(staging, "index.mjs"), indexSource(image,
    declared.map(name => relative(outArgument, join(scope, modules.get(name))).split(sep).join("/"))));
  await rename(staging, outArgument);
} catch (error) {
  await rm(staging, { recursive: true, force: true });
  throw error;
}
console.log(`dolly-build: ${relative(process.cwd(), outArgument) || "."} holds ${image}; ` +
  `import { images, image, modules } from its index.mjs for boot()`);
