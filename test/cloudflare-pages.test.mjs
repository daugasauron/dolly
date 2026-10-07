import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { brotliCompressSync, brotliDecompressSync } from "node:zlib";
import test from "node:test";
import { exportCloudflarePages, pagesAsset, pagesHeaders, versionHeaders } from "../scripts/export-cloudflare-pages.mjs";
import { mirrorVersion, verifyDeployment } from "../scripts/published-version.mjs";
import { fileManifest } from "../scripts/site-release.mjs";
import { startPagesHost } from "./pages-host.mjs";

test("Pages transport compresses source assets and splits incompressible files without changing decoded bytes", async () => {
  const small = Buffer.from("ordinary asset");
  assert.equal((await pagesAsset(small, "small.wasm")).bytes, small);
  assert.equal((await pagesAsset(small, "pack.snapshot.gz")).compressed, false);
  const large = Buffer.alloc(25 * 1024 * 1024 + 1, 65);
  const encoded = await pagesAsset(large, "_dolly/release/dist/dolly.data");
  assert.equal(encoded.compressed, true);
  assert.ok(encoded.bytes.length < 25 * 1024 * 1024);
  assert.deepEqual(brotliDecompressSync(encoded.bytes), large);
  for (const [bytes, path] of [[large, `dist/packs/${"a".repeat(64)}.snapshot.gz`],
    [randomBytes(large.length), "_dolly/release/dist/static/incompressible.data"],
    [randomBytes(large.length), "_dolly/release/dist/dolly.data"]]) {
    const asset = await pagesAsset(bytes, path);
    assert.equal(asset.compressed, false);
    assert.deepEqual(Buffer.concat(asset.parts), bytes);
    assert.ok(asset.parts.every(part => part.length <= 20 * 1024 * 1024));
    assert.equal(JSON.parse(asset.bytes).byteLength, bytes.length);
  }
  await assert.rejects(pagesAsset(large, "_dolly/release/dist/dolly.wasm"), /new delivery check/);
});

const release = letter => `_dolly/${letter.repeat(64)}/`, pack = `dist/packs/${"c".repeat(64)}.snapshot.gz`;

// A published version as the exporter leaves it: its files, the headers its
// transformed files need, and the list of both.
async function publish(archive, name, files, headers = "") {
  const all = { "404.html": `${name} has no such page`, "robots.txt": "# Dolly\nUser-agent: *\nDisallow: /_dolly/\nDisallow: /dist/\n",
    "deployment.headers": headers, ...files };
  for (const [path, contents] of Object.entries(all)) {
    await mkdir(dirname(resolve(archive, name, path)), { recursive: true });
    await writeFile(resolve(archive, name, path), contents);
  }
  await writeFile(resolve(archive, name, "deployment.sha256"), await fileManifest(resolve(archive, name), Object.keys(all)));
}

test("a version's header rules name only its own compressed and split files", () => {
  const headers = versionHeaders([release("a") + "dist/dolly.data", release("a") + "dist/static/default/zig.wasm"],
    [release("a") + "dist/static/rust/sdk.tar.gz", pack]);
  assert.equal(headers.split("\n\n").length, 4);
  assert.equal(versionHeaders([], []), "");
  assert.throws(() => versionHeaders([], ["https://other.example/file"]), /invalid Pages multipart path/);
  assert.throws(() => versionHeaders([release("a") + "a\n/*"], []), /invalid Pages header path/);
  const version = { name: "v0.1.0", paths: [] };
  for (const forged of ["/*\n  Access-Control-Allow-Origin: any\n", "/:any/file\n  X-Dolly-Parts: 1\n", "/file\n"]) {
    assert.throws(() => pagesHeaders([{ ...version, headers: forged }]), /invalid deployment.headers/);
  }
  assert.throws(() => pagesHeaders([{ name: "v0.1.0", paths: [], headers: versionHeaders(
    Array.from({ length: 96 }, (_, index) => `${release("a")}file-${index}`), []) }]), /100 header rules exceeded: v0\.1\.0 need 101/);
});

