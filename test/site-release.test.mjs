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
import { exportVersionedSite } from "../scripts/export-static.mjs";
import { packageDomain } from "../scripts/package-domain.mjs";
import { packageGithubPages } from "../scripts/package-github-pages.mjs";
import { DOLLY_VERSION } from "../src/version.mjs";

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
  // Its links are relative, so they lead to this site's pages wherever it is mounted.
  const links = [...page.matchAll(/<a href="([^"]+)"/g)].map(([, link]) => new URL(link, "https://site.example/v0.1.0/agents/").pathname);
  for (const path of ["/v0.1.0/", "/v0.1.0/rts-arena/"]) assert.ok(links.includes(path), path);
  assert.equal((page.match(/<video /g) ?? []).length, 2);
  for (const [, path] of page.matchAll(/(?:src|poster)="([^"]+)"/g)) {
    const bytes = await readFile(resolve(root, "domain/agents", path));
    assert.ok(bytes.length > 0 && bytes.length <= 25 * 1024 * 1024, `${path} must fit a Pages asset`);
  }
});

test("GitHub Pages leads to the domain's applications under the version released with it", async t => {
  const site = await mkdtemp(resolve(tmpdir(), "dolly-github-test-"));
  t.after(() => rm(site, { recursive: true, force: true }));
  await writeFile(resolve(site, "index.html"), "<table><tbody>\n</tbody></table>");
  await packageGithubPages(site);
  const domain = `https://daugasauron.com/v${DOLLY_VERSION}/`;
  const links = [...(await readFile(resolve(site, "index.html"), "utf8")).matchAll(/href="([^"]+)"/g)].map(([, link]) => link);
  assert.ok(links.length > 0);
  for (const link of links) {
    assert.ok(link.startsWith(domain), link);
    // The path the menu links exists here too, and sends its visitor on.
    assert.ok((await readFile(resolve(site, link.slice(domain.length), "index.html"), "utf8")).includes(JSON.stringify(link)), link);
  }
});

test("static export refuses existing destinations and unverified releases", async t => {
  const root = await mkdtemp(resolve(tmpdir(), "dolly-static-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(resolve(root, "keep"), "owned data");
  await assert.rejects(exportVersionedSite(root, root), /destination already exists/);
  assert.equal(await readFile(resolve(root, "keep"), "utf8"), "owned data");
  await assert.rejects(exportVersionedSite(root, resolve(root, "output")), /cannot modify its source/);
  await mkdir(resolve(root, "unverified/src"), { recursive: true });
  await assert.rejects(exportVersionedSite(resolve(root, "unverified"), resolve(root, "output")), /ENOENT/);
  await writeFile(resolve(root, "unverified/src/version.mjs"), 'export const DOLLY_VERSION = "0.1.0";\n');
  await assert.rejects(exportVersionedSite(resolve(root, "unverified"), resolve(root, "output")), /ENOENT/);
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

test("the release server serves the current release as deployed: its files under its version, nothing cached", async t => {
  const releases = await mkdtemp(resolve(tmpdir(), "dolly-release-server-"));
  t.after(() => rm(releases, { recursive: true, force: true }));
  async function publish(version, text) {
    const stage = resolve(releases, "candidate");
    for (const path of ["release", "src", "docs", "default", "dist/packs"]) await mkdir(resolve(stage, path), { recursive: true });
    for (const [path, contents] of Object.entries({
      "src/version.mjs": `// The version.\nexport const DOLLY_VERSION = "${version}";\n`,
      "src/browser.mjs": text, "docs/browser-boundary.md": "boundary", "Dollyfile-system": "DOLLY 6\n",
      [`dist/packs/${"a".repeat(64)}.snapshot.gz`]: "compressed bytes", "index.html": "<html>menu</html>",
      "default/index.html": '<html><script src="../src/browser.mjs"></script><a href="../">menu</a></html>',
    })) await writeFile(resolve(stage, path), contents);
    const manifest = await siteManifest(stage);
    const digest = sha256(manifest);
    await writeFile(resolve(stage, "release/files.sha256"), manifest);
    await rename(stage, resolve(releases, digest));
    await symlink(digest, resolve(releases, "next"));
    await rename(resolve(releases, "next"), resolve(releases, "current"));
    return digest;
  }
  await publish("1.2.3", "old candidate");
  const server = createReleaseServer(releases);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise(resolveClose => { server.closeAllConnections(); server.close(resolveClose); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const get = path => fetch(origin + path, { redirect: "manual", signal: AbortSignal.timeout(5000) });
  const answer = async path => { const response = await get(path); return [response.status, response.headers.get("location")]; };
  assert.deepEqual(await answer("/"), [302, "/v1.2.3/"]);
  assert.deepEqual(await answer("/v1.2.3/default"), [308, "/v1.2.3/default/"]);
  // The pages are the release's own: relative links, no rewriting.
  assert.equal(await (await get("/v1.2.3/")).text(), "<html>menu</html>");
  assert.match(await (await get("/v1.2.3/default/")).text(), /script src="\.\.\/src\/browser.mjs"/);
  assert.equal(await (await get("/v1.2.3/src/browser.mjs")).text(), "old candidate");
  assert.match((await get("/v1.2.3/Dollyfile-system")).headers.get("content-type"), /^text\/plain/);
  assert.equal(sessionLoadUrl("work.1", `${origin}/v1.2.3/`).href, `${origin}/v1.2.3/session/?name=work.1`);
  // Nothing is served outside the version or the release.
  for (const path of ["/default/", "/src/browser.mjs", "/Dollyfile-system", "/v1.2.4/default/", "/v1.2.3/AGENTS.md", "/v1.2.3/src/compiler.cpp",
    "/v1.2.3/docs/..%2fAGENTS.md", "/v1.2.3/docs/..%2fsrc%2fcompiler.cpp", "/v1.2.3/dist/..%2fAGENTS.md", "/v1.2.3/..%2f..%2fAGENTS.md"]) {
    assert.equal((await get(path)).status, 404, path);
  }
  // A candidate keeps its version while it changes, so no response may be kept.
  for (const path of ["/v1.2.3/default/", "/v1.2.3/src/browser.mjs", `/v1.2.3/dist/packs/${"a".repeat(64)}.snapshot.gz`, "/nowhere"]) {
    assert.equal((await get(path)).headers.get("cache-control"), "no-store", path);
  }
  const current = await publish("1.2.3", "new candidate");
  assert.equal(await (await get("/v1.2.3/src/browser.mjs")).text(), "new candidate");
  await publish("1.3.0", "next version");
  assert.deepEqual(await answer("/"), [302, "/v1.3.0/"]);
  assert.equal((await get("/v1.2.3/default/")).status, 404);
  const next = await readlink(resolve(releases, "current"));
  await writeFile(resolve(releases, next, "src/browser.mjs"), "tampered");
  assert.equal((await get("/v1.3.0/src/browser.mjs")).status, 404);
  await assert.rejects(publishRelease(resolve(releases, next), releases), /file manifest mismatch/);
  assert.equal(await readlink(resolve(releases, "current")), next);
  assert.notEqual(current, next);
});
