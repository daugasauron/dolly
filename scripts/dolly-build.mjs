#!/usr/bin/env node
// An npm user's image: builds a Dollyfile that INSTALLs installed packages, or starts
// FROM an installed image, in a browser with that browser's Dolly runtime, into a
// site a static host serves as it lies (docs/embedding.md, "Your own image").
//   npx dolly-build init NAME [PACKAGE…]   writes Dollyfile-NAME, Pi's project, and public/ (the page)
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
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { Readable } from "node:stream";
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
import { loadRecipeGraph } from "../site/dollyfile-graph.mjs";
import { imageFileName, inspectDollyfile, recipeFileName } from "../site/dollyfile-view.mjs";
import { imageInputs } from "../page/image-inputs.mjs";
import { validName } from "../page/image-names.mjs";
import { siteReference, sitePath } from "../page/static-asset.mjs";

// A build reaches the network through Node (relay below), and through the proxy the
// environment names, as a CI runner's often does, which Node's fetch takes only with
// NODE_USE_ENV_PROXY set: dolly-build runs itself again with it.
if (["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"].some(name => process.env[name]) && !process.env.NODE_USE_ENV_PROXY) {
  const { status } = spawnSync(process.execPath, process.argv.slice(1), { stdio: "inherit",
    env: { ...process.env, NODE_USE_ENV_PROXY: "1" } });
  process.exit(status ?? 1);
}

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
// real path, and those dolly-build depends on beside dolly-build's.
const directories = [];
for (const pending = [scope, resolve(import.meta.dirname, "../..")]; pending.length;) {
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


// Pi's packages, which init's recipe installs: those dolly-build depends on, pi-minimal's
// (scripts/package-npm.mjs), in its order.
const piPackages = Object.keys(JSON.parse(await readFile(join(import.meta.dirname, "../package.json"), "utf8")).dependencies ?? {})
  .filter(dependency => dependency.startsWith("@daugasauron/dolly-package-")).map(dependency => dependency.replace("@daugasauron/dolly-package-", ""));
// A project: the recipe (INSTALL of Pi's packages and of each PACKAGE at the installed
// pins, then the template's rows and ENTRY) and public/, the page's files: the page,
// its theme and the workspace.
async function scaffold(name, packages) {
  if (!validName(name)) fail(`${name}: a name is lowercase letters, digits and dashes, at most 32 bytes`);
  const installs = [...new Set([...piPackages, ...packages])].map(image => definitionOf(installed(image, "package")));
  // input@0 is the terminal's keyboard; snapshot@0 the page's Save: a save is kept in the
  // browser, and the page opens it again.
  const hosts = [...new Set(installs.flatMap(definition => definition.hostRequirements).concat("input@0", "snapshot@0"))].sort();
  const row = definition => `INSTALL ${siteReference(definition.dollyfile)} ${definition.sha256}\n`;
  const template = async file => (await readFile(join(import.meta.dirname, "dolly-build-init", file), "utf8")).replaceAll("__NAME__", name);
  const files = {
    [`Dollyfile-${name}`]: `DOLLY 7\nAPPLICATION ${name}\n${hosts.map(host => `REQUIRES HOST ${host}\n`).join("")}\n` +
      installs.map(row).join("") + "\n" + await template("Dollyfile"),
    "public/index.html": await template("public/index.html"),
    "public/main.mjs": await template("public/main.mjs"),
    "public/page.css": await template("public/page.css"),
    "public/icon.svg": await template("public/icon.svg"),
    "public/theme.json": await template("public/theme.json"),
    "public/workspace/README.md": await template("public/workspace/README.md"),
  };
  const present = Object.keys(files).filter(file => existsSync(file));
  if (present.length) fail(`${present.join(", ")}: already here`);
  await mkdir("public/workspace", { recursive: true });
  for (const [file, text] of Object.entries(files)) await writeFile(file, text);
  // The site and node_modules are built, not kept: a .gitignore, unless the project has one.
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
  // The build runs the recipe engine of its base, or of the dollyfile package it installs.
  const engine = parsed.artifacts.some(({ operation, location }) => operation === "install" &&
    imageFileName(recipeFileName(location)) === "dollyfile");
  if (!parsed.from && !engine) fail(`${filename}: FROM an installed image, or INSTALL the dollyfile package`);
  if (!existsSync("public/index.html")) fail("public/index.html: the page of the site (dolly-build init writes one)");
  // A rebuild replaces the site it wrote before, and nothing else.
  const previous = join(outArgument, "image");
  if (existsSync(outArgument) && !existsSync(join(previous, "dist/dolly-images.json"))) {
    fail(`${outArgument} exists and is not a site dolly-build wrote: remove it, or name another`);
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

// A request of the build's, which the page's broker admitted, fetched by Node: a host
// without CORS headers, a redirect between hosts and the environment's proxy (above)
// work as on any machine. /relay/SCHEME/HOST/PATH?QUERY names it; a build's steps reach
// any host, as a session's programs do on Dolly's site, and each host is named once.
const reached = new Set();
const unsent = new Set(["host", "connection", "origin", "referer", "cookie", "accept-encoding", "content-length"]);
const unreturned = new Set(["connection", "content-encoding", "content-length", "transfer-encoding", "set-cookie"]);
async function relay(request, response, url) {
  const [scheme, ...rest] = url.pathname.slice("/relay/".length).split("/");
  if (!["http", "https"].includes(scheme) || !rest.length) return response.writeHead(400).end();
  const target = new URL(`${scheme}://${rest.join("/")}${url.search}`);
  if (!reached.has(target.origin)) {
    reached.add(target.origin);
    process.stderr.write(`dolly-build: the build reaches ${target.origin}\n`);
  }
  const headers = Object.entries(request.headers).filter(([name]) => !unsent.has(name) && !name.startsWith("sec-"));
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  try {
    const answer = await fetch(target, { method: request.method, headers, redirect: "follow",
      body: ["GET", "HEAD"].includes(request.method) ? undefined : Buffer.concat(chunks) });
    // x-dolly-relay-url: where the redirects followed ended, for the page (page-image-build.mjs).
    response.writeHead(answer.status, { ...Object.fromEntries([...answer.headers].filter(([name]) => !unreturned.has(name))),
      ...isolationHeaders, "x-dolly-relay-url": answer.url });
    if (answer.body) Readable.fromWeb(answer.body).pipe(response); else response.end();
  } catch (error) {
    response.writeHead(502, { "content-type": "text/plain" }).end(`${target.origin}: ${error.cause?.message ?? error.message}\n`);
  }
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
    const url = new URL(request.url, "http://127.0.0.1");
    if (url.pathname.startsWith("/relay/")) return relay(request, response, url);
    const path = decodeURIComponent(url.pathname);
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
  // refuses them: the page reaches this server alone, the build's network through relay().
  const refusal = createServer((request, response) => response.writeHead(403).end()).on("connect", (request, socket) => socket.destroy());
  await Promise.all([server, refusal].map(listener => new Promise(listening => listener.listen(0, "127.0.0.1", listening))));
  const origin = `http://127.0.0.1:${server.address().port}`;
  // The environment's proxy is the relay's alone: Firefox takes HTTP_PROXY from its
  // environment over the proxy it is given and sent its page's own address there.
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(?:https?|all|no)_proxy$/i.test(name)));
  const browser = await browsers[browserName]({ env, proxy: { server: `http://127.0.0.1:${refusal.address().port}`, bypass: "127.0.0.1" } });
  let inputs;
  try {
    const tab = await browser.newPage();
    tab.setDefaultTimeout(0);
    await tab.exposeFunction("dollyBuildLog", text => void process.stderr.write(text));
    await tab.goto(`${origin}/`);
    ({ inputs } = await tab.evaluate(`(${buildImageInPage})(${JSON.stringify(`${origin}/dolly/`)}, ` +
      `${JSON.stringify(`${origin}/image/`)}, ${JSON.stringify(image)}, undefined, ` +
      `${JSON.stringify([...modules.values()].map(path => `${origin}/${path}`))}, ${JSON.stringify(`${origin}/relay/`)})`));
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

// Last, once every constant above is initialized: the relay reads them during a build.
try {
  if (init) await scaffold(positionals[1], positionals.slice(2));
  else await build(...positionals.map(path => resolve(path)));
} catch (error) {
  fail(error.message);
}
