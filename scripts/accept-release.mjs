// Release acceptance (scripts/site-release.mjs accept; test/image-inventory-browser.mjs
// runs the same check on the checkout): each image's /bin, /etc and /usr must be
// exactly its sealed manifest. A build in the page checks that for any image;
// images with a display also boot their prebuilt route without the compiler seed.
import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve } from "node:path";
import { buildImageInPage } from "./page-image-build.mjs";
import { isolationHeaders, mimeTypes } from "./serve.mjs";

const inventory = (await readFile(new URL("./image-inventory.c", import.meta.url), "utf8"))
  .replace('#include "sha256.h"', await readFile(new URL("../src/sha256.h", import.meta.url), "utf8"));
const seedRequested = requests => [...requests.keys()].some(path => /\/dist\/dolly(?:\.data|-seed\.mjs)$/.test(path));

// SERVER is { origin, requests (path -> count) } and answers /__dolly_build_page.
export async function acceptImage(browser, server, image) {
  server.requests.clear();
  const page = await browser.newPage();
  page.setDefaultTimeout(0);
  let log = "";
  await page.exposeFunction("dollyBuildLog", text => { log = (log + text).slice(-8192); });
  await page.goto(`${server.origin}/__dolly_build_page`);
  const { definition, manifestHash } = await page.evaluate(async image => {
    const definition = (await import("/dist/dolly-images.mjs")).DOLLY_IMAGES.find(item => item.image === image);
    const { DOLLY_SYSTEM_SNAPSHOT: { manifest } } = await import(`/dist/dolly-${image}-system-snapshot.mjs`);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(manifest.join("\n") + "\n"));
    return { definition, manifestHash: [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("") };
  }, image);
  const artifact = `/etc/dolly/artifacts/${definition.sha256}.snapshot`;
  // A build-only toolchain over the image, declaring exactly the image's host modules.
  const hosts = definition.hostRequirements.map(requirement => `REQUIRES HOST ${requirement}\n`).join("");
  const recipe = `DOLLY 6\nTOOLCHAIN inventory\n${hosts}FROM https://daugasauron.com/${definition.dollyfile} ${definition.sha256}\n` +
    `FILE /tmp/inventory.c\n${inventory.trimEnd().split("\n").map(line => `    ${line}`).join("\n")}\n` +
    "SLOP cc -O1 /tmp/inventory.c -o /tmp/inventory\nSLOP help > /tmp/help\n" +
    `SLOP if /tmp/inventory /tmp/help ${"0".repeat(64)} ${artifact}; then exit 1; fi\n` +
    `SLOP /tmp/inventory /tmp/help ${manifestHash} ${artifact}\n` +
    // An unretained file must fail the same check.
    `SLOP help > /usr/inventory-extra\nSLOP if /tmp/inventory /tmp/help ${manifestHash} ${artifact}; then exit 1; fi\n` +
    "SLOP rm /usr/inventory-extra\n";
  await page.evaluate(`(${buildImageInPage})(location.origin + "/", "custom", ${JSON.stringify(recipe)})`)
    .catch(error => { throw new Error(`${image}: ${error.message}\n${log}`, { cause: error }); });
  assert.equal(seedRequested(server.requests), false, `${image}: building on a published image fetched the compiler seed`);
  await page.close();
  const { hostRequirements } = definition;
  if (!hostRequirements.includes("display@0") || hostRequirements.includes("gpu@0")) return;
  server.requests.clear();
  // The default ENTRY reaches its shell without network requests.
  const route = await browser.newPage();
  await route.goto(`${server.origin}/${image}/`);
  await route.waitForFunction(() => ["ready", "failed"].includes(document.documentElement.dataset.dollyStatus), null, { timeout: 120_000 });
  assert.equal(await route.evaluate(() => document.documentElement.dataset.dollyStatus), "ready",
    `${image}: ${await route.locator("#bootstrap-log").textContent()}`);
  if (image === "default") await route.evaluate(() => __dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "shell"));
  assert.equal(seedRequested(server.requests), false, `${image}: prebuilt boot fetched the compiler seed`);
  if (image === "default") assert.equal(await route.evaluate(() => __dolly.httpRequestCount), 0);
  await route.close();
}

// Serves a staged release as a static host does: files at their paths, a
// directory's index.html, and 404.html for unknown pages.
export async function startSiteServer(site) {
  const requests = new Map();
  const server = createServer(async (request, response) => {
    const path = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    requests.set(path, (requests.get(path) ?? 0) + 1);
    if (path === "/__dolly_build_page") {
      response.writeHead(200, { ...isolationHeaders, "content-type": "text/html; charset=utf-8" });
      response.end("<!doctype html><title>Dolly release acceptance</title>");
      return;
    }
    const relative = path.slice(1);
    let file = resolve(site, relative), status = 200;
    try {
      if (/[\\\0]/.test(relative) || relative.split("/").some(part => part === "." || part === "..")) throw new Error();
      if ((await stat(file)).isDirectory()) file = resolve(file, "index.html");
      if (!(await stat(file)).isFile()) throw new Error();
    } catch {
      if (request.headers["sec-fetch-mode"] !== "navigate") {
        response.writeHead(404, isolationHeaders).end();
        return;
      }
      [file, status] = [resolve(site, "404.html"), 404];
    }
    response.writeHead(status, { ...isolationHeaders, "content-type": /(?:^|\/)Dollyfile(?:-|$)/.test(relative)
      ? "text/plain; charset=utf-8" : mimeTypes.get(extname(file)) ?? "application/octet-stream" });
    if (request.method === "HEAD") response.end(); else createReadStream(file).pipe(response);
  });
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  return { origin: `http://127.0.0.1:${server.address().port}`, requests,
    close: () => new Promise(resolveClose => { server.close(resolveClose); server.closeAllConnections(); }) };
}
