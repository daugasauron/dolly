import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readlink, rename, rm, symlink, writeFile } from "node:fs/promises";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { fileManifest, parseGeneratedConstant, publishRelease, siteManifest, sourceManifest, verifyRelease } from "../scripts/site-release.mjs";
import { createReleaseServer } from "../scripts/serve.mjs";
import { sha256 } from "../scripts/snapshot-identity.mjs";
import { sessionLoadUrl } from "../src/session-store.mjs";

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
  async function version(text) {
    const stage = resolve(releases, "candidate");
    for (const path of ["release", "src", "docs", "default", "session"]) await mkdir(resolve(stage, path), { recursive: true });
    for (const [path, contents] of Object.entries({
      "src/browser.mjs": text, "docs/browser-boundary.md": "boundary",
      "default/index.html": '<html><head></head><script src="../src/browser.mjs"></script></html>',
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
  assert.match(await (await get("session/work.1")).text(), new RegExp(`<base href="/_dolly/${old}/">`));
  assert.equal(sessionLoadUrl("work.1", `${base}/_dolly/${old}/`).href, `${base}/session/work.1`);
  const current = await version("new version");
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
