import { createReadStream } from "node:fs";
import { access, readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { processSmokeSources } from "./fixtures/process-smoke.mjs";
import { tarArchive } from "./fixtures/tar.mjs";
import { buildIdentities } from "../scripts/write-build-id.mjs";
import { imageInputsMatch } from "../src/image-inputs.mjs";

export const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".md", "text/markdown; charset=utf-8"],
  [".dm", "text/plain; charset=utf-8"],
  [".h", "text/plain; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".wasm", "application/wasm"],
  [".data", "application/octet-stream"],
  [".snapshot", "application/octet-stream"],
  [".woff2", "font/woff2"],
]);
export const browserSources = new Set([
  "test/fixtures/browser-boundary.mjs",
  "test/fixtures/http-admission-worker.mjs",
  "test/fixtures/browser-process-abi.mjs",
  "coi-serviceworker.js",
  "index.html",
  "src/browser.mjs",
  "src/dollyfile-view.mjs",
  "src/http-policy.mjs",
  "src/http-broker.mjs",
  "src/local-model-contract.mjs",
  "src/local-model-service.mjs",
  "src/local-model-ui.mjs",
  "src/qwen-completions.mjs",
  "src/webgpu-worker.mjs",
  "src/kernel-plugin.mjs",
  "src/image-entry.mjs",
  "src/image-artifact.mjs",
  "src/image-build.mjs",
  "src/image-builder.mjs",
  "src/image-build-page.mjs",
  "src/image-build-service.mjs",
  "src/image-build-ui.mjs",
  "src/local-services.mjs",
  "src/custom-image.mjs",
  "src/image-inputs.mjs",
  "src/snapshot-records.mjs",
  "src/static-asset.mjs",
  "src/source-download.mjs",
  "src/process-ffi.mjs",
  "src/process-abi.mjs",
  "src/wasm-interface.mjs",
  "src/process-supervisor.mjs",
  "src/process-worker.mjs",
  "src/session-store.mjs",
  "src/session-file.mjs",
  "src/session-transport.mjs",
  "src/upload-transport.mjs",
  "src/custom-dollyfile.mjs",
  "src/sessions.mjs",
  "src/runtime-worker.mjs",
]);

