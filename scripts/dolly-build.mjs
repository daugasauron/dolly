#!/usr/bin/env node
// An npm user's image: builds a Dollyfile that INSTALLs installed packages, or starts
// FROM an installed image, in a browser with that browser's Dolly runtime, into a
// site a static host serves as it lies (docs/npm.md).
//   npx dolly-build init NAME [PACKAGE…]   writes Dollyfile-NAME, Pi's project, public/ (the page) and a CI workflow
//   npx dolly-build add NAME [PACKAGE…]    adds INSTALL rows to Dollyfile-NAME, and writes every row's installed pin
//   npx dolly-build Dollyfile-NAME OUT [--browser chrome|chromium|firefox]
// init and add install with the project's package manager what they name and lack.
// OUT is the files of public/, workspace.json and skills.json listing public/workspace/
// and public/skills/, the runtime
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
import { npmPackageName } from "./npm-names.mjs";
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
const load = path => import(pathToFileURL(path).href);
const usage = `usage: dolly-build init NAME [PACKAGE...]   a project: Pi with the packages named
       dolly-build add NAME [PACKAGE...]    Dollyfile-NAME with these packages too, every row at its installed pin
       dolly-build Dollyfile-NAME OUT [--browser chrome|chromium|firefox]   the site, built in a browser`;
