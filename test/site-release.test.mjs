import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readlink, rename, rm, symlink, writeFile } from "node:fs/promises";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { fileManifest, publishRelease, siteManifest, sourceManifest, verifyRelease } from "../scripts/site-release.mjs";
import { createReleaseServer } from "../scripts/serve.mjs";
import { sha256 } from "../scripts/sha256.mjs";
import { packageDomain } from "../scripts/package-domain.mjs";
import { DOLLY_VERSION } from "../page/version.mjs";

test("domain packaging adds the showcase, with public navigation and pinned media", async t => {
  const root = await mkdtemp(resolve(tmpdir(), "dolly-domain-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(resolve(root, "domain"));
  await writeFile(resolve(root, "domain/index.html"), await readFile(new URL("../menu.html", import.meta.url), "utf8"));
  await packageDomain(resolve(root, "domain"));
  assert.match(await readFile(resolve(root, "domain/index.html"), "utf8"), /href="\.\/agents\/"/);
  const page = await readFile(resolve(root, "domain/agents/index.html"), "utf8");
  // Its links are relative, so they lead to this site's pages wherever it is mounted.
  const links = [...page.matchAll(/<a href="([^"]+)"/g)].map(([, link]) => new URL(link, "https://site.example/v0.1.0/agents/").pathname);
  for (const path of ["/v0.1.0/", "/v0.1.0/rts-arena/"]) assert.ok(links.includes(path), path);
  for (const [, path] of page.matchAll(/(?:src|poster)="([^"]+)"/g)) {
    const bytes = await readFile(resolve(root, "domain/agents", path));
    assert.ok(bytes.length > 0 && bytes.length <= 25 * 1024 * 1024, `${path} must fit a Pages asset`);
  }
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

test("the release server serves the current release as deployed: its files under its version, each kept only as its digest", async t => {
  const releases = await mkdtemp(resolve(tmpdir(), "dolly-release-server-"));
  t.after(() => rm(releases, { recursive: true, force: true }));
  async function publish(version, text) {
    const stage = resolve(releases, "candidate");
    for (const path of ["release", "page", "docs", "default", "dist/packs"]) await mkdir(resolve(stage, path), { recursive: true });
    for (const [path, contents] of Object.entries({
      "page/version.mjs": `// The version.\nexport const DOLLY_VERSION = "${version}";\n`,
      "page/browser.mjs": text, "docs/browser-boundary.md": "boundary", "Dollyfile-system": "DOLLY 6\n",
      "llms.txt": "# Dolly\n\n- [default](default/): a shell\n",
      [`dist/packs/${"a".repeat(64)}.snapshot.gz`]: "compressed bytes", "index.html": "<html>menu</html>",
      "default/index.html": '<html><script src="../page/browser.mjs"></script><a href="../">menu</a></html>',
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
  assert.match(await (await get("/v1.2.3/default/")).text(), /script src="\.\.\/page\/browser.mjs"/);
  assert.equal(await (await get("/v1.2.3/page/browser.mjs")).text(), "old candidate");
  assert.match((await get("/v1.2.3/Dollyfile-system")).headers.get("content-type"), /^text\/plain/);
  // The root speaks for the release's version, as a deployment's root does for its newest.
  assert.equal(await (await get("/robots.txt")).text(), "# Dolly\n#\n# - default /v1.2.3/default/: a shell\n\nUser-agent: *\nDisallow: /v1.2.3/dist/\n");
  assert.deepEqual(await answer("/llms.txt"), [302, "/v1.2.3/llms.txt"]);
  // Nothing is served outside the version or the release.
  for (const path of ["/default/", "/page/browser.mjs", "/Dollyfile-system", "/v1.2.4/default/", "/v1.2.3/AGENTS.md", "/v1.2.3/programs/compiler.cpp",
    "/v1.2.3/docs/..%2fAGENTS.md", "/v1.2.3/docs/..%2fprograms%2fcompiler.cpp", "/v1.2.3/dist/..%2fAGENTS.md", "/v1.2.3/..%2f..%2fAGENTS.md"]) {
    assert.equal((await get(path)).status, 404, path);
  }
  // A candidate keeps its version while it changes: a file is asked for again
  // each time and kept while its digest is the same; nothing else is kept.
  for (const path of ["/v1.2.3/default/", "/v1.2.3/page/browser.mjs", `/v1.2.3/dist/packs/${"a".repeat(64)}.snapshot.gz`]) {
    const { headers } = await get(path), etag = headers.get("etag");
    assert.equal(headers.get("cache-control"), "no-cache", path);
    assert.match(etag, /^"[0-9a-f]{64}"$/, path);
    assert.equal((await fetch(origin + path, { headers: { "if-none-match": etag }, signal: AbortSignal.timeout(5000) })).status, 304, path);
  }
  assert.equal((await get("/nowhere")).headers.get("cache-control"), "no-store");
  // Ranges, which a video plays from.
  const part = await fetch(`${origin}/v1.2.3/page/browser.mjs`, { headers: { range: "bytes=4-7" }, signal: AbortSignal.timeout(5000) });
  assert.deepEqual([part.status, part.headers.get("content-range"), part.headers.get("content-length"), await part.text()],
    [206, "bytes 4-7/13", "4", "cand"]);
  const past = await fetch(`${origin}/v1.2.3/page/browser.mjs`, { headers: { range: "bytes=20-" }, signal: AbortSignal.timeout(5000) });
  assert.equal(past.status, 416);
  const current = await publish("1.2.3", "new candidate");
  assert.equal(await (await get("/v1.2.3/page/browser.mjs")).text(), "new candidate");
  await publish("1.3.0", "next version");
  assert.deepEqual(await answer("/"), [302, "/v1.3.0/"]);
  assert.equal((await get("/v1.2.3/default/")).status, 404);
  const next = await readlink(resolve(releases, "current"));
  await writeFile(resolve(releases, next, "page/browser.mjs"), "tampered");
  assert.equal((await get("/v1.3.0/page/browser.mjs")).status, 404);
  // Publishing takes the seal of an accepted release: this one was never accepted.
  await assert.rejects(publishRelease(resolve(releases, next), releases), /acceptance is missing/);
  assert.equal(await readlink(resolve(releases, "current")), next);
  assert.notEqual(current, next);
});
