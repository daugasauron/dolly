#!/usr/bin/env node
// Serves this checkout and its current dist/ on 127.0.0.1 to a browser, the
// browser tests and the image builder: npm run dev [-- IMAGE] (DOLLY_PORT,
// default 8080). Only what a page loads is served: src/*.mjs, host modules,
// recipes and their sources, the runtime, snapshots and generated pages, and
// /__dolly_build_page, a blank page for scripts that build images in it.
import { createReadStream } from "node:fs";
import { access, readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { bundleProcessWorker } from "./bundle-process-worker.mjs";
import { pageRoutes } from "./image-menu.mjs";
import { isolationHeaders, mimeTypes } from "./serve.mjs";
import { buildIdentities } from "./write-build-id.mjs";
import { imageInputsMatch } from "../src/image-inputs.mjs";
import { CANONICAL_ORIGIN, canonicalPath } from "../src/static-asset.mjs";

// IMAGE's current snapshot chain is required; null requires none (the builder,
// whose image is being built). Options: port; files (URL path -> checkout
// path, served in addition); sourceOverrides (URL path -> body, may change
// while serving); responseHeaders (added to every response); handle(request,
// response, path, headers), which returns true when it answered the request.
export async function startCheckoutServer(projectDir, image = "default",
  { port = 0, files: extraFiles = new Map(), sourceOverrides = new Map(), responseHeaders = {}, handle } = {}) {
  await bundleProcessWorker(projectDir);
  const rebuild = image ? `npm run image -- ${image}` : "npm run image -- IMAGE";
  await Promise.all(["dolly-images.mjs", "dolly.wasm", "dolly.data", ...image ? [`dolly-${image}-system.snapshot`] : []]
    .map(path => access(resolve(projectDir, "dist", path)))).catch(error => {
      throw new Error(`Browser checks need a built runtime and image. Run npm run build:runtime once, then ${rebuild}.`, { cause: error });
    });
  const { DOLLY_IMAGES, DOLLY_STATIC_SOURCES } = await import(pathToFileURL(resolve(projectDir, "dist/dolly-images.mjs")));
  if (image && !DOLLY_IMAGES.some(definition => definition.image === image)) {
    throw new Error(`Build ${image} once with npm run image -- ${image}, then retry the browser check.`);
  }
  try {
    const load = file => import(pathToFileURL(resolve(projectDir, "dist", file)).href);
    const [{ DOLLY_BUILD_ID }, { DOLLY_IMAGE_BUILD_ID }] = await Promise.all([
      load("dolly-build-id.mjs"), load("dolly-image-build-id.mjs"),
    ]);
    const actual = await buildIdentities(resolve(projectDir, "dist/dolly.wasm"), resolve(projectDir, "dist/dolly.data"));
    if (actual.buildId !== DOLLY_BUILD_ID || actual.imageBuildId !== DOLLY_IMAGE_BUILD_ID) throw new Error("runtime identity is stale");
    const checked = new Map();
    async function check(definition) {
      if (checked.has(definition.image)) return checked.get(definition.image);
      const { DOLLY_SYSTEM_SNAPSHOT: metadata } = await load(`dolly-${definition.image}-system-snapshot.mjs`);
      if (metadata.buildId !== DOLLY_IMAGE_BUILD_ID ||
          JSON.stringify(metadata.recipes) !== JSON.stringify(definition.recipes)) throw new Error(`${definition.image} inputs are stale`);
      checked.set(definition.image, metadata);
      const inputs = [];
      for (const reference of definition.artifacts) {
        const parent = DOLLY_IMAGES.find(candidate =>
          `${CANONICAL_ORIGIN}/${candidate.dollyfile}` === reference.location && candidate.sha256 === reference.sha256);
        if (!parent) throw new Error(`${reference.location} is missing from the registry`);
        inputs.push({ recipeSha256: reference.sha256, sha256: (await check(parent)).sha256 });
      }
      if (!imageInputsMatch(metadata.inputs, inputs)) throw new Error(`${definition.image} has stale dependency outputs`);
      return metadata;
    }
    if (image) for (const recipe of (await check(DOLLY_IMAGES.find(definition => definition.image === image))).recipes) {
      const bytes = await readFile(resolve(projectDir, canonicalPath(recipe.sourcePath).slice(1)));
      if (createHash("sha256").update(bytes).digest("hex") !== recipe.sha256) throw new Error(`${recipe.sourcePath} changed`);
    }
  } catch (error) {
    throw new Error(`Core artifacts are stale or incomplete: ${error.message}. Rebuild changed native code with npm run build:runtime, then run ${rebuild}.`, { cause: error });
  }
  const listed = async (directory, pattern) => (await readdir(resolve(projectDir, directory), { recursive: true }))
    .filter(name => pattern.test(name)).map(name => `${directory}${name}`);
  const paths = new Set([
    ...await listed("src/", /^[^/]+\.mjs$/),
    ...await listed("host/", /\.(?:mjs|json)$/),
    "coi-serviceworker.js", "robots.txt", "index.html", "licences/index.html", "custom/index.html", "sessions/index.html",
    "dist/dolly-packages.txt",
    ...pageRoutes(DOLLY_IMAGES.map(definition => ({ image: definition.image,
      openable: definition.entry && definition.hostRequirements.includes("display@0") })), image).map(route => route.path),
    ...DOLLY_STATIC_SOURCES.map(source => source.path.slice(1)),
  ]);
  for (const definition of DOLLY_IMAGES) {
    paths.add(definition.dollyfile);
    paths.add(`view/${definition.image}/index.html`);
    paths.add(`dist/dolly-${definition.image}-system.snapshot`);
    paths.add(`dist/dolly-${definition.image}-system-snapshot.mjs`);
  }
  for (const name of await readdir(resolve(projectDir, "dist"))) {
    if (/^dolly(?:-[a-z0-9-]+)?\.(?:wasm|mjs|data)$/.test(name) || name === "IosevkaTerm-SemiBold.woff2") paths.add(`dist/${name}`);
  }
  for (const name of await readdir(resolve(projectDir, "dist/packs")).catch(error => {
    if (error.code === "ENOENT") return [];
    throw error;
  })) {
    if (/^[0-9a-f]{64}\.snapshot\.gz$/.test(name)) paths.add(`dist/packs/${name}`);
  }
  // Served paths are checkout paths; a directory URL serves its index.html.
  const files = new Map([...paths].map(path => [`/${path}`, path]));
  for (const [path, file] of extraFiles) files.set(path, file);
  const requests = new Map();
  const server = createServer(async (request, response) => {
    const headers = { ...isolationHeaders, ...responseHeaders };
    try {
      const path = decodeURIComponent(new URL(request.url, "http://localhost").pathname).replace(/\/+$/, "");
      requests.set(path, (requests.get(path) ?? 0) + 1);
      if (await handle?.(request, response, path, headers)) return;
      if (!["GET", "HEAD"].includes(request.method)) throw new Error("unsupported method");
      if (path === "/__dolly_build_page") {
        response.writeHead(200, { ...headers, "content-type": "text/html; charset=utf-8" });
        response.end("<!doctype html><title>Dolly image build</title>");
        return;
      }
      const relative = files.get(path) ?? files.get(`${path}/index.html`);
      if (!relative) throw new Error("not served");
      if (path.startsWith("/dist/packs/")) headers["cache-control"] = "public, max-age=31536000, immutable";
      const type = mimeTypes.get(extname(relative)) ?? "application/octet-stream";
      if (sourceOverrides.has(path)) {
        response.writeHead(200, { ...headers, "content-type": type });
        response.end(request.method === "HEAD" ? undefined : sourceOverrides.get(path));
        return;
      }
      const stream = createReadStream(resolve(projectDir, relative));
      stream.once("error", () => { if (!response.headersSent) response.writeHead(404, headers); response.end(); });
      stream.once("open", () => {
        response.writeHead(200, { ...headers, "content-type": type });
        if (request.method === "HEAD") { stream.destroy(); response.end(); }
        else stream.pipe(response);
      });
    } catch {
      if (!response.headersSent) response.writeHead(404, headers);
      response.end();
    }
  });
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolveListen);
  });
  return { origin: `http://127.0.0.1:${server.address().port}`, requests,
    close: () => new Promise(resolveClose => { server.close(resolveClose); server.closeAllConnections(); }) };
}

if (process.argv[1] === import.meta.filename) {
  if (process.argv.length > 3) throw new Error("usage: npm run dev [-- IMAGE]");
  const image = process.argv[2] ?? "default";
  const server = await startCheckoutServer(resolve(import.meta.dirname, ".."), image, { port: Number(process.env.DOLLY_PORT ?? 8080) });
  console.log(`dolly: ${server.origin}/${image}/ serves this checkout; restart after editing src/process-worker.mjs`);
}