export async function startBrowserServer(projectDir, image = "default") {
  await Promise.all(["dolly-images.mjs", "dolly.wasm", "dolly.data", `dolly-${image}-system.snapshot`]
    .map(path => access(resolve(projectDir, "dist", path)))).catch(error => {
      throw new Error(`Core browser checks need a built runtime and ${image} image. Run npm run build:runtime once, then npm run image -- ${image}.`, { cause: error });
    });
  const { DOLLY_IMAGES, DOLLY_STATIC_SOURCES } = await import(pathToFileURL(resolve(projectDir, "dist/dolly-images.mjs")));
  if (!DOLLY_IMAGES.some(definition => definition.image === image)) {
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
        const parent = DOLLY_IMAGES.find(candidate => `/${candidate.dollyfile}` === reference.location && candidate.sha256 === reference.sha256);
        if (!parent) throw new Error(`${reference.location} is missing from the registry`);
        inputs.push({ recipeSha256: reference.sha256, sha256: (await check(parent)).sha256 });
      }
      if (!imageInputsMatch(metadata.inputs, inputs)) throw new Error(`${definition.image} has stale dependency outputs`);
      return metadata;
    }
    const metadata = await check(DOLLY_IMAGES.find(definition => definition.image === image));
    for (const recipe of metadata.recipes) {
      const bytes = await readFile(resolve(projectDir, recipe.sourcePath.slice(1)));
      if (createHash("sha256").update(bytes).digest("hex") !== recipe.sha256) throw new Error(`${recipe.sourcePath} changed`);
    }
  } catch (error) {
    throw new Error(`Core artifacts are stale or incomplete: ${error.message}. Rebuild changed native code with npm run build:runtime, then run npm run image -- ${image}.`, { cause: error });
  }
  const files = new Map([...browserSources].map(path => [`/${path}`, path]));
  for (const definition of DOLLY_IMAGES) {
    files.set(`/${definition.dollyfile}`, definition.dollyfile);
    for (const suffix of [".snapshot", "-snapshot.mjs"]) {
      const path = `dist/dolly-${definition.image}-system${suffix}`;
      files.set(`/${path}`, path);
    }
  }
  for (const source of DOLLY_STATIC_SOURCES) files.set(source.path,
    source.path.startsWith("/static/") ? `dist${source.path}` : source.path.slice(1));
  for (const name of await readdir(resolve(projectDir, "dist"))) {
    if (/^dolly(?:-[a-z0-9-]+)?\.(?:wasm|mjs|data)$/.test(name) || name === "IosevkaTerm-SemiBold.woff2") {
      files.set(`/dist/${name}`, `dist/${name}`);
    }
  }
  for (const [name, path] of Object.entries(processSmokeSources)) files.set(`/fixture/${name}`, path);
  for (const name of ["process-wrong-call", "process-wrong-start", "process-wrong-memory"]) {
    files.set(`/fixture/${name}.wasm`, `build/${name}.wasm`);
  }
  files.set(`/${image}`, `build/routes/${image}/index.html`);
  files.set("/custom", "build/routes/custom/index.html");
  files.set("/custom/rebuild", "build/routes/custom/rebuild/index.html");
  files.set("/custom/run", "build/routes/custom/run/index.html");
  files.set("/session", "build/routes/session/index.html");
  const requests = new Set();
  let cancelledRequests = 0;
  const server = createServer(async (request, response) => {
    const headers = { "cache-control": "no-store", "cross-origin-opener-policy": "same-origin",
      "cross-origin-embedder-policy": "require-corp", "cross-origin-resource-policy": "same-origin" };
    try {
      const path = decodeURIComponent(new URL(request.url, "http://localhost").pathname).replace(/\/+$/, "");
      requests.add(path);
      if (!["GET", "HEAD"].includes(request.method)) throw new Error("unsupported method");
      if (path === "/fixture/http.txt") {
        response.writeHead(200, { ...headers, "content-type": "text/plain" });
        response.end(request.method === "HEAD" ? undefined : "FETCHED-THROUGH-BROWSER\n");
        return;
      }
      if (path === "/fixture/slow") {
        response.writeHead(200, { ...headers, "content-type": "text/plain" });
        response.write("waiting for cancellation\n");
        response.once("close", () => { cancelledRequests++; });
        return;
      }
      if (path === "/fixture/root.tar") {
        response.writeHead(200, { ...headers, "content-type": "application/octet-stream" });
        response.end(request.method === "HEAD" ? undefined : Buffer.concat([
          tarArchive("./", Buffer.alloc(0), "5").subarray(0, 512),
          tarArchive("./file", Buffer.from("root preserved")),
        ]));
        return;
      }
      const relative = /^\/session\/[A-Za-z0-9._-]{1,64}$/.test(path)
        ? "build/routes/session/open.html" : files.get(path);
      if (!relative) throw new Error("not a test asset");
      const filename = resolve(projectDir, relative);
      const stream = createReadStream(filename);
      stream.once("error", () => { if (!response.headersSent) response.writeHead(404, headers); response.end(); });
      stream.once("open", () => {
        response.writeHead(200, { ...headers, "content-type": mimeTypes.get(extname(filename)) ?? "application/octet-stream" });
        if (request.method === "HEAD") { stream.destroy(); response.end(); }
        else stream.pipe(response);
      });
    } catch {
      response.writeHead(404, headers).end();
    }
  });
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  return { origin: `http://127.0.0.1:${server.address().port}`, requests,
    get cancelledRequests() { return cancelledRequests; },
    close: () => new Promise(resolveClose => { server.close(resolveClose); server.closeAllConnections(); }) };
}
