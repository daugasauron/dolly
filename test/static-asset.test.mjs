import assert from "node:assert/strict";
import { sha256 as digest } from "../scripts/sha256.mjs";
import test from "node:test";
import { decodeStaticAsset } from "../page/static-asset.mjs";
const parts = [Buffer.from("part one"), Buffer.from(" and part two")];
const bytes = Buffer.concat(parts);
const manifest = () => ({ byteLength: bytes.length, sha256: digest(bytes),
  parts: parts.map(part => ({ byteLength: part.length, sha256: digest(part) })) });
const response = value => new Response(JSON.stringify(value));
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
  for (const body of ["ordinary", '{"byteLengt', "", JSON.stringify({ sha256: digest(bytes), byteLength: bytes.length })]) {
    // An ordinary file comes back whole, the bytes read to tell it from a manifest included.
    const ordinary = await decodeStaticAsset(new Response(body), target, {}, 100, () => assert.fail("not a manifest"));
    assert.equal(await ordinary.text(), body);
  }
  const missing = new Response(JSON.stringify(manifest()), { status: 404 });
  assert.equal(await decodeStaticAsset(missing, target, {}, bytes.length, () => assert.fail("not a file")), missing);
});

test("multipart delivery rejects malformed sizes and hashes before following any part", async () => {
  const invalid = [{ byteLength: null }, { byteLength: bytes.length }, { ...manifest(), byteLength: bytes.length + 1 }, { ...manifest(), parts: [] },
    { ...manifest(), parts: [{ byteLength: -1, sha256: digest(bytes) }] }];
  for (const value of invalid) await assert.rejects(decodeStaticAsset(response(value), target, {}, bytes.length,
    () => assert.fail("invalid manifest must not fetch")));
  await assert.rejects(decodeStaticAsset(new Response('{"byteLength":'), target, {}, bytes.length, () => assert.fail("truncated")), SyntaxError);
  await assert.rejects(decodeStaticAsset(response(manifest()), target, {}, bytes.length - 1,
    () => assert.fail("quota exceeded before fetch")), /manifest/);
  await assert.rejects(decodeStaticAsset(response(manifest()), target + "?guest=value", {}, bytes.length), /request/);
  const read = (fetchPart, init = {}) => decodeStaticAsset(response(manifest()), target, init, bytes.length, fetchPart)
    .then(decoded => decoded.arrayBuffer());
  await assert.rejects(read(async () => new Response("corrupt")), /integrity/);
  await assert.rejects(read(async () => new Response(new Uint8Array(100))), /declared size/);
  const controller = new AbortController();
  await assert.rejects(read(async () => { controller.abort(); return new Response(parts[0]); },
    { signal: controller.signal }), { name: "AbortError" });
});

test("multipart delivery streams one verified part at a time", async () => {
  let fetched = 0;
  const decoded = await decodeStaticAsset(response(manifest()), target, {}, bytes.length,
    async () => new Response(parts[fetched++]));
  assert.equal(fetched, 0, "no part is fetched before the body is read");
  const reader = decoded.body.getReader();
  assert.deepEqual(Buffer.from((await reader.read()).value), parts[0]);
  assert.equal(fetched, 1, "the next part waits for the consumer");
  assert.deepEqual(Buffer.from((await reader.read()).value), parts[1]);
  assert.equal((await reader.read()).done, true);
});
