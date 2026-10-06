import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { DOLLY_IMAGES } from "../dist/dolly-images.mjs";
import { discoverImageDefinitions } from "../scripts/image-definitions.mjs";
import { browserTest } from "./browser.mjs";

const root = new URL("..", import.meta.url).pathname;
// /pages/ stands in for a project-page deployment: a path prefix and no
// COOP/COEP headers, so only coi-serviceworker.js can isolate the page.
const prefix = "/pages";
let origin;
const prefixed = [], unprefixed = [];
async function handle(request, response, path, headers) {
  if (request.headers["x-dolly-proxy"]) return false;
  if (path !== prefix && !path.startsWith(`${prefix}/`)) {
    if (path === "/favicon.ico") return false;
    unprefixed.push(path);
    response.writeHead(404, headers).end();
    return true;
  }
  prefixed.push(path);
  const upstream = await fetch(origin + request.url.slice(prefix.length), { headers: { "x-dolly-proxy": "1" } });
  response.writeHead(upstream.status, { "cache-control": "no-store", "content-type": upstream.headers.get("content-type") ?? "" });
  if (upstream.body) await pipeline(Readable.fromWeb(upstream.body), response).catch(() => {}); else response.end();
  return true;
}

await browserTest("site", { server: { handle } }, async ({ browser, server }) => {
  origin = server.origin;
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  // The static menu links each image's routes, and every linked route exists.
  await page.goto(`${origin}${prefix}/`);
  assert.equal(await page.locator("script").count(), 0);
  const images = await page.$$eval("tr.image", rows => rows.map(row => ({ image: row.dataset.image,
    links: [...row.querySelectorAll(".image-links a")].map(link => new URL(link.href).pathname) })));
  assert.deepEqual(images.map(row => row.image).sort(), DOLLY_IMAGES.map(definition => definition.image).sort());
  for (const { image, links } of images) {
    const definition = DOLLY_IMAGES.find(definition => definition.image === image);
    const displayed = definition.entry !== null && definition.hostRequirements.includes("display@0");
    assert.deepEqual(links.sort(), [...displayed ? [`${prefix}/${image}/`] : [], `${prefix}/${image}/rebuild/`,
      `${prefix}/view/${image}/`].sort(), image);
    for (const link of links) assert.ok(existsSync(`${root}${link.slice(prefix.length + 1)}index.html`), link);
  }
  // The menu links the package index, a plain file with a row per package.
  const index = await fetch(await page.locator('a[href="./amy-index.txt"]').evaluate(link => link.href));
  assert.match(index.headers.get("content-type"), /^text\/plain/);
  assert.deepEqual((await index.text()).trimEnd().split("\n").map(row => row.split(" ")[0]),
    DOLLY_IMAGES.filter(definition => definition.role === "package").map(definition => definition.image));
  await page.click('a[href="#shortcuts"]');
  assert.equal(await page.evaluate(() => location.hash), "#shortcuts");
  await page.locator("#shortcuts").waitFor();

  // The menu links the licences page, which attributes every image that
  // downloads sources and links each attribution to an existing view.
  await page.click('a[href="./licences/"]');
  const attributed = await page.$$eval(".inventory td:last-child a", links => links.map(link => new URL(link.href).pathname));
  const registered = new Set(DOLLY_IMAGES.map(definition => definition.image));
  for (const { image, parsed } of await discoverImageDefinitions(root)) {
    if (registered.has(image) && parsed.sources.length) assert.ok(attributed.includes(`${prefix}/view/${image}/`), image);
  }
  for (const link of attributed) assert.ok(existsSync(`${root}${link.slice(prefix.length + 1)}index.html`), link);

  // robots.txt keeps crawlers off release assets and snapshot packs, not pages.
  const robots = await fetch(`${origin}${prefix}/robots.txt`);
  assert.match(robots.headers.get("content-type"), /^text\/plain/);
  const disallowed = [...(await robots.text()).matchAll(/^Disallow: (\S+)$/gm)].map(([, rule]) => rule);
  const blocked = path => disallowed.some(rule => path.startsWith(rule));
  for (const path of [`/_dolly/${"a".repeat(64)}/dist/static/default/zig.tar`, `/dist/packs/${"b".repeat(64)}.snapshot.gz`,
    "/dist/static/default/zig.tar"]) assert.ok(blocked(path), path);
  for (const path of ["/", "/licences/", "/view/default/", "/default/"]) assert.ok(!blocked(path), path);

  // A large source link is a verified scripted download of the exact bytes.
  await page.goto(`${origin}${prefix}/view/zig-build/`);
  assert.ok(await page.locator("pre .line").count() > 2);
  const link = page.locator('a.source[href$="/dist/static/default/zig.tar"]');
  const saved = page.waitForEvent("download", { timeout: 120000 });
  await link.click();
  const download = await saved;
  assert.equal(download.suggestedFilename(), "zig.tar");
  const expected = await readFile(`${root}dist/static/default/zig.tar`);
  assert.ok(expected.equals(await readFile(await download.path())), "downloaded source differs from the served file");

  // A prefixed deployment without isolation headers boots from packs only.
  prefixed.length = 0;
  await page.goto(`${origin}${prefix}/default/`);
  await page.waitForFunction(() => ["ready", "failed"].includes(document.documentElement.dataset.dollyStatus), null, { timeout: 60000 });
  assert.equal(await page.evaluate(() => document.documentElement.dataset.dollyStatus), "ready",
    await page.locator("#bootstrap-log").textContent());
  assert.deepEqual(await page.evaluate(() => [crossOriginIsolated, !!navigator.serviceWorker.controller]), [true, true]);
  await page.evaluate(() => __dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "shell"));
  assert.equal(await page.evaluate(() => __dolly.submit("test -f /etc/dolly/Dollyfile")), 0);
  // amy's index is a path of the site, so it is read under the prefix.
  assert.equal(await page.evaluate(() => __dolly.submit("amy list | grep -q '^curl  *installed '")), 0);
  assert.ok(prefixed.includes(`${prefix}/amy-index.txt`), "amy did not read the site's index");
  assert.ok(prefixed.some(path => path.startsWith(`${prefix}/dist/packs/`)), "image did not load snapshot packs");
  assert.deepEqual(prefixed.filter(path => path.includes("/static/")), [], "prebuilt route fetched rebuild-only sources");
  assert.deepEqual(unprefixed, [], "prefixed deployment requested unprefixed paths");
  await page.context().close();
});
