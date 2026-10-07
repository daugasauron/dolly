import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, readlink, rename, rm, symlink, writeFile } from "node:fs/promises";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { fileManifest, parseGeneratedConstant, publishRelease, siteManifest, sourceManifest, verifyRelease } from "../scripts/site-release.mjs";
import { createReleaseServer } from "../scripts/serve.mjs";
import { sha256 } from "../scripts/snapshot-identity.mjs";
import { sessionLoadUrl } from "../src/session-store.mjs";
import { deploymentBase, renderReleasePage } from "../scripts/release-layout.mjs";
import { exportStaticSite, exportVersionedSite } from "../scripts/export-static.mjs";
import { packageDomain } from "../scripts/package-domain.mjs";

test("domain packaging adds the showcase only to its selected site, with public navigation and pinned media", async t => {
  const root = await mkdtemp(resolve(tmpdir(), "dolly-domain-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = await readFile(new URL("../menu.html", import.meta.url), "utf8");
  for (const name of ["domain", "github"]) {
    await mkdir(resolve(root, name));
    await writeFile(resolve(root, name, "index.html"), source);
  }
  await packageDomain(resolve(root, "domain"));
  assert.match(await readFile(resolve(root, "domain/index.html"), "utf8"), /href="\.\/agents\/"/);
  assert.equal(await readFile(resolve(root, "github/index.html"), "utf8"), source);
  await assert.rejects(readFile(resolve(root, "github/agents/index.html")), { code: "ENOENT" });
  const page = await readFile(resolve(root, "domain/agents/index.html"), "utf8");
  const files = new Set(["index.html", "agents/index.html", ...["rts-arena", "dollyfile-studio"].map(name => `${name}/index.html`)]);
  const rendered = renderReleasePage(page, "agents/index.html", "a".repeat(64), files);
  assert.match(rendered, /<a href="\/">← Dolly/);
  assert.match(rendered, /<a href="\/rts-arena\/">/);
  assert.match(rendered, /<base href="\/_dolly\/a{64}\/agents\/">/);
  assert.equal((page.match(/<video /g) ?? []).length, 2);
  for (const [, path] of page.matchAll(/(?:src|poster)="([^"]+)"/g)) {
    const bytes = await readFile(resolve(root, "domain/agents", path));
    assert.ok(bytes.length > 0 && bytes.length <= 25 * 1024 * 1024, `${path} must fit a Pages asset`);
  }
});

test("static pages pin assets below the deployment prefix but keep navigation public", () => {
  const digest = "a".repeat(64);
  const files = new Set(["index.html", "default/index.html", "session/index.html", "src/browser.mjs", "Dollyfile"]);
  const source = '<html><head></head><script src="../src/browser.mjs"></script>' +
    '<a href="../session/">sessions</a><a href="#help">help</a>' +
    '<a href="../Dollyfile">source</a><a href="https://example.com/">external</a></html>';
  for (const base of ["/", "/dolly/", "/v0.1.0/", "/dolly/v10.2.33/"]) {
    const page = renderReleasePage(source, "default/index.html", digest, files, base);
    assert.ok(page.includes(`<base href="${base}_dolly/${digest}/default/">`));
    assert.ok(page.includes(`<a href="${base}session/">`));
    assert.ok(page.includes(`<a href="${base}default/#help">`));
    assert.ok(page.includes('<script src="../src/browser.mjs">'));
    assert.ok(page.includes('<a href="../Dollyfile">'));
    assert.ok(page.includes('<a href="https://example.com/">'));
    assert.ok(renderReleasePage('<head></head>', "404.html", digest, files, base)
      .includes(`<base href="${base}_dolly/${digest}/">`));
  }
  for (const base of ["dolly/", "//example.com/", "/../", "/a/../b/", "/a/./b/", "/.a/", "/a//b/", "/a?b/", '/a"b/']) {
    assert.throws(() => deploymentBase(base), /deployment base/);
  }
  assert.throws(() => renderReleasePage(source, "index.html", "../bad", files), /invalid release ID/);
});

test("static export refuses existing destinations and unverified releases", async t => {
  const root = await mkdtemp(resolve(tmpdir(), "dolly-static-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(resolve(root, "keep"), "owned data");
  await assert.rejects(exportStaticSite(root, root), /destination already exists/);
  assert.equal(await readFile(resolve(root, "keep"), "utf8"), "owned data");
  await assert.rejects(exportStaticSite(root, resolve(root, "output")), /cannot modify its source/);
  await mkdir(resolve(root, "unverified"));
  await assert.rejects(exportStaticSite(resolve(root, "unverified"), resolve(root, "output")), /ENOENT/);
  await assert.rejects(exportVersionedSite(root, root), /destination already exists/);
  await mkdir(resolve(root, "unverified/src"));
  await writeFile(resolve(root, "unverified/src/version.mjs"), 'export const DOLLY_VERSION = "0.1.0";\n');
  await assert.rejects(exportVersionedSite(resolve(root, "unverified"), resolve(root, "output")), /ENOENT/);
  await assert.rejects(readFile(resolve(root, "output")), /ENOENT/);
  assert.deepEqual((await readdir(root)).sort(), ["keep", "unverified"]);
});

test("release metadata accepts generated JSON constants, never JavaScript", () => {
  assert.deepEqual(parseGeneratedConstant('// Generated.\nexport const TEST = Object.freeze({"value":1});\n', "TEST"), { value: 1 });
  assert.equal(parseGeneratedConstant('export const TEST = "digest";\n', "TEST"), "digest");
  for (const source of [
    'export const TEST = (globalThis.releaseCodeRan = true);',
    'export const TEST = {}; globalThis.releaseCodeRan = true;',
    'globalThis.releaseCodeRan = true; export const TEST = {};',
    'export const TEST = Object.freeze({get value() {return 1}});',
    'export const TEST = Object.freeze({"value": Infinity});',
    'export const WRONG = {};',
  ]) assert.throws(() => parseGeneratedConstant(source, "TEST"));
  assert.equal(globalThis.releaseCodeRan, undefined);
});

test("release seal covers complete file contents, rejects changes and symlinks", async t => {
  const site = await mkdtemp(resolve(tmpdir(), "dolly-release-test-"));
  t.after(() => rm(site, { recursive: true, force: true }));
  await mkdir(resolve(site, "release"));
  await writeFile(resolve(site, "index.html"), "old app");
  await writeFile(resolve(site, ".nojekyll"), "");
  const manifest = await siteManifest(site);
  assert.match(manifest, /  \.nojekyll\n/);
  await writeFile(resolve(site, "release/files.sha256"), manifest);
  await writeFile(resolve(site, "release/acceptance.txt"), "not an acceptance proof");
  assert.equal(await siteManifest(site), manifest);
  await writeFile(resolve(site, "index.html"), "new app");
  await assert.rejects(verifyRelease(site), /file manifest mismatch/);
  await writeFile(resolve(site, "index.html"), "old app");
  await writeFile(resolve(site, "extra.js"), "unlisted code");
  await assert.rejects(verifyRelease(site), /file manifest mismatch/);
  await rm(resolve(site, "extra.js"));
  await rm(resolve(site, "index.html"));
  await assert.rejects(verifyRelease(site), /file manifest mismatch/);
  await symlink(".nojekyll", resolve(site, "index.html"));
  await assert.rejects(siteManifest(site), /not a regular file/);
  for (const path of ["../outside", "/absolute", "a/../b", "a\\b", "a\nb"]) {
    await assert.rejects(fileManifest(site, [path]), /invalid release path/);
  }
});

test("source provenance includes uncommitted inputs but excludes local agent state", async t => {
  const source = await mkdtemp(resolve(tmpdir(), "dolly-release-source-"));
  t.after(() => rm(source, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd: source, stdio: "pipe" });
  git("init", "--quiet");
  await writeFile(resolve(source, "app.c"), "int main(void) {}\n");
  git("add", "app.c");
  await writeFile(resolve(source, "new.c"), "new source\n");
  for (const path of [".pi", ".pi-subagents", "work"]) {
    await mkdir(resolve(source, path));
    await writeFile(resolve(source, path, "private.txt"), "must not enter provenance");
  }
  const manifest = await sourceManifest(source);
  assert.match(manifest, /  app\.c\n/);
  assert.match(manifest, /  new\.c\n/);
  assert.doesNotMatch(manifest, /private/);
  await writeFile(resolve(source, "app.c"), "changed\n");
  assert.notEqual(await sourceManifest(source), manifest);
  await rm(resolve(source, "app.c"));
  assert.doesNotMatch(await sourceManifest(source), /  app\.c\n/);
  assert.equal(await readFile(resolve(source, ".pi/private.txt"), "utf8"), "must not enter provenance");
});

test("the release server serves the current release as deployed: under its version, pinned, and nothing else", async t => {
  const releases = await mkdtemp(resolve(tmpdir(), "dolly-release-server-"));
  t.after(() => rm(releases, { recursive: true, force: true }));
  async function publish(version, text) {
    const stage = resolve(releases, "candidate");
    for (const path of ["release", "src", "docs", "default", "custom", "session", "dist/packs"]) await mkdir(resolve(stage, path), { recursive: true });
    for (const [path, contents] of Object.entries({
      "src/version.mjs": `// The version.\nexport const DOLLY_VERSION = "${version}";\n`,
      "src/browser.mjs": text, "docs/browser-boundary.md": "boundary", "amy-index.txt": "curl\n",
      [`dist/packs/${"a".repeat(64)}.snapshot.gz`]: "compressed bytes",
      "default/index.html": '<html><head></head><script src="../src/browser.mjs"></script><a href="../custom/">custom</a><a href="#help">help</a><a href="https://example.com/">external</a><a href="../src/browser.mjs">source</a></html>',
      "custom/index.html": '<html><head></head></html>',
      "session/index.html": '<html><head></head><script src="../src/browser.mjs"></script></html>',
    })) await writeFile(resolve(stage, path), contents);
    const manifest = await siteManifest(stage);
    const digest = sha256(manifest);
    await writeFile(resolve(stage, "release/files.sha256"), manifest);
    await rename(stage, resolve(releases, digest));
    await symlink(digest, resolve(releases, "next"));
    await rename(resolve(releases, "next"), resolve(releases, "current"));
    return digest;
  }
  const old = await publish("1.2.3", "old version");
  const server = createReleaseServer(releases);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise(resolveClose => { server.closeAllConnections(); server.close(resolveClose); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const get = path => fetch(origin + path, { redirect: "manual", signal: AbortSignal.timeout(5000) });
  const root = await get("/");
  assert.deepEqual([root.status, root.headers.get("location")], [302, "/v1.2.3/"]);
  assert.match(await (await get("/v1.2.3/default")).text(), new RegExp(`<base href="/v1.2.3/_dolly/${old}/default/">`));
  const page = await (await get("/v1.2.3/default/")).text();
  assert.match(page, /href="\/v1\.2\.3\/custom\/"/);
  assert.match(page, /href="\/v1\.2\.3\/default\/#help"/);
  assert.match(page, /href="https:\/\/example.com\/"/);
  assert.match(page, /script src="\.\.\/src\/browser.mjs"/, "scripts still resolve against the pinned base");
  assert.match(page, /a href="\.\.\/src\/browser.mjs"/, "source inspection links keep the same release too");
  const pack = `dist/packs/${"a".repeat(64)}.snapshot.gz`, pinned = `/v1.2.3/_dolly/${old}/`;
  const cached = async path => (await get(path)).headers.get("cache-control");
  assert.equal(await cached(pinned + "src/browser.mjs"), "public, max-age=31536000, immutable");
  assert.equal(await cached(`/v1.2.3/${pack}`), "public, max-age=31536000, immutable");
  assert.equal(await cached("/v1.2.3/default"), "no-store");
  assert.equal(await cached("/v1.2.3/amy-index.txt"), "no-store");
  assert.match(await (await get("/v1.2.3/session/?name=work.1")).text(), new RegExp(`<base href="/v1.2.3/_dolly/${old}/session/">`));
  assert.equal(sessionLoadUrl("work.1", origin + pinned).href, `${origin}/v1.2.3/session/?name=work.1`);
  // Nothing is served outside the version, and below it only what a deployment has there.
  for (const path of ["/default/", "/src/browser.mjs", `/_dolly/${old}/src/browser.mjs`, `/${pack}`, "/v1.2.4/default/",
    "/v1.2.3/src/browser.mjs", "/v1.2.3/docs/browser-boundary.md"]) assert.equal((await get(path)).status, 404, path);
  for (const path of ["AGENTS.md", "src/compiler.cpp", "docs/..%2fAGENTS.md", "docs/..%2fsrc%2fcompiler.cpp", "dist/..%2fAGENTS.md"]) {
    for (const prefix of ["/v1.2.3/", pinned]) assert.equal((await get(prefix + path)).status, 404, path);
  }
  assert.equal((await get(pinned + "docs/browser-boundary.md")).status, 200);
  // A republication replaces what is served: the release decides its version.
  const current = await publish("1.3.0", "new version");
  assert.equal((await get("/")).headers.get("location"), "/v1.3.0/");
  assert.equal(await (await get(`/v1.3.0/_dolly/${current}/src/browser.mjs`)).text(), "new version");
  for (const path of [pinned + "src/browser.mjs", "/v1.2.3/default/", `/v1.3.0/_dolly/${old}/src/browser.mjs`]) {
    assert.equal((await get(path)).status, 404, path);
  }
  await writeFile(resolve(releases, current, "src/browser.mjs"), "tampered");
  assert.equal((await get(`/v1.3.0/_dolly/${current}/src/browser.mjs`)).status, 404);
  await assert.rejects(publishRelease(resolve(releases, current), releases), /file manifest mismatch/);
  assert.equal(await readlink(resolve(releases, "current")), current);
});