const { positionals, values: { browser: browserName } } = (() => {
  try { return parseArgs({ allowPositionals: true, options: { browser: { type: "string" } } }); } catch { fail(usage); }
})();
// Firefox's system add-on updater resolves its host even behind a proxy.
const browsers = {
  chrome: options => chromium.launch({ channel: "chrome", headless: true, ...options }),
  chromium: options => chromium.launch({ headless: true, ...options }),
  firefox: options => firefox.launch({ headless: true, firefoxUserPrefs: { "extensions.systemAddon.update.enabled": false }, ...options }),
};
// Without --browser: the first of them this machine has.
async function launch(options) {
  for (const name of browserName ? [browserName] : Object.keys(browsers)) {
    try { return await browsers[name](options); } catch (error) {
      if (!/is not found at|Executable doesn't exist/.test(error.message)) throw error;
    }
  }
  fail(`${browserName ?? "a browser"} is not installed: install Chrome, or Playwright's Chromium with ` +
    "npx playwright-core install chromium-headless-shell");
}
const project = ["init", "add"].includes(positionals[0]);
if ((browserName && !browsers[browserName]) || (project ? positionals.length < 2 : positionals.length !== 2)) fail(usage);
const scope = resolve("node_modules/@daugasauron"), beside = resolve(import.meta.dirname, "../..");
const hostPackage = name => `@daugasauron/${npmPackageName("host", name)}`;
const own = JSON.parse(await readFile(join(import.meta.dirname, "../package.json"), "utf8"));
// packages.json, which scripts/package-npm.mjs writes beside dolly-build: the published
// packages and images with the device host modules each declares, and Pi's packages,
// pi-minimal's, which init's recipe installs, in its order.
const { packages: published, images, pi: piPackages } = project
  ? JSON.parse(await readFile(join(import.meta.dirname, "../packages.json"), "utf8")) : {};

// init and add install what they name and the project lacks, at dolly-build's version, with
// the package manager that runs them: the runtime, each PACKAGE, and the device host modules
// they declare (init: Pi's too, and the keyboard's), which packages.json lists for every
// published package and image (scripts/package-npm.mjs). add also installs at that version
// each Dolly package the project depends on and has at another, as after dolly-build's
// update, and the host modules of the packages its recipe installs and of the image it
// starts FROM, which a new version may add to.
if (project) {
  const named = positionals.slice(2), unknown = named.filter(name => !published[name]);
  if (!validName(positionals[1])) fail(`${positionals[1]}: a name is lowercase letters, digits and dashes, at most 32 bytes`);
  if (unknown.length) fail(`${unknown.join(", ")}: no such package. The packages: ${Object.keys(published).sort().join(", ")}`);
  const recipePackages = positionals[0] === "init" ? [] : (await readFile(`Dollyfile-${positionals[1]}`, "utf8").catch(() => ""))
    .split("\n").map(line => /^(?:FROM|INSTALL)\s+(\S+)/.exec(line)?.[1]).filter(Boolean).map(location => imageFileName(recipeFileName(location)));
  const hosts = [...positionals[0] === "init" ? ["input", ...piPackages.flatMap(name => published[name])] : [],
    ...[...named, ...recipePackages].flatMap(name => published[name] ?? images[name] ?? [])];
  // The project's own Dolly packages that are installed at another version.
  const manifest = async directory => JSON.parse(await readFile(join(directory, "package.json"), "utf8").catch(() => "{}"));
  const stale = [];
  for (const name of positionals[0] === "add" ? Object.keys((await manifest(".")).dependencies ?? {}).filter(name => name.startsWith("@daugasauron/dolly")) : []) {
    if ((await manifest(join(scope, basename(name)))).version !== own.version) stale.push(name);
  }
  const missing = [...new Set([...stale,
    ...["@daugasauron/dolly", ...hosts.map(hostPackage)].filter(name => !existsSync(join(scope, basename(name)))),
    ...named.map(name => `@daugasauron/${npmPackageName("package", name)}`).filter(name => ![scope, beside].some(parent => existsSync(join(parent, basename(name)))))])];
  if (missing.length) {
    const manager = /^(pnpm|yarn)\//.exec(process.env.npm_config_user_agent ?? "")?.[1] ?? "npm";
    const command = [manager, manager === "npm" ? "install" : "add", manager === "yarn" ? "--exact" : "--save-exact",
      ...missing.map(name => `${name}@${own.version}`)];
    console.log(`dolly-build: ${command.join(" ")}`);
    if (spawnSync(command[0], command.slice(1), { stdio: "inherit" }).status !== 0) fail("that install failed: run it, then this command again");
  }
}
if (!existsSync(join(scope, "dolly"))) fail("run it where node_modules/@daugasauron/dolly is installed");

// The installed image and package directories (dolly-image-NAME, dolly-package-NAME):
// each holds its own image's packs, and the catalog and metadata of that image's
// closure. npm installs the packages a package installs beside it, pnpm beside its
// real path, and those dolly-build depends on beside dolly-build's.
const directories = [];
for (const pending = [scope, beside]; pending.length;) {
  const parent = pending.pop();
  for (const name of (await readdir(parent)).filter(name => /^dolly-(image|package)-/.test(name))) {
    const directory = await realpath(join(parent, name));
    if (directories.some(found => found.directory === directory)) continue;
    // Its own image: the one in its catalog whose npm name it has.
    const catalog = JSON.parse(await readFile(join(directory, "dist/dolly-images.json"), "utf8"));
    const kind = /^dolly-(image|package)-/.exec(name)[1];
    const image = catalog.images.find(candidate => npmPackageName(kind, candidate.image) === name)?.image
      ?? fail(`${join(parent, name)} holds no image of its name`);
    directories.push({ directory, package: `@daugasauron/${name}`, image, catalog });
    pending.push(dirname(directory));
  }
}
const definitionOf = ({ catalog, image }) => catalog.images.find(candidate => candidate.image === image);
const installed = (image, kind) => directories.find(candidate => candidate.image === image)
  ?? fail(`${image} is not installed: npm install @daugasauron/${npmPackageName(kind, image)}`);
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

// A project: the recipe (the template's HTTP rows, INSTALL of Pi's packages and of each
// PACKAGE at the installed pins, then the template's other rows and ENTRY), public/, the
// page's files (the page, its theme, the workspace and a skill), and the workflow that
// builds the site in CI.
const installRow = definition => `INSTALL ${siteReference(definition.dollyfile)} ${definition.sha256}`;
async function scaffold(name, packages) {
  const installs = [...new Set([...piPackages, ...packages])].map(image => definitionOf(installed(image, "package")));
  // input@0 is the terminal's keyboard; snapshot@0 the page's Save: a save is kept in the
  // browser, and the page opens it again.
  const hosts = [...new Set(installs.flatMap(definition => definition.hostRequirements).concat("input@0", "snapshot@0"))].sort();
  const template = async file => (await readFile(join(import.meta.dirname, "dolly-build-init", file), "utf8")).replaceAll("__NAME__", name);
  const pages = (await readdir(join(import.meta.dirname, "dolly-build-init/public"), { recursive: true, withFileTypes: true }))
    .filter(entry => entry.isFile()).map(entry => relative(join(import.meta.dirname, "dolly-build-init"), join(entry.parentPath, entry.name)).split(sep).join("/")).sort();
  const files = {
    // The template's HTTP rows follow the REQUIRES HOST rows, before the INSTALL rows (__INSTALL__).
    [`Dollyfile-${name}`]: `DOLLY 8\nAPPLICATION ${name}\n${hosts.map(host => `REQUIRES HOST ${host}\n`).join("")}\n` +
      (await template("Dollyfile")).replace("__INSTALL__\n", installs.map(definition => `${installRow(definition)}\n`).join("")),
    ...Object.fromEntries(await Promise.all(pages.map(async file => [file, await template(file)]))),
    [`.github/workflows/${name}.yml`]: await template("workflow.yml"),
  };
  const present = Object.keys(files).filter(file => existsSync(file));
  if (present.length) fail(`${present.join(", ")}: already here`);
  for (const [file, text] of Object.entries(files)) {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, text);
  }
  // The site and node_modules are built, not kept: a .gitignore, unless the project has one.
  if (!existsSync(".gitignore")) await writeFile(".gitignore", `node_modules/\n${name}/\n`);
  console.log(`dolly-build: wrote ${Object.keys(files).join(", ")}\n` +
    `  npx dolly-build Dollyfile-${name} ${name}   builds the image and the site, ${name}/ (again after a change)\n` +
    `  python3 -m http.server -d ${name} -b 127.0.0.1 8080   serves it, as any static host does`);
}

