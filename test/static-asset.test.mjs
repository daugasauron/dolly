import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { decodeStaticAsset } from "../src/static-asset.mjs";

const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const parts = [Buffer.from("part one"), Buffer.from(" and part two")];
const bytes = Buffer.concat(parts);
const manifest = () => ({ byteLength: bytes.length, sha256: digest(bytes),
  parts: parts.map(part => ({ byteLength: part.length, sha256: digest(part) })) });
const response = value => new Response(JSON.stringify(value), { headers: { "x-dolly-parts": "1" } });
const target = "https://fixture.example/_dolly/release/static/sdk.tar.gz";

test("multipart delivery uses only fixed sibling URLs and verifies original bytes", async () => {
  const controller = new AbortController(), calls = [];
  const decoded = await decodeStaticAsset(response(manifest()), target, { signal: controller.signal }, bytes.length,
    async (url, init) => {
      assert.equal(url.href, `${target}.part-${calls.length}`);
      assert.equal(init.method, "GET");
      assert.equal(init.redirect, "error");
      assert.equal(init.credentials, "omit");
      assert.equal(init.headers, undefined);
      assert.equal(init.signal, controller.signal);
      calls.push(url.href);
      return new Response(parts[calls.length - 1]);
    });
  assert.deepEqual(Buffer.from(await decoded.arrayBuffer()), bytes);
  assert.equal(decoded.headers.get("content-length"), String(bytes.length));
  assert.equal(decoded.headers.has("x-dolly-parts"), false);
  const ordinary = new Response("ordinary");
  assert.equal(await decodeStaticAsset(ordinary, target, {}, 100), ordinary);
});

test("multipart delivery rejects malformed sizes and hashes before following any part", async () => {
  const invalid = [null, {}, { ...manifest(), byteLength: bytes.length + 1 },
    { ...manifest(), parts: [] }, { ...manifest(), sha256: "invalid" },
    { ...manifest(), parts: [{ byteLength: -1, sha256: digest(bytes) }] }];
  for (const value of invalid) await assert.rejects(decodeStaticAsset(response(value), target, {}, bytes.length,
    () => assert.fail("invalid manifest must not fetch")));
  await assert.rejects(decodeStaticAsset(response(manifest()), target, {}, bytes.length - 1,
    () => assert.fail("quota exceeded before fetch")), /manifest/);
  await assert.rejects(decodeStaticAsset(response(manifest()), target + "?guest=value", {}, bytes.length), /request/);
  await assert.rejects(decodeStaticAsset(response(manifest()), target, {}, bytes.length,
    async () => new Response("corrupt")), /integrity/);
  await assert.rejects(decodeStaticAsset(response(manifest()), target, {}, bytes.length,
    async () => new Response(new Uint8Array(100))), /declared size/);
  const controller = new AbortController();
  await assert.rejects(decodeStaticAsset(response(manifest()), target, { signal: controller.signal }, bytes.length,
    async () => { controller.abort(); return new Response(parts[0]); }), { name: "AbortError" });
});
