import assert from "node:assert/strict";
import test from "node:test";
import { exportSessionFile, importSessionFile } from "../src/session-file.mjs";
import { DOLLY_SESSION_MAX_BYTES, DOLLY_SESSION_METADATA_MAX_BYTES,
  customSessionIdentity, sessionCompatible, encodeSessionSnapshot, decodeSessionSnapshot } from "../src/session-store.mjs";
import { createHash } from "node:crypto";

const bytes = new TextEncoder().encode("DOLLYSES-opaque-\uFEFF日本語-credential").buffer;
const record = { name: "work.1", formatVersion: 2, buildId: "fixture-build",
  image: "default", imageIdentity: "default:fixture", updatedAt: 123, encoding: "identity", bytes };

async function edit(file, change) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const length = new DataView(bytes.buffer).getUint32(8, true);
  const metadata = JSON.parse(new TextDecoder().decode(bytes.subarray(12, 12 + length)));
  change(metadata);
  const encoded = new TextEncoder().encode(JSON.stringify(metadata));
  const header = bytes.slice(0, 12);
  new DataView(header.buffer).setUint32(8, encoded.length, true);
  return new Blob([header, encoded, bytes.subarray(12 + length)]);
}

test("session files round-trip identity and gzip bytes and literal metadata", async () => {
  for (const encoded of [{ encoding: "identity", bytes }, await encodeSessionSnapshot(bytes)]) {
    const saved = { ...record, ...encoded };
    const restored = await importSessionFile(await exportSessionFile(saved));
    assert.deepEqual(restored, saved);
    assert.deepEqual(await decodeSessionSnapshot(restored), bytes);
  }
});

test("reject corrupt, truncated, oversized and unsupported session envelopes", async () => {
  const file = await exportSessionFile(record);
  for (const length of [0, 11, 12, file.size - 1]) await assert.rejects(importSessionFile(file.slice(0, length)));
  const corrupted = new Uint8Array(await file.arrayBuffer());
  corrupted[corrupted.length - 1] ^= 1;
  await assert.rejects(importSessionFile(new Blob([corrupted])), /checksum/);
  corrupted[0] = 0;
  await assert.rejects(importSessionFile(new Blob([corrupted])), /supported/);
  const huge = new Blob();
  Object.defineProperty(huge, "size", { value: DOLLY_SESSION_MAX_BYTES + DOLLY_SESSION_METADATA_MAX_BYTES + 13 });
  huge.slice = () => { throw Error("must reject size before reading"); };
  await assert.rejects(importSessionFile(huge), /file size/);
  for (const mutate of [
    meta => { meta.name = "../secret"; }, meta => { meta.formatVersion = 999; },
    meta => { meta.encoding = "unknown"; }, meta => { meta.byteLength++; },
    meta => { meta.sha256 = "invalid"; }, meta => { meta.updatedAt = 1.5; },
    meta => { meta.buildId = "x".repeat(8192); },
  ]) await assert.rejects(importSessionFile(await edit(file, mutate)));
  await assert.rejects(importSessionFile(await exportSessionFile({ ...record, encoding: "gzip" })));
  await assert.rejects(importSessionFile(await exportSessionFile({ ...record, bytes: new ArrayBuffer(1) })), /incomplete/);
});

test("custom session files retain the exact recipe, artifact and inherited restrictions", async () => {
  const source = `DOLLY 3\nIMAGE custom-proof\nFILE /usr/share/note\n    ${"note".repeat(2500)}\nENTRY /bin/slop\n`;
  const customImage = { source, artifact: { buildId: "image-build",
    recipeSha256: createHash("sha256").update(source).digest("hex"), sha256: "a".repeat(64),
    byteLength: 1234, inputs: [{ recipeSha256: "b".repeat(64), sha256: "c".repeat(64) }] },
    policies: [{ rules: [], maxRequests: 3 }, null] };
  const saved = { ...record, image: "custom", imageIdentity: customSessionIdentity(customImage), customImage };
  const imported = await importSessionFile(await exportSessionFile(saved));
  assert.deepEqual(imported, saved);
  assert.equal(sessionCompatible(imported, [], record.buildId, "image-build"), true);
  assert.equal(sessionCompatible(imported, [], "another-runtime", "image-build"), false);
  assert.equal(sessionCompatible(imported, [], record.buildId, "another-image-build"), false);
  for (const mutate of [
    meta => { delete meta.customImage; },
    meta => { meta.image = "default"; },
    meta => { meta.imageIdentity += "changed"; },
    meta => { meta.customImage.source = "DOLLY 2"; },
    meta => { meta.customImage.artifact.sha256 = "invalid"; },
    meta => { meta.customImage.artifact.sha256 = ["a".repeat(64)]; },
    meta => { meta.customImage.artifact.byteLength = DOLLY_SESSION_MAX_BYTES + 1; },
    meta => { meta.customImage.artifact.inputs[0].sha256 = "invalid"; },
    meta => { meta.customImage.policies = []; },
    meta => { meta.customImage.policies = ["x".repeat(65536)]; },
  ]) await assert.rejects(importSessionFile(await edit(await exportSessionFile(saved), mutate)));
});

test("incompatible build IDs remain exportable without interpreting filesystem records", async () => {
  const old = { ...record, buildId: "older-build", imageIdentity: "older-image" };
  assert.deepEqual(await importSessionFile(await exportSessionFile(old)), old);
  const file = await edit(await exportSessionFile(record), metadata => {
    Object.defineProperty(metadata, "__proto__", { value: { polluted: true }, enumerable: true });
    metadata.browserPath = "/host/path";
  });
  assert.deepEqual(await importSessionFile(file), record);
  assert.equal({}.polluted, undefined);
});
