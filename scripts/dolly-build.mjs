#!/usr/bin/env node
// An npm user's image: builds a Dollyfile FROM an installed image package, with
// the packages it INSTALLs from their packages, in a browser with that browser's
// Dolly runtime, into an image directory that boot() loads and a host serves
// (docs/embedding.md, "Your own image").
//   npx dolly-build init NAME [PACKAGE…]   writes Dollyfile-NAME FROM pi-minimal, index.html, serve.mjs, workspace/
//   npx dolly-build Dollyfile-NAME OUT [--browser chrome|chromium|firefox]
// OUT holds the image's catalog, metadata and packs, the recipes it was built
// from and an index.mjs, as an image package holds. It runs in the directory whose
// node_modules/@daugasauron/ holds the runtime, the image and package directories
// and the host module packages (pnpm links there what it keeps elsewhere); the
// runtime runs only in the browser.
import { cp, mkdir, mkdtemp, readdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
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
import { validName } from "../src/image-names.mjs";
import { siteReference, sitePath } from "../src/static-asset.mjs";

function fail(message) {
  console.error(`dolly-build: ${message}`);
  process.exit(1);
}
const scope = resolve("node_modules/@daugasauron");
if (!existsSync(join(scope, "dolly"))) fail("run it where node_modules/@daugasauron/dolly is installed");
const load = path => import(pathToFileURL(path).href);
const { positionals, values: { browser: browserName } } = parseArgs({ allowPositionals: true,
  options: { browser: { type: "string", default: "chrome" } } });
const browsers = {
  chrome: () => chromium.launch({ channel: "chrome", headless: true }),
  chromium: () => chromium.launch({ headless: true }),
  firefox: () => firefox.launch({ headless: true }),
};
const usage = "usage: dolly-build init NAME [PACKAGE...] | Dollyfile-NAME OUT [--browser chrome|chromium|firefox]";
const init = positionals[0] === "init";
if (!browsers[browserName] || (init ? positionals.length < 2 : positionals.length !== 2)) fail(usage);

// The installed image and package directories (dolly-image-NAME, dolly-package-NAME):
// each holds its own image's packs, and the catalog and metadata of that image's closure.
const directories = await Promise.all((await readdir(scope)).filter(name => /^dolly-(image|package)-/.test(name))
  .map(async name => ({ directory: await realpath(join(scope, name)), package: `@daugasauron/${name}`,
    image: name.replace(/^dolly-(image|package)-/, ""), ...await load(join(scope, name, "dist/dolly-images.mjs")) })));
const definitionOf = ({ DOLLY_IMAGES, image }) => DOLLY_IMAGES.find(candidate => candidate.image === image);
const installed = (image, kind) => directories.find(candidate => candidate.image === image)
  ?? fail(`${image}: no ${kind} package holds it; install @daugasauron/dolly-${kind}-${image}`);
// The directory whose own image a row names, at the row's pin.
const holder = reference => directories.find(candidate => {
  const definition = definitionOf(candidate);
  return siteReference(definition.dollyfile) === reference.location && definition.sha256 === reference.sha256;
});
// The host module packages: the runtime's own and one package each.
const modules = new Map();
for (const name of await readdir(join(scope, "dolly/host"))) {
  if (existsSync(join(scope, "dolly/host", name, "module.json"))) modules.set(name, `dolly/host/${name}/module.json`);
}
for (const name of (await readdir(scope)).filter(name => name.startsWith("dolly-host-"))) {
  modules.set(JSON.parse(await readFile(join(scope, name, "module.json"), "utf8")).name, `${name}/module.json`);
}
const hostPackage = name => `@daugasauron/dolly-host-${name === "download" ? "save" : name}`;

try {
  if (init) await scaffold(positionals[1], positionals.slice(2));
  else await build(...positionals.map(path => resolve(path)));
} catch (error) {
  fail(error.message);
}

// A project: the recipe (FROM pi-minimal at its pin, INSTALL of each PACKAGE,
// the template's rows, the base's ENTRY), the page, its server and the workspace.
async function scaffold(name, packages) {
  if (!validName(name)) fail(`${name}: a name is lowercase letters, digits and dashes, at most 32 bytes`);
  const base = definitionOf(installed("pi-minimal", "image"));
  const installs = packages.map(image => definitionOf(installed(image, "package")));
  const hosts = [...new Set([base, ...installs].flatMap(definition => definition.hostRequirements))].sort();
  const row = (operation, definition) => `${operation} ${siteReference(definition.dollyfile)} ${definition.sha256}\n`;
  const template = async file => (await readFile(join(import.meta.dirname, "dolly-build-init", file), "utf8")).replaceAll("__NAME__", name);
  const files = {
    [`Dollyfile-${name}`]: `DOLLY 7\nAPPLICATION ${name}\n${hosts.map(host => `REQUIRES HOST ${host}\n`).join("")}\n` +
      row("FROM", base) + installs.map(definition => row("INSTALL", definition)).join("") + "\n" + await template("Dollyfile") +
      `\nENTRY ${base.entry.join(" ")}\n`,
    "index.html": await template("index.html"),
    "serve.mjs": await template("serve.mjs"),
    "workspace/README.md": await template("workspace/README.md"),
  };
  const present = Object.keys(files).filter(file => existsSync(file));
  if (present.length) fail(`${present.join(", ")}: already here`);
  await mkdir("workspace", { recursive: true });
  for (const [file, text] of Object.entries(files)) await writeFile(file, text);
  console.log(`dolly-build: wrote ${Object.keys(files).join(", ")}\n` +
    `  npx dolly-build Dollyfile-${name} ${name}   builds the image (again after a change to the recipe)\n` +
    "  node serve.mjs                       serves the page");
}

async function build(recipePath, outArgument) {
  const filename = basename(recipePath), source = await readFile(recipePath, "utf8");
  const parsed = inspectDollyfile(source, filename), image = parsed.image;
  if (imageFileName(filename) !== image) fail(`${filename}: name it Dollyfile-${image}`);
  if (!parsed.from) fail(`${filename}: FROM an installed image`);
  // A rebuild replaces the image directory it wrote before, and nothing else.
  if (existsSync(outArgument) && !existsSync(join(outArgument, "dist/dolly-images.mjs"))) {
    fail(`${outArgument} exists and is not an image directory`);
  }
  // Every row that names an image names one of the installed directories at its pin.
  const holders = parsed.artifacts.map(reference => holder(reference) ?? fail(`${filename}:${reference.line}: no installed ` +
    `package holds ${reference.location} at that pin (dolly-build init writes the rows of the installed ones)`));
  // One catalog of their closures: the same image at the same pin in each.
  const records = new Map(), staticSources = new Map(), first = new Map();
  for (const directory of holders) {
    for (const record of directory.DOLLY_IMAGES) {
      if (records.has(record.image) && records.get(record.image).sha256 !== record.sha256) {
        fail(`${directory.package} holds ${record.image} at another pin than ${first.get(record.image)}: install packages of one version`);
      }
      records.set(record.image, record);
      first.set(record.image, first.get(record.image) ?? directory.package);
    }
    for (const entry of directory.DOLLY_STATIC_SOURCES) staticSources.set(entry.path, entry);
  }
  if (records.has(image)) fail(`${image} is already an image of ${first.get(image)}`);
  const declared = parsed.hostRequirements.map(requirement => requirement.split("@")[0]);
  const missing = declared.filter(name => !modules.has(name));
  if (missing.length) fail(`${image} declares ${missing.join(", ")}: install ${missing.map(hostPackage).join(", ")}`);

  // The new directory: the closures' metadata and recipes, and this recipe beside
  // them; the holders' packs are served from their packages for the build alone.
  const staging = await mkdtemp(join(dirname(outArgument), ".dolly-build-"));
  try {
    for (const { directory } of new Set(holders)) {
      await cp(directory, staging, { recursive: true, filter: path => ![
        join(directory, "dist/packs"), join(directory, "dist/dolly-images.mjs"), join(directory, "index.mjs"),
        join(directory, "package.json"), join(directory, "README.md")].includes(path) });
    }
    await writeFile(join(staging, filename), source);
    const graph = await loadRecipeGraph(reference => readFile(join(staging, sitePath(reference).slice(1))), siteReference(filename));
    await writeFile(join(staging, "dist/dolly-images.mjs"), catalogSource([...records.values(),
      catalogRecord({ image, filename, source, parsed }, graph)], [...staticSources.values()]));

    const page = "<!doctype html><title>dolly-build</title>";
    // The packages at their names (the runtime at /dolly/, the host modules beside it).
    const roots = [["/", scope], ["/image/", staging],
      ...holders.map(({ directory }) => ["/image/dist/packs/", join(directory, "dist/packs")])];
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
        `${JSON.stringify(`${origin}/image/`)}, ${JSON.stringify(image)}, undefined, ` +
        `${JSON.stringify([...modules.values()].map(path => `${origin}/${path}`))})`));
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
    await rm(outArgument, { recursive: true, force: true });
    await rename(staging, outArgument);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
  console.log(`dolly-build: ${relative(process.cwd(), outArgument) || "."} holds ${image}; ` +
    `import { images, image, modules } from its index.mjs for boot()`);
}