test("one deployment serves every published version under its path and nothing else", async t => {
  const root = await mkdtemp(resolve(tmpdir(), "dolly-pages-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const archive = resolve(root, "published"), output = resolve(root, "deployment");
  const page = "<!doctype html><title>Dolly</title>", data = brotliCompressSync(Buffer.from("seed ".repeat(64)));
  // 0.1.0 stores its seed compressed; 0.10.0, the newest, stores it in parts
  // and its source compressed, as 0.1.0 stores the same source.
  await publish(archive, "v0.1.0", { "index.html": page, [release("a") + "Dollyfile"]: "DOLLY 6\n",
    [release("a") + "dist/dolly.data"]: data, [release("a") + "dist/static/default/zig.tar"]: data, [pack]: "{}", [`${pack}.part-0`]: "pack" },
    versionHeaders([release("a") + "dist/dolly.data", release("a") + "dist/static/default/zig.tar"], [pack]));
  await publish(archive, "v0.10.0", { "index.html": page, [release("b") + "Dollyfile"]: "DOLLY 6\n",
    [release("b") + "dist/dolly.data"]: "{}", [release("b") + "dist/dolly.data.part-0"]: "seed",
    [release("b") + "dist/static/default/zig.tar"]: data, [release("b") + "src/browser.mjs"]: "export {};\n" },
    versionHeaders([release("b") + "dist/static/default/zig.tar"], [release("b") + "dist/dolly.data"]));
  await publish(archive, "v0.2.0", { "index.html": page, [release("d") + "dist/dolly.data"]: "small seed" });
  const summary = await exportCloudflarePages(archive, output);
  assert.deepEqual([summary.newest, Object.keys(summary.versions)], ["v0.10.0", ["v0.1.0", "v0.2.0", "v0.10.0"]]);
  assert.equal(summary.files, (await readdir(output, { recursive: true, withFileTypes: true })).filter(entry => entry.isFile()).length);
  assert.deepEqual((await readdir(output)).sort(), ["404.html", "_headers", "_redirects", "robots.txt", "v0.1.0", "v0.10.0", "v0.2.0"]);

  const host = await startPagesHost(output);
  t.after(() => host.close());
  const get = path => fetch(host.origin + path, { redirect: "manual", headers: { "accept-encoding": "identity" } });
  const root302 = await get("/");
  assert.deepEqual([root302.status, root302.headers.get("location")], [302, "/v0.10.0/"]);
  for (const path of ["/index.html", "/default/", `/${release("a")}Dollyfile`, "/deployment.sha256", "/_headers", "/dist/packs/"]) {
    assert.equal((await get(path)).status, 404, path);
  }
  assert.equal(await (await get("/nowhere/")).text(), "v0.10.0 has no such page");
  const missing = await get(`/v0.1.0/${release("a")}src/missing.mjs`);
  assert.deepEqual([missing.status, await missing.text()], [404, "v0.1.0 has no such page"]);
  const robots = await (await get("/robots.txt")).text();
  for (const rule of ["/v0.1.0/_dolly/", "/v0.2.0/dist/", "/v0.10.0/_dolly/"]) assert.ok(robots.includes(`Disallow: ${rule}\n`), rule);
  assert.doesNotMatch(robots, /^Disallow: \/(_dolly|dist)\//m);

  // Every response is isolated; a version's assets and packs are immutable, its pages are not.
  const header = async (path, name) => (await get(path)).headers.get(name);
  for (const name of ["v0.1.0", "v0.10.0"]) {
    assert.equal(await header(`/${name}/`, "cross-origin-embedder-policy"), "require-corp");
    assert.equal(await header(`/${name}/`, "cache-control"), "no-store");
  }
  assert.equal(await header(`/v0.1.0/${release("a")}Dollyfile`, "cache-control"), "public, max-age=31536000, immutable, no-transform");
  assert.equal(await header(`/v0.1.0/${release("a")}Dollyfile`, "content-type"), "text/plain; charset=utf-8");
  assert.equal(await header(`/v0.1.0/${pack}`, "cache-control"), "public, max-age=31536000, immutable, no-transform");
  assert.equal(await header(`/v0.1.0/${pack}`, "x-dolly-parts"), "1");
  assert.equal(await header(`/v0.10.0/${release("b")}src/browser.mjs`, "cross-origin-resource-policy"), "same-origin");
  // The same file stored differently by two versions is served as each stored it.
  const seed = version => get(`/${version}/${release({ "v0.1.0": "a", "v0.10.0": "b", "v0.2.0": "d" }[version])}dist/dolly.data`);
  for (const [version, encoding, parts] of [["v0.1.0", "br", null], ["v0.10.0", null, "1"], ["v0.2.0", null, null]]) {
    const response = await seed(version);
    assert.deepEqual([response.headers.get("content-encoding"), response.headers.get("x-dolly-parts")], [encoding, parts], version);
  }
  // Stored the same way by every version that has it: one rule for all of them.
  for (const [version, letter] of [["v0.1.0", "a"], ["v0.10.0", "b"]]) {
    assert.equal(await header(`/${version}/${release(letter)}dist/static/default/zig.tar`, "content-encoding"), "br");
  }
  assert.equal((await readFile(resolve(output, "_headers"), "utf8")).split("zig.tar").length, 2);

  // The live site is the second copy: a mirror takes a version back, file by
  // file against its list, and the same check finds a byte changed after a deploy.
  const mirror = resolve(root, "mirror");
  await mkdir(mirror);
  await mirrorVersion(host.origin, "v0.1.0", mirror);
  for (const path of ["deployment.sha256", "index.html", release("a") + "dist/dolly.data", `${pack}.part-0`]) {
    assert.deepEqual(await readFile(resolve(mirror, "v0.1.0", path)), await readFile(resolve(archive, "v0.1.0", path)), path);
  }
  assert.deepEqual(await exportCloudflarePages(mirror, resolve(root, "redeployed")).then(({ versions }) => versions), { "v0.1.0": summary.versions["v0.1.0"] });
  await assert.rejects(mirrorVersion(host.origin, "v0.1.0", mirror), /already exists/);
  assert.deepEqual(await verifyDeployment(host.origin, output, "v0.10.0"), ["v0.1.0", "v0.2.0", "v0.10.0"]);
  // The archive and the deployment share their files, so the byte changes in both.
  await writeFile(resolve(output, "v0.10.0", release("b") + "src/browser.mjs"), "export {};;");
  await assert.rejects(verifyDeployment(host.origin, output, "v0.10.0"), /src\/browser\.mjs differs from deployment\.sha256/);
  await assert.rejects(mirrorVersion(host.origin, "v0.10.0", mirror), /src\/browser\.mjs differs/);
  assert.deepEqual(await readdir(mirror), ["v0.1.0"]);
  await assert.rejects(exportCloudflarePages(archive, resolve(root, "tampered")), /published v0\.10\.0 differs from its deployment\.sha256/);
});

test("Pages export refuses what it cannot publish whole and leaves nothing behind", async t => {
  const root = await mkdtemp(resolve(tmpdir(), "dolly-pages-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const archive = resolve(root, "published");
  await publish(archive, "v0.1.0", {});
  await assert.rejects(exportCloudflarePages(archive, root), /destination already exists/);
  await assert.rejects(exportCloudflarePages(archive, resolve(archive, "output")), /cannot modify its sources/);
  await assert.rejects(exportCloudflarePages(resolve(root, "missing"), resolve(root, "output")), /ENOENT/);
  // A version already published is never exported again.
  await mkdir(resolve(root, "release/src"), { recursive: true });
  await writeFile(resolve(root, "release/src/version.mjs"), 'export const DOLLY_VERSION = "0.1.0";\n');
  await assert.rejects(exportCloudflarePages(archive, resolve(root, "output"), resolve(root, "release")), /v0\.1\.0 is already published/);
  await writeFile(resolve(root, "release/src/version.mjs"), 'export const DOLLY_VERSION = "0.2.0";\n');
  await assert.rejects(exportCloudflarePages(archive, resolve(root, "output"), resolve(root, "release")), /ENOENT/);
  await writeFile(resolve(archive, "notes.txt"), "not a version");
  await assert.rejects(exportCloudflarePages(archive, resolve(root, "output")), /not a version: notes\.txt/);
  await rm(resolve(archive, "notes.txt"));
  // Pages takes 20,000 files: the versions are named and none is dropped.
  const files = count => Object.fromEntries(Array.from({ length: count - 4 }, (_, index) => [`files/${index}`, ""]));
  await publish(archive, "v0.2.0", files(10000));
  await publish(archive, "v0.3.0", files(9993));
  await assert.rejects(exportCloudflarePages(archive, resolve(root, "output")),
    /20,000-file limit exceeded by 1: v0\.1\.0 has 4 files, v0\.2\.0 has 10000 files, v0\.3\.0 has 9993 files/);
  assert.deepEqual((await readdir(root)).sort(), ["published", "release"]);
});
