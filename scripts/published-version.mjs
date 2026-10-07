#!/usr/bin/env node
// A published version on a site, held to its deployment.sha256:
//   mirror SITE vX.Y.Z ARCHIVE     copy SITE/vX.Y.Z/ into ARCHIVE, checking every file
//   verify SITE DEPLOYMENT vX.Y.Z  after DEPLOYMENT is deployed: every file of that version, and
//                                  every other version's list against the one the site serves
//   boot SITE vX.Y.Z... [chromium|firefox ...]
//                                  in real browsers: SITE/ leads to the newest of the versions, an
//                                  unversioned path is 404, and each version boots default from
//                                  its own files
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { get as getHttp } from "node:http";
import { get as getHttps } from "node:https";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { refuseExisting } from "./export-static.mjs";
import { compareVersions, versionName } from "./release-layout.mjs";
import { safePath } from "./site-release.mjs";
import { sha256 } from "./snapshot-identity.mjs";

// The bytes the site stores at URL. Identity encoding, so a file stored
// compressed arrives as stored; a host's redirects between a page's names
// (X/index.html to X/, X.html to X) are followed on the site only.
async function stored(url, redirects = 2) {
  const response = await new Promise((resolveResponse, reject) => (url.protocol === "http:" ? getHttp : getHttps)(
    url, { headers: { "accept-encoding": "identity" } }, resolveResponse).once("error", reject));
  if (response.statusCode >= 300 && response.statusCode < 400 && redirects) {
    response.resume();
    const target = new URL(response.headers.location, url);
    if (target.origin !== url.origin) throw new Error(`${url} redirects off the site`);
    return stored(target, redirects - 1);
  }
  const chunks = [];
  for await (const chunk of response) chunks.push(chunk);
  if (response.statusCode !== 200) throw new Error(`${url} returned HTTP ${response.statusCode}`);
  return Buffer.concat(chunks);
}

// SITE is where the versions are: an origin, or a project page's address.
const siteRoot = site => new URL(site.endsWith("/") ? site : `${site}/`);
const versionURL = (site, name) => {
  if (!versionName.test(name)) throw new Error(`not a version: ${name}`);
  return new URL(`${name}/`, siteRoot(site));
};

// Fetches every file LIST names below BASE; keep(path, bytes) receives each once it matches.
async function checkFiles(base, list, keep) {
  for (const row of list.trimEnd().split("\n")) {
    const path = safePath(row.slice(66));
    const bytes = await stored(new URL(path.split("/").map(encodeURIComponent).join("/"), base));
    if (sha256(bytes) !== row.slice(0, 64)) throw new Error(`${base}${path} differs from deployment.sha256`);
    await keep?.(path, bytes);
  }
}

export async function mirrorVersion(site, name, archive) {
  const base = versionURL(site, name);
  await refuseExisting(resolve(archive, name));
  const staging = await mkdtemp(resolve(archive, ".mirror-"));
  try {
    const list = await stored(new URL("deployment.sha256", base));
    await checkFiles(base, list.toString(), async (path, bytes) => {
      await mkdir(dirname(resolve(staging, path)), { recursive: true });
      await writeFile(resolve(staging, path), bytes, { flag: "wx" });
    });
    await writeFile(resolve(staging, "deployment.sha256"), list, { flag: "wx" });
    await rename(staging, resolve(archive, name));
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

export async function verifyDeployment(site, deployment, name) {
  const names = (await readdir(deployment)).filter(entry => versionName.test(entry)).sort(compareVersions);
  if (!names.includes(name)) throw new Error(`${deployment} holds no ${name}`);
  for (const version of names) {
    const base = versionURL(site, version), list = await readFile(resolve(deployment, version, "deployment.sha256"));
    if (!list.equals(await stored(new URL("deployment.sha256", base)))) throw new Error(`${base} serves another deployment.sha256`);
    if (version === name) await checkFiles(base, list.toString());
  }
  return names;
}

export async function bootVersions(site, names, browsers) {
  const { chromium, firefox } = await import("playwright-core");
  const root = siteRoot(site), newest = [...names].sort(compareVersions).at(-1);
  for (const browserName of browsers) {
    const browser = await (browserName === "chromium"
      ? chromium.launch({ channel: "chrome", headless: true, args: ["--no-sandbox", "--disable-gpu"] })
      : firefox.launch({ headless: true }));
    try {
      const page = await browser.newPage(), requested = [];
      page.setDefaultTimeout(120_000);
      page.on("request", request => {
        // What the page asks the site for: not its own blob: Workers.
        const { protocol, host, pathname } = new URL(request.url());
        if (protocol === root.protocol && host === root.host && pathname !== "/favicon.ico") requested.push(pathname);
      });
      await page.goto(root.href);
      await page.waitForURL(url => url.pathname === `${root.pathname}${newest}/`);
      assert.equal((await page.request.get(new URL("default/", root).href)).status(), 404, "an unversioned path is served");
      for (const name of names) {
        const version = versionURL(site, name);
        requested.length = 0;
        await page.goto(new URL("default/", version).href);
        await page.waitForFunction(() => ["ready", "failed"].includes(document.documentElement.dataset.dollyStatus));
        assert.equal(await page.evaluate(() => document.documentElement.dataset.dollyStatus), "ready",
          `${name}: ${await page.locator("#bootstrap-log").textContent()}`);
        await page.evaluate(() => __dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "shell"));
        assert.equal(await page.evaluate(() => __dolly.submit("amy list | grep -q '^curl  *installed '")), 0, `${name}: amy list failed`);
        assert.ok(requested.includes(`${version.pathname}amy-index.txt`), `${name}: amy did not read its own index`);
        assert.deepEqual(requested.filter(path => !path.startsWith(version.pathname)), [], `${name} requested paths outside itself`);
        // A missing asset is an error, never a page served as the asset.
        assert.equal(await page.evaluate(async () => (await fetch(new URL("missing.mjs", document.baseURI))).status), 404);
        console.log(`dolly: ${version} boots default in ${browserName}`);
      }
    } finally {
      await browser.close();
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, site, ...rest] = process.argv.slice(2);
  if (command === "mirror" && rest.length === 2) {
    const [name, archive] = rest;
    await mirrorVersion(site, name, archive);
    console.log(`dolly: mirrored ${name} into ${resolve(archive)}; every file matches its deployment.sha256`);
  } else if (command === "verify" && rest.length === 2) {
    const [deployment, name] = rest;
    console.log(`dolly: ${site} serves every file of ${name} and the lists of ${(await verifyDeployment(site, deployment, name)).join(", ")}`);
  } else if (command === "boot" && rest.some(name => versionName.test(name)) &&
      rest.every(name => versionName.test(name) || ["chromium", "firefox"].includes(name))) {
    const browsers = rest.filter(name => !versionName.test(name));
    await bootVersions(site, rest.filter(name => versionName.test(name)), browsers.length ? browsers : ["chromium", "firefox"]);
  } else {
    throw new Error("usage: published-version.mjs mirror SITE VERSION ARCHIVE | verify SITE DEPLOYMENT VERSION | boot SITE VERSION... [chromium|firefox ...]");
  }
}
