import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { browserTest } from "./browser.mjs";
import { mimeTypes } from "./browser-server.mjs";
import { buildSnapshot } from "./fixtures/snapshot-build.mjs";

// Each image's /bin, /etc and /usr must be exactly its sealed manifest. A build
// worker checks that for any image (whatever its ENTRY or display); images with
// a display also boot their prebuilt route without the compiler seed. Release
// acceptance serves a packaged site instead: DOLLY_BROWSER_SITE=DIR DOLLY_IMAGE=IMAGE.
const site = process.env.DOLLY_BROWSER_SITE && resolve(process.env.DOLLY_BROWSER_SITE);
if (site && !process.env.DOLLY_IMAGE) throw new Error("DOLLY_BROWSER_SITE requires DOLLY_IMAGE");
const images = site ? [process.env.DOLLY_IMAGE] : ["default", "system-build"];
const inventory = (await readFile(new URL("./fixtures/image-inventory.c", import.meta.url), "utf8"))
  .replace('#include "sha256.h"', await readFile(new URL("../src/sha256.h", import.meta.url), "utf8"));

async function handle(request, response, path, headers) {
  if (path === "/__dolly_build_page") {
    response.writeHead(200, { ...headers, "content-type": "text/html; charset=utf-8" });
    response.end('<!doctype html><title>Dolly image inventory</title><pre id="bootstrap-log"></pre>');
    return true;
  }
  if (!site) return false;
  const relative = path.slice(1);
  let file = resolve(site, relative), status = 200;
  try {
    if (/[\\\0]/.test(relative) || relative.split("/").some(part => part === "." || part === "..")) throw new Error();
    if ((await stat(file)).isDirectory()) file = resolve(file, "index.html");
    if (!(await stat(file)).isFile()) throw new Error();
  } catch {
    if (request.headers["sec-fetch-mode"] !== "navigate") {
      response.writeHead(404, headers).end();
      return true;
    }
    [file, status] = [resolve(site, "404.html"), 404];
  }
  response.writeHead(status, { ...headers, "content-type": /(?:^|\/)Dollyfile(?:-|$)/.test(relative)
    ? "text/plain; charset=utf-8" : mimeTypes.get(extname(file)) ?? "application/octet-stream" });
  if (request.method === "HEAD") response.end(); else createReadStream(file).pipe(response);
  return true;
}

const seedRequested = server => [...server.requests.keys()].some(path => /\/dist\/dolly(?:\.data|-seed\.mjs)$/.test(path));

await browserTest("image inventory", { image: site ? null : "default", server: { handle }, timeout: 900_000 },
  async ({ browser, server, open }) => {
    for (const image of images) {
      server.requests.clear();
      const page = await browser.newPage();
      page.setDefaultTimeout(0);
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
      await page.evaluate(`(${buildSnapshot})(location.origin + "/", "custom", ${JSON.stringify(recipe)})`);
      assert.equal(await page.evaluate(() => document.documentElement.dataset.dollyStatus), "ready",
        `${image}: ${await page.locator("#bootstrap-log").textContent()}`);
      assert.equal(seedRequested(server), false, `${image}: building on a published image fetched the compiler seed`);
      await page.close();
      const { hostRequirements } = definition;
      if (!hostRequirements.includes("display@0") || hostRequirements.includes("gpu@0")) continue;
      server.requests.clear();
      // The default ENTRY reaches its shell without network requests.
      const route = await open({ path: `/${image}/`, prompt: image === "default" ? undefined : null });
      assert.equal(seedRequested(server), false, `${image}: prebuilt boot fetched the compiler seed`);
      if (image === "default") assert.equal(await route.page.evaluate(() => __dolly.httpRequestCount), 0);
      await route.page.close();
    }
  });
