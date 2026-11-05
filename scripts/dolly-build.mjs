#!/usr/bin/env node
// An npm user's image: builds a Dollyfile FROM an installed image package, with
// the packages it INSTALLs from their packages, in a browser with that browser's
// Dolly runtime, into a site a static host serves as it lies (docs/embedding.md,
// "Your own image").
//   npx dolly-build init NAME [PACKAGE…]   writes Dollyfile-NAME FROM pi-minimal and public/ (the page)
//   npx dolly-build Dollyfile-NAME OUT [--browser chrome|chromium|firefox]
// OUT is the files of public/, workspace.json listing public/workspace/, the runtime
// (dolly/), the host modules the image declares (dolly-host-NAME/),
// coi-serviceworker.js for hosts without isolation headers, and image/, the image's
// directory as an image package lays it out (catalog, metadata, packs, recipes,
// amy-index.txt, index.mjs). It runs in the directory whose node_modules/@daugasauron/
// holds the runtime, the image and package directories and the host module packages
// (pnpm links there what it keeps elsewhere); the runtime runs only in the browser.
import { cp, mkdir, mkdtemp, readdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { chromium, firefox } from "playwright-core";
import { amyIndex, catalogJson, catalogRecord, heldPackages, indexDescriptions, indexSource, metadataJson, snapshotMetadata } from "./image-directory.mjs";
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
// Firefox's system add-on updater resolves its host even behind a proxy.
const browsers = {
  chrome: options => chromium.launch({ channel: "chrome", headless: true, ...options }),
  chromium: options => chromium.launch({ headless: true, ...options }),
  firefox: options => firefox.launch({ headless: true, firefoxUserPrefs: { "extensions.systemAddon.update.enabled": false }, ...options }),
};
const usage = "usage: dolly-build init NAME [PACKAGE...] | Dollyfile-NAME OUT [--browser chrome|chromium|firefox]";
const init = positionals[0] === "init";
if (!browsers[browserName] || (init ? positionals.length < 2 : positionals.length !== 2)) fail(usage);

// The installed image and package directories (dolly-image-NAME, dolly-package-NAME):
// each holds its own image's packs, and the catalog and metadata of that image's
// closure. npm installs the packages a package installs beside it, pnpm beside its
// real path.
const directories = [];
for (const pending = [scope]; pending.length;) {
  const parent = pending.pop();
  for (const name of (await readdir(parent)).filter(name => /^dolly-(image|package)-/.test(name))) {
    const directory = await realpath(join(parent, name));
    if (directories.some(found => found.directory === directory)) continue;
    directories.push({ directory, package: `@daugasauron/${name}`, image: name.replace(/^dolly-(image|package)-/, ""),
      catalog: JSON.parse(await readFile(join(directory, "dist/dolly-images.json"), "utf8")) });
    pending.push(dirname(directory));
  }
}
const definitionOf = ({ catalog, image }) => catalog.images.find(candidate => candidate.image === image);
const installed = (image, kind) => directories.find(candidate => candidate.image === image)
  ?? fail(`${image} is not installed: npm install @daugasauron/dolly-${kind}-${image}`);
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
// the template's rows, the base's ENTRY) and public/, the page's files: the page,
// its theme and the workspace.
async function scaffold(name, packages) {
  if (!validName(name)) fail(`${name}: a name is lowercase letters, digits and dashes, at most 32 bytes`);
  const base = definitionOf(installed("pi-minimal", "image"));
  const installs = packages.map(image => definitionOf(installed(image, "package")));
  // snapshot@0 is the page's Save: a save is kept in the browser, and the page opens it again.
  const hosts = [...new Set([base, ...installs].flatMap(definition => definition.hostRequirements).concat("snapshot@0"))].sort();
  const row = (operation, definition) => `${operation} ${siteReference(definition.dollyfile)} ${definition.sha256}\n`;
  const template = async file => (await readFile(join(import.meta.dirname, "dolly-build-init", file), "utf8")).replaceAll("__NAME__", name);
  const files = {
    [`Dollyfile-${name}`]: `DOLLY 7\nAPPLICATION ${name}\n${hosts.map(host => `REQUIRES HOST ${host}\n`).join("")}\n` +
      row("FROM", base) + installs.map(definition => row("INSTALL", definition)).join("") + "\n" + await template("Dollyfile") +
      `\nENTRY ${base.entry.join(" ")}\n`,
    "public/index.html": await template("public/index.html"),
    "public/theme.json": await template("public/theme.json"),
    "public/workspace/README.md": await template("public/workspace/README.md"),
  };
  const present = Object.keys(files).filter(file => existsSync(file));
  if (present.length) fail(`${present.join(", ")}: already here`);
  await mkdir("public/workspace", { recursive: true });
  for (const [file, text] of Object.entries(files)) await writeFile(file, text);
  // The image directory and node_modules are built, not kept: a .gitignore, unless the project has one.
  if (!existsSync(".gitignore")) await writeFile(".gitignore", `node_modules/\n${name}/\n`);
  const missing = hosts.map(host => host.split("@")[0]).filter(name => !modules.has(name));
  console.log(`dolly-build: wrote ${Object.keys(files).join(", ")}\n` +
    (missing.length ? `  npm install ${missing.map(hostPackage).join(" ")}   the recipe declares ${missing.join(", ")}\n` : "") +
    `  npx dolly-build Dollyfile-${name} ${name}   builds the image and the site, ${name}/ (again after a change)\n` +
    `  python3 -m http.server -d ${name} -b 127.0.0.1 8080   serves it, as any static host does`);
}

async function build(recipePath, outArgument) {
  const filename = basename(recipePath), source = await readFile(recipePath, "utf8");
  const parsed = inspectDollyfile(source, filename), image = parsed.image;
  if (imageFileName(filename) !== image) fail(`${filename}: name it Dollyfile-${image}`);
  if (!parsed.from) fail(`${filename}: FROM an installed image`);
  if (!existsSync("public/index.html")) fail("public/index.html: the page of the site (dolly-build init writes one)");
  // A rebuild replaces the site it wrote before, and nothing else.
  const previous = join(outArgument, "image");
  if (existsSync(outArgument) && !existsSync(join(previous, "dist/dolly-images.json"))) {
    fail(`${outArgument} exists and is not a site dolly-build wrote`);
  }
  // Every row that names an image names one of the installed directories at its pin.
  const holders = parsed.artifacts.map(reference => holder(reference) ?? fail(`${filename}:${reference.line}: no installed ` +
    `package holds ${reference.location} at that pin (dolly-build init writes the rows of the installed ones)`));
  // One catalog of their closures: the same image at the same pin in each.
  const records = new Map(), staticSources = new Map(), first = new Map();
  for (const directory of holders) {
    for (const record of directory.catalog.images) {
      if (records.has(record.image) && records.get(record.image).sha256 !== record.sha256) {
        fail(`${directory.package} holds ${record.image} at another pin than ${first.get(record.image)}: install packages of one version`);
      }
      records.set(record.image, record);
      first.set(record.image, first.get(record.image) ?? directory.package);
    }
    for (const entry of directory.catalog.staticSources) staticSources.set(entry.path, entry);
  }
  if (records.has(image)) fail(`${image} is already an image of ${first.get(image)}`);
  const declared = parsed.hostRequirements.map(requirement => requirement.split("@")[0]);
  const missing = declared.filter(name => !modules.has(name));
  if (missing.length) fail(`${image} declares ${missing.join(", ")}: install ${missing.map(hostPackage).join(", ")}`);
  const runtime = join(scope, "dolly/dist");
  const identities = { buildId: (await load(join(runtime, "dolly-build-id.mjs"))).DOLLY_BUILD_ID,
    imageBuildId: (await load(join(runtime, "dolly-image-build-id.mjs"))).DOLLY_IMAGE_BUILD_ID };

  const staging = await mkdtemp(join(dirname(outArgument), ".dolly-build-"));
  try {
    // The page's files and the listing of its workspace, the runtime and the host
    // modules the image declares, as their packages hold them, and the worker
    // that isolates the page where the host sends no headers.
    await cp("public", staging, { recursive: true });
    const workspace = join(staging, "workspace");
    if (existsSync(workspace)) {
      const files = (await readdir(workspace, { recursive: true, withFileTypes: true })).filter(entry => entry.isFile())
        .map(entry => relative(workspace, join(entry.parentPath, entry.name)).split(sep).join("/")).sort();
      await writeFile(join(staging, "workspace.json"), `${JSON.stringify(files)}\n`);
    }
    for (const name of new Set(["dolly", ...declared.map(module => modules.get(module).split("/")[0])])) {
      await cp(join(scope, name), join(staging, name), { recursive: true, dereference: true });
    }
    await cp(join(scope, "dolly/coi-serviceworker.js"), join(staging, "coi-serviceworker.js"));
    // The image a build of this recipe on this runtime wrote before is kept.
    if (await built(previous, image, source, identities)) await rename(previous, join(staging, "image"));
    else await buildImage(join(staging, "image"), { filename, source, image, parsed, holders, records, staticSources, declared, identities });
    await rm(outArgument, { recursive: true, force: true });
    await rename(staging, outArgument);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
  console.log(`dolly-build: ${relative(process.cwd(), outArgument) || "."} is the site of ${image}: a static host serves it as it lies`);
}

// Whether DIRECTORY holds IMAGE built from SOURCE by the runtime of these IDENTITIES.
async function built(directory, image, source, identities) {
  const read = async file => JSON.parse(await readFile(join(directory, "dist", file), "utf8").catch(() => "null"));
  const [catalog, metadata] = await Promise.all([read("dolly-images.json"), read(`dolly-${image}-system-snapshot.json`)]);
  return catalog?.images.find(record => record.image === image)?.sha256 === createHash("sha256").update(source).digest("hex") &&
    metadata?.buildId === identities.imageBuildId && metadata?.runtimeBuildId === identities.buildId;
}

// The image directory, laid out as an image package: the closures' metadata and
// recipes, this recipe beside them, the image's metadata and packs, its package
// index and its index.mjs. Every installed directory's packs are served for the
// build alone: a package's directory holds its own, and npm installs the packages
// it installs beside it.
async function buildImage(directory, { filename, source, image, parsed, holders, records, staticSources, declared, identities }) {
  await mkdir(directory);
  for (const holding of new Set(holders)) {
    await cp(holding.directory, directory, { recursive: true, filter: path => ![
      join(holding.directory, "dist/packs"), join(holding.directory, "dist/dolly-images.json"), join(holding.directory, "index.mjs"),
      join(holding.directory, "amy-index.txt"), join(holding.directory, "package.json"), join(holding.directory, "README.md")].includes(path) });
  }
  await writeFile(join(directory, filename), source);
  const graph = await loadRecipeGraph(reference => readFile(join(directory, sitePath(reference).slice(1))), siteReference(filename));
  const catalog = [...records.values(), catalogRecord({ image, filename, source, parsed }, graph)];
  await writeFile(join(directory, "dist/dolly-images.json"), catalogJson(catalog, [...staticSources.values()]));

  const page = "<!doctype html><title>dolly-build</title>";
  // The packages at their names (the runtime at /dolly/, the host modules beside it).
  const roots = [["/", scope], ["/image/", directory],
    ...directories.map(installed => ["/image/dist/packs/", join(installed.directory, "dist/packs")])];
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
  // The browser's own requests (its vendor's updates, clock, autofill) go to a proxy that
  // refuses them: it reaches this server and the recipes' sources alone.
  const refusal = createServer((request, response) => response.writeHead(403).end()).on("connect", (request, socket) => socket.destroy());
  await Promise.all([server, refusal].map(listener => new Promise(listening => listener.listen(0, "127.0.0.1", listening))));
  const origin = `http://127.0.0.1:${server.address().port}`;
  // The recipes' own upstream URLs are the only network the build may use.
  const rules = graph.records.flatMap(record => record.sources.filter(entry => sitePath(entry.location) === null))
    .map(entry => ({ origin: new URL(entry.location).origin, path: new URL(entry.location).pathname, methods: ["GET"] }));
  const browser = await browsers[browserName]({ proxy: { server: `http://127.0.0.1:${refusal.address().port}`,
    bypass: [...new Set(["127.0.0.1", ...rules.map(rule => new URL(rule.origin).hostname)])].join(",") } });
  let inputs;
  try {
    const tab = await browser.newPage();
    tab.setDefaultTimeout(0);
    await tab.exposeFunction("dollyBuildLog", text => void process.stderr.write(text));
    await tab.addInitScript(rules => { globalThis.DOLLY_HTTP_POLICY = { maxRequests: 256, rules }; }, rules);
    await tab.goto(`${origin}/`);
    ({ inputs } = await tab.evaluate(`(${buildImageInPage})(${JSON.stringify(`${origin}/dolly/`)}, ` +
      `${JSON.stringify(`${origin}/image/`)}, ${JSON.stringify(image)}, undefined, ` +
      `${JSON.stringify([...modules.values()].map(path => `${origin}/${path}`))})`));
    await savePageSnapshot(tab, join(directory, `dist/dolly-${image}-system.snapshot`));
  } finally {
    await browser.close();
    server.close();
    refusal.close();
  }

  // Checked and described as the catalog's images are, by the runtime it runs on.
  const runtime = join(scope, "dolly/dist");
  const snapshotPath = join(directory, `dist/dolly-${image}-system.snapshot`), snapshot = await readFile(snapshotPath);
  const decoded = decodeSystemSnapshot(snapshot);
  const entry = verifySnapshotIdentity({ image, source, parsed }, graph, decoded,
    await readWasmInterface(join(runtime, "dolly-process-0.wasm")),
    (await load(join(runtime, "dolly-process-abi.mjs"))).DOLLY_PROCESS_ABI_DIGEST);
  const packed = await ensureSnapshotPacks(join(directory, "dist"),
    snapshotMetadata(image, graph, imageInputs(inputs), snapshot, decoded, entry, identities));
  await writeFile(join(directory, `dist/dolly-${image}-system-snapshot.json`), metadataJson(packed));
  await rm(snapshotPath);

  // The packages it holds, described as the installed directories' indexes describe them.
  const descriptions = new Map();
  for (const installed of directories) {
    const text = await readFile(join(installed.directory, "amy-index.txt"), "utf8").catch(() => "");
    for (const [name, description] of indexDescriptions(text)) descriptions.set(name, description);
  }
  const held = heldPackages(catalog, image);
  await writeFile(join(directory, "amy-index.txt"), amyIndex(catalog.filter(record => held.includes(record.image)), descriptions));
  await writeFile(join(directory, "index.mjs"), indexSource(image, declared.map(name => `../${modules.get(name)}`)));
}