// Dollyfile-NAME with every FROM and INSTALL row at the pin of the installed package that
// holds its recipe, as after an update of the packages, and a row for each PACKAGE it
// lacks, with the host modules those, the packages it installs and the image it starts FROM
// declare at their new pins: FROM carries a base's files, not its host modules.
async function add(name, packages) {
  const file = `Dollyfile-${name}`, lines = (await readFile(file, "utf8").catch(() =>
    fail(`${file}: no such recipe here (dolly-build init ${name} writes one)`))).split("\n");
  const held = new Set(), rows = [], repeated = [];
  let repinned = 0;
  for (const [index, line] of lines.entries()) {
    const [, operation, location, pin] = /^(FROM|INSTALL)\s+(\S+)\s+([0-9a-f]{64})\s*$/.exec(line) ?? [];
    if (!operation) continue;
    rows.push(index);
    const directory = directories.find(candidate => candidate.image === imageFileName(recipeFileName(location)));
    if (!directory) continue;
    held.add(directory.image);
    const definition = definitionOf(directory);
    repeated.push(definition);
    if (definition.sha256 !== pin) repinned++;
    lines[index] = `${operation} ${siteReference(definition.dollyfile)} ${definition.sha256}`;
  }
  if (!rows.length) fail(`${file}: no FROM or INSTALL row to add after`);
  const added = [...new Set(packages)].filter(image => !held.has(image)).map(image => definitionOf(installed(image, "package")));
  lines.splice(rows.at(-1) + 1, 0, ...added.map(installRow));
  const declared = new Set(lines.map(line => /^REQUIRES HOST (\S+)/.exec(line)?.[1]));
  const hosts = [...new Set([...repeated, ...added].flatMap(definition => definition.hostRequirements))].filter(host => !declared.has(host));
  lines.splice(lines.findLastIndex(line => line.startsWith("REQUIRES HOST ")) + 1, 0, ...hosts.map(host => `REQUIRES HOST ${host}`));
  await writeFile(file, lines.join("\n"));
  console.log(`dolly-build: ${file}: ${added.length ? `added ${added.map(definition => definition.image).join(", ")}` : "no package added"}` +
    `${hosts.length ? ` (${hosts.join(", ")})` : ""}; rows at a new pin: ${repinned}\n` +
    `  npx dolly-build ${file} ${name}   builds it`);
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
    `package holds ${reference.location} at that pin (dolly-build add ${image} writes the installed pins)`));
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
    for (const tree of ["workspace", "skills"].filter(tree => existsSync(join(staging, tree)))) {
      const files = (await readdir(join(staging, tree), { recursive: true, withFileTypes: true })).filter(entry => entry.isFile())
        .map(entry => relative(join(staging, tree), join(entry.parentPath, entry.name)).split(sep).join("/")).sort();
      await writeFile(join(staging, `${tree}.json`), `${JSON.stringify(files)}\n`);
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
  const reaches = siteHttpPolicy(parsed).rules.map(rule => `\n  ${rule.methods.join(" ")} ${rule.origin}${rule.path ?? `${rule.pathPrefix}*`}` +
    (rule.credentialHeaders.length ? ` with ${rule.credentialHeaders.join(" ")}` : ""));
  console.log(`dolly-build: ${relative(process.cwd(), outArgument) || "."} is the site of ${image}: a static host serves it as it lies\n` +
    `dolly-build: its page lets the image make ${reaches.length ? `these requests and no other:${reaches.join("")}` : "no request: the recipe declares no HTTP row"}`);
}

// The policy the site's page applies to the image: its recipe's HTTP rows, which the
// recipe's parser checked as the page does; a recipe without one reaches nothing.
const siteHttpPolicy = parsed => parsed.httpPolicy ?? { rules: [] };

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
  // The site's page admits the requests the recipe declares, and none without a declaration.
  const catalog = [...records.values(), { ...catalogRecord({ image, filename, source, parsed }, graph), httpPolicy: siteHttpPolicy(parsed) }];
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
  // What the build asks of this server through the relay is not a host it reaches.
  reached.add(origin);
  // The environment's proxy is the relay's alone: Firefox takes HTTP_PROXY from its
  // environment over the proxy it is given and sent its page's own address there.
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(?:https?|all|no)_proxy$/i.test(name)));
  const browser = await launch({ env, proxy: { server: `http://127.0.0.1:${refusal.address().port}`, bypass: "127.0.0.1" } });
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
  if (project) await (positionals[0] === "init" ? scaffold : add)(positionals[1], positionals.slice(2));
  else await build(...positionals.map(path => resolve(path)));
} catch (error) {
  fail(error.message);
}
