import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { DOLLY_IMAGES } from "../dist/dolly-images.mjs";
import { discoverImageDefinitions } from "../scripts/image-definitions.mjs";
import { DOLLY_VERSION } from "../src/version.mjs";
import { browserTest } from "./browser.mjs";
import { alphabetical } from "../src/alphabetical.mjs";
import { siteReference } from "../src/static-asset.mjs";

const root = new URL("..", import.meta.url).pathname;
// Two versions on one origin, as a deployment carries them: each under its own
// path and, as on a project page, without COOP/COEP headers, so only
// coi-serviceworker.js can isolate the page. The other version is this
// checkout with another version constant.
const prefix = `/v${DOLLY_VERSION}`, other = "/v0.0.0";
let origin;
const prefixed = [], unprefixed = [];
// Every list a visitor reads is in one order: by name, ignoring case.
const inOrder = (names, list) => assert.deepEqual(names, [...names].sort(alphabetical), `${list} is not in alphabetical order`);
async function handle(request, response, path, headers) {
  if (request.headers["x-dolly-proxy"]) return false;
  const version = [prefix, other].find(version => path === version || path.startsWith(`${version}/`));
  if (!version) {
    if (path === "/favicon.ico") return false;
    unprefixed.push(path);
    response.writeHead(404, headers).end();
    return true;
  }
  prefixed.push(path);
  if (path === `${other}/src/version.mjs`) {
    response.writeHead(200, { "cache-control": "no-store", "content-type": "text/javascript" }).end('export const DOLLY_VERSION = "0.0.0";\n');
    return true;
  }
  const upstream = await fetch(origin + request.url.slice(version.length), { headers: { "x-dolly-proxy": "1" } });
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
  const images = await page.$$eval("tr.image", rows => rows.map(row => ({ image: row.dataset.image, cells: row.cells.length,
    links: [...row.querySelectorAll(".image-links a")].map(link => new URL(link.href).pathname) })));
  assert.deepEqual(images.map(row => row.image).sort(), DOLLY_IMAGES.map(definition => definition.image).sort());
  for (const { image, links, cells } of images) {
    const definition = DOLLY_IMAGES.find(definition => definition.image === image);
    const displayed = definition.entry !== null && definition.hostRequirements.includes("display@0");
    assert.deepEqual(links.sort(), [...displayed ? [`${prefix}/${image}/`] : [], `${prefix}/${image}/rebuild/`,
      `${prefix}/view/${image}/`].sort(), image);
    for (const link of links) assert.ok(existsSync(`${root}${link.slice(prefix.length + 1)}index.html`), link);
    // A row is the image's name, its description and its links.
    assert.equal(cells, 3, image);
  }
  const menu = await page.evaluate(() => {
    const groups = [];
    for (const row of document.querySelectorAll("tbody tr")) {
      if (row.classList.contains("group")) groups.push({ heading: row.textContent.trim(), images: [] });
      else groups.at(-1).images.push(row.dataset.image);
    }
    const texts = selector => [...document.querySelectorAll(selector)].map(element => element.textContent);
    return { groups, pages: texts("#pages a"), shortcuts: texts("#shortcuts dt") };
  });
  inOrder(menu.groups.map(group => group.heading), "the menu's groups");
  for (const { heading, images } of menu.groups) inOrder(images, heading);
  inOrder(menu.pages, "the menu's pages");
  inOrder(menu.shortcuts, "the shortcuts");
  // The lead's link opens the image a newcomer starts with.
  assert.equal(new URL(await page.locator(".lead a").getAttribute("href"), page.url()).pathname, `${prefix}/default/`);
  // The menu links the package index, a plain file with a row per package.
  const index = await fetch(await page.locator('a[href="./amy-index.txt"]').evaluate(link => link.href));
  assert.match(index.headers.get("content-type"), /^text\/plain/);
  const packages = (await index.text()).trimEnd().split("\n").map(row => row.split(" ")[0]);
  assert.deepEqual([...packages].sort(), DOLLY_IMAGES.filter(definition => definition.role === "package").map(definition => definition.image).sort());
  inOrder(packages, "the package index");
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
  const inventory = await page.$$eval(".inventory tbody tr", rows => rows.map(row => ({ project: row.querySelector("th").textContent,
    images: [...row.querySelectorAll("td:last-child a")].map(link => link.textContent) })));
  inOrder(inventory.map(row => row.project), "the licences page");
  for (const { project, images } of inventory) inOrder(images, `what builds ${project}`);

  // llms.txt says how the site is used, in links relative to itself: each
  // names a page or a file this site serves.
  const about = await fetch(`${origin}${prefix}/llms.txt`);
  assert.match(about.headers.get("content-type"), /^text\/plain/);
  const sections = (await about.text()).split(/^## /m);
  const named = sections.flatMap(section => [...section.matchAll(/\]\((\S+)\)/g)]).map(([, target]) => new URL(target, about.url));
  for (const section of sections) inOrder([...section.matchAll(/^- \[([^\]]+)\]/gm)].map(([, label]) => label), section.split("\n")[0]);
  assert.ok(named.filter(url => url.origin === origin).length > 10);
  for (const url of named) if (url.origin === origin) assert.equal((await fetch(url)).status, 200, url.pathname);

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
  // As llms.txt tells an agent: on a ready page typed keys reach the shell,
  // also when no element of the page holds the focus.
  const typed = async line => {
    const sequence = await page.evaluate(() => __dolly.terminal.currentResultSequence());
    await page.keyboard.type(`${line}\n`);
    return page.evaluate(sequence => __dolly.terminal.waitForResult(sequence), sequence);
  };
  assert.equal(await typed("test -f /etc/dolly/Dollyfile"), 0);
  await page.evaluate(() => document.activeElement.blur());
  assert.equal(await typed("test -d /workspace"), 0);
  // amy's index and a recipe are site paths, so they are read under the prefix.
  assert.equal(await page.evaluate(() => __dolly.submit("amy list | grep -q '^curl  *installed '")), 0);
  assert.ok(prefixed.includes(`${prefix}/amy-index.txt`), "amy did not read the site's index");
  assert.equal(await page.evaluate(recipe => __dolly.submit(`curl -fsS ${recipe} -o /tmp/recipe && cmp /tmp/recipe /etc/dolly/Dollyfile`),
    siteReference("Dollyfile")), 0);
  assert.ok(prefixed.includes(`${prefix}/Dollyfile`), "the image's recipe was not read from the site");
  assert.ok(prefixed.some(path => path.startsWith(`${prefix}/dist/packs/`)), "image did not load snapshot packs");
  assert.deepEqual(prefixed.filter(path => path.includes("/static/")), [], "prebuilt route fetched rebuild-only sources");
  assert.deepEqual(prefixed.filter(path => !path.startsWith(`${prefix}/`)), [], "a version requested another version's paths");
  assert.deepEqual(unprefixed, [], "prefixed deployment requested unprefixed paths");

  // A save belongs to its version: the other version neither lists it nor
  // takes its exported file, and its own version restores it.
  assert.equal(await page.evaluate(() => __dolly.submit("echo kept > $HOME/kept")), 0);
  await page.evaluate(() => __dolly.saveSession("versioned"));
  await page.evaluate(() => __dolly.saveSession("Zeta"));
  const sessions = async version => {
    await page.goto(`${origin}${version}/sessions/`);
    await page.waitForFunction(() => document.documentElement.dataset.sessionsStatus === "ready");
    return page.locator("#sessions li").filter({ hasText: "versioned" });
  };
  const exported = page.waitForEvent("download");
  const kept = await sessions(prefix);
  // By name: the later save and the capital letter both come second.
  assert.deepEqual(await page.locator("#sessions li > :first-child").allTextContents(), ["versioned", "Zeta"]);
  await kept.getByRole("button", { name: "Export", exact: true }).click();
  const file = await (await exported).path();
  assert.equal(await (await sessions(other)).count(), 0, "another version lists the save");
  await page.locator("#import-session").setInputFiles(file);
  await page.waitForFunction(version => document.querySelector("#status").textContent.includes(version), DOLLY_VERSION);
  assert.equal(await page.locator("#sessions li").count(), 0, "another version imported the save");
  await page.goto(`${origin}${prefix}/session/?name=versioned`);
  await page.waitForFunction(() => ["ready", "failed"].includes(document.documentElement.dataset.dollyStatus), null, { timeout: 60000 });
  assert.equal(await page.evaluate(() => document.documentElement.dataset.dollyStatus), "ready",
    await page.locator("#bootstrap-log").textContent());
  await page.evaluate(() => __dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "session shell"));
  assert.equal(await page.evaluate(() => __dolly.submit('test "$(cat $HOME/kept)" = kept')), 0);
  await page.context().close();
});
