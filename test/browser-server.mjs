import { createReadStream } from "node:fs";
import { access, readdir } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { processSmokeSources } from "./fixtures/process-smoke.mjs";

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
  files.set(`/${image}`, `build/routes/${image}/index.html`);
  const requests = new Set();
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
    close: () => new Promise(resolveClose => { server.close(resolveClose); server.closeAllConnections(); }) };
}
