import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readlink, rename, rm, symlink, writeFile } from "node:fs/promises";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { fileManifest, parseGeneratedConstant, publishRelease, siteManifest, sourceManifest, verifyRelease, verifyRetainedRelease } from "../scripts/site-release.mjs";
import { createReleaseServer } from "../scripts/serve.mjs";
import { sha256 } from "../scripts/snapshot-identity.mjs";
import { sessionLoadUrl } from "../src/session-store.mjs";
import { deploymentBase, renderReleasePage } from "../scripts/release-layout.mjs";
import { exportStaticSite, exportRetainedStaticAssets } from "../scripts/export-static.mjs";

test("static pages pin assets below the deployment prefix but keep navigation public", () => {
  const digest = "a".repeat(64);
  const files = new Set(["index.html", "default/index.html", "session/index.html", "src/browser.mjs", "Dollyfile"]);
  const source = '<html><head></head><script src="../src/browser.mjs"></script>' +
    '<a href="../session/">sessions</a><a href="#help">help</a>' +
    '<a href="../Dollyfile">source</a><a href="https://example.com/">external</a></html>';
  for (const base of ["/", "/dolly/", "/demo/dolly/"]) {
    const page = renderReleasePage(source, "default/index.html", digest, files, base);
    assert.ok(page.includes(`<base href="${base}_dolly/${digest}/default/">`));
    assert.ok(page.includes(`<a href="${base}session/">`));
    assert.ok(page.includes(`<a href="${base}default/#help">`));
    assert.ok(page.includes('<script src="../src/browser.mjs">'));
    assert.ok(page.includes('<a href="../Dollyfile">'));
    assert.ok(page.includes('<a href="https://example.com/">'));
    for (const path of ["404.html", "session/open.html"]) {
      assert.ok(renderReleasePage('<head></head>', path, digest, files, base)
        .includes(`<base href="${base}_dolly/${digest}/">`));
    }
  }
  for (const base of ["dolly/", "//example.com/", "/../", "/a/../b/", "/a//b/", "/a?b/", '/a"b/']) {
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
  await assert.rejects(readFile(resolve(root, "output")), /ENOENT/);
});

test("retention verifies the original seal without republishing legacy HTML or weakening current acceptance", async t => {
  const root = await mkdtemp(resolve(tmpdir(), "dolly-retained-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const site = resolve(root, "old"), output = resolve(root, "export");
  for (const path of ["dist", "docs", "release"]) await mkdir(resolve(site, path), { recursive: true });
  await writeFile(resolve(site, "index.html"), "old application");
  await writeFile(resolve(site, "docs/architecture.md"), "[Old broken link](security.md)\n");
  await writeFile(resolve(site, "dist/dolly-images.mjs"), 'export const DOLLY_IMAGES = Object.freeze([{"image":"default"}]);\n');
  const manifest = await siteManifest(site), digest = sha256(manifest);
  await writeFile(resolve(site, "release/files.sha256"), manifest);
  const receipt = `DOLLY-ACCEPTANCE 1\nfiles sha256:${digest}\nPASS image-inventory default\n`;
  await writeFile(resolve(site, "release/acceptance.txt"), receipt);
  assert.equal(await verifyRetainedRelease(site), digest);
  await assert.rejects(verifyRelease(site), /security\.md/);
  assert.equal(await exportRetainedStaticAssets(site, output), digest);
  assert.equal(await readFile(resolve(output, `_dolly/${digest}/index.html`), "utf8"), "old application");
  await assert.rejects(readFile(resolve(output, "index.html")), { code: "ENOENT" });
  await writeFile(resolve(site, "release/acceptance.txt"), receipt.replace(digest, "0".repeat(64)));
  await assert.rejects(verifyRetainedRelease(site), /acceptance/);
  await writeFile(resolve(site, "release/acceptance.txt"), receipt);
  await writeFile(resolve(site, "index.html"), "changed application");
  await assert.rejects(verifyRetainedRelease(site), /file manifest mismatch/);
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

test("published server pins complete versions, preserves public session URLs and denies checkout access", async t => {
  const releases = await mkdtemp(resolve(tmpdir(), "dolly-release-server-"));
  t.after(() => rm(releases, { recursive: true, force: true }));
  async function version(text, packName = "a".repeat(64)) {
    const stage = resolve(releases, "candidate");
    for (const path of ["release", "src", "docs", "default", "custom", "session", "dist/packs"]) await mkdir(resolve(stage, path), { recursive: true });
    for (const [path, contents] of Object.entries({
      "src/browser.mjs": text, "docs/browser-boundary.md": "boundary",
      [`dist/packs/${packName}.snapshot.gz`]: "shared compressed bytes",
      "default/index.html": '<html><head></head><script src="../src/browser.mjs"></script><a href="../custom/">custom</a><a href="#help">help</a><a href="https://example.com/">external</a><a href="../src/browser.mjs">source</a></html>',
      "custom/index.html": '<html><head></head></html>',
      "session/open.html": '<html><head></head><script src="src/browser.mjs"></script></html>',
    })) await writeFile(resolve(stage, path), contents);
    const manifest = await siteManifest(stage);
    const digest = sha256(manifest);
    await writeFile(resolve(stage, "release/files.sha256"), manifest);
    await rename(stage, resolve(releases, digest));
    await symlink(digest, resolve(releases, "next"));
    await rename(resolve(releases, "next"), resolve(releases, "current"));
    return digest;
  }
  const old = await version("old version");
  const server = createReleaseServer(releases);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise(resolveClose => { server.closeAllConnections(); server.close(resolveClose); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = path => fetch(base + "/" + path, { signal: AbortSignal.timeout(5000) });
  assert.match(await (await get("default")).text(), new RegExp(`<base href="/_dolly/${old}/default/">`));
  const page = await (await get("default/")).text();
  assert.match(page, /href="\/custom\/"/);
  assert.match(page, /href="\/default\/#help"/);
  assert.match(page, /href="https:\/\/example.com\/"/);
  assert.match(page, /script src="\.\.\/src\/browser.mjs"/, "scripts still resolve against the pinned base");
  assert.match(page, /a href="\.\.\/src\/browser.mjs"/, "source inspection links keep the same release too");
  const pack = `dist/packs/${"a".repeat(64)}.snapshot.gz`;
  assert.equal((await get(`_dolly/${old}/${pack}`)).headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.equal((await get(`_dolly/${old}/src/browser.mjs`)).headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.equal((await get("src/browser.mjs")).headers.get("cache-control"), "no-store");
  assert.equal((await get(pack)).headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.equal((await get("default")).headers.get("cache-control"), "no-store");
  assert.match(await (await get("session/work.1")).text(), new RegExp(`<base href="/_dolly/${old}/">`));
  assert.equal(sessionLoadUrl("work.1", `${base}/_dolly/${old}/`).href, `${base}/session/work.1`);
  const current = await version("new version", "b".repeat(64));
  assert.equal(await (await get(pack)).text(), "shared compressed bytes", "old public packs remain available after publication");
  const loosePack = `dist/packs/${"c".repeat(64)}.snapshot.gz`;
  await writeFile(resolve(releases, current, loosePack), "unlisted blob");
  for (const name of ["candidate", "c".repeat(64)]) {
    await mkdir(resolve(releases, name, "release"), { recursive: true });
    await mkdir(resolve(releases, name, "dist/packs"), { recursive: true });
    await writeFile(resolve(releases, name, loosePack), "unpublished blob");
    await writeFile(resolve(releases, name, "release/files.sha256"), `${sha256("unpublished blob")}  ${loosePack}\n`);
  }
  const coldServer = createReleaseServer(releases);
  coldServer.listen(0, "127.0.0.1");
  await once(coldServer, "listening");
  t.after(() => new Promise(resolveClose => { coldServer.closeAllConnections(); coldServer.close(resolveClose); }));
  const coldGet = path => fetch(`http://127.0.0.1:${coldServer.address().port}/${path}`, { signal: AbortSignal.timeout(5000) });
  assert.equal(await (await coldGet(pack)).text(), "shared compressed bytes", "a restarted server finds packs in verified old manifests");
  assert.equal((await coldGet(loosePack)).status, 404, "loose or unverified candidates cannot provide public packs");
  await writeFile(resolve(releases, old, pack), "tampered pack");
  assert.equal((await coldGet(pack)).status, 404, "cached manifest lookup still verifies each served file");
  assert.equal(await (await get("src/browser.mjs")).text(), "new version");
  assert.equal(await (await get(`_dolly/${old}/src/browser.mjs`)).text(), "old version");
  assert.equal(await (await get(`_dolly/${current}/src/browser.mjs`)).text(), "new version");
  await writeFile(resolve(releases, current, "src/browser.mjs"), "tampered");
  assert.equal((await get(`_dolly/${current}/src/browser.mjs`)).status, 404);
  await assert.rejects(publishRelease(resolve(releases, current), releases), /file manifest mismatch/);
  assert.equal(await readlink(resolve(releases, "current")), current);
  for (const path of ["AGENTS.md", "src/compiler.cpp", "docs/..%2fAGENTS.md", "docs/..%2fsrc%2fcompiler.cpp", "dist/..%2fAGENTS.md"]) {
    for (const prefix of ["", `_dolly/${old}/`]) assert.equal((await get(prefix + path)).status, 404, path);
  }
  assert.equal((await get("docs/browser-boundary.md")).status, 200);
});
