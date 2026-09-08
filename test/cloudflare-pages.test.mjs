import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { brotliDecompressSync } from "node:zlib";
import test from "node:test";
import { exportCloudflarePages, pagesAsset, pagesHeaders } from "../scripts/export-cloudflare-pages.mjs";

test("Pages transport compresses oversized assets, never changes snapshot encoding", async () => {
  const small = Buffer.from("ordinary asset");
  assert.equal((await pagesAsset(small, "small.wasm")).bytes, small);
  assert.equal((await pagesAsset(small, "pack.snapshot.gz")).compressed, false);
  const large = Buffer.alloc(25 * 1024 * 1024 + 1, 65);
  const encoded = await pagesAsset(large, "_dolly/release/dist/dolly.data");
  assert.equal(encoded.compressed, true);
  assert.ok(encoded.bytes.length < 25 * 1024 * 1024);
  assert.deepEqual(brotliDecompressSync(encoded.bytes), large);
  await assert.rejects(pagesAsset(large, "pack.snapshot.gz"), /snapshot pack exceeds/);
  await assert.rejects(pagesAsset(randomBytes(large.length), "_dolly/release/static/incompressible.data"), /limit after Brotli/);
  await assert.rejects(pagesAsset(large, "_dolly/release/dist/dolly.wasm"), /new delivery check/);
});

test("Pages headers retain isolation, explicit transport encoding and bounded rules", () => {
  const prefix = `_dolly/${"a".repeat(64)}/`;
  const headers = pagesHeaders([prefix + "dist/dolly.data", prefix + "static/default/zig.wasm"]);
  assert.match(headers, /Cross-Origin-Embedder-Policy: require-corp/);
  assert.match(headers, /! Cache-Control\n  Cache-Control: public, max-age=31536000, immutable, no-transform/);
  assert.match(headers, /dist\/dolly.data\n  Content-Encoding: br/);
  assert.match(headers, /zig.wasm\n  Content-Encoding: br\n  Content-Type: application\/octet-stream/);
  assert.doesNotMatch(headers, /Content-Encoding: gzip/);
  assert.throws(() => pagesHeaders([prefix + "a\n/*"]), /invalid Pages header path/);
  assert.throws(() => pagesHeaders(Array.from({ length: 96 }, (_, i) => prefix + i)), /header limits/);
});

test("Pages export refuses existing destinations and cleans failed staging", async t => {
  const root = await mkdtemp(resolve(tmpdir(), "dolly-pages-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(resolve(root, "keep"), "owned data");
  await assert.rejects(exportCloudflarePages(root, root), /destination already exists/);
  assert.equal(await readFile(resolve(root, "keep"), "utf8"), "owned data");
  await assert.rejects(exportCloudflarePages(root, resolve(root, "output")), /cannot modify a source/);
  await mkdir(resolve(root, "unverified"));
  await assert.rejects(exportCloudflarePages(resolve(root, "unverified"), resolve(root, "output")), /ENOENT/);
  assert.deepEqual((await readdir(root)).sort(), ["keep", "unverified"]);
});
