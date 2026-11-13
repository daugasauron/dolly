import assert from "node:assert/strict";
import test from "node:test";
import { exportSessionFile, importSessionFile } from "../site/session-file.mjs";
import { DOLLY_SESSION_FORMAT_VERSION, DOLLY_SESSION_MAX_BYTES, DOLLY_SESSION_METADATA_MAX_BYTES,
  customSessionIdentity, sessionCompatible, encodeSessionStream, decodeSessionSnapshot } from "../site/session-store.mjs";
import { createHash, randomBytes } from "node:crypto";
import { MAX_SNAPSHOT_BYTES } from "../page/snapshot-records.mjs";

const bytes = new TextEncoder().encode("DOLLYSES-opaque-\uFEFF日本語-credential").buffer;
const encodeSessionSnapshot = input => encodeSessionStream(write => write(new Uint8Array(input)));
const record = { name: "work.1", formatVersion: DOLLY_SESSION_FORMAT_VERSION, buildId: "fixture-build",
  image: "default", imageIdentity: "default:fixture", updatedAt: 123, ...await encodeSessionSnapshot(bytes) };
// A record with its save's bytes, which deepEqual compares (it takes any two Blobs for equal).
const plain = async saved => ({ ...saved, bytes: Buffer.from(await saved.bytes.arrayBuffer()) });

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

test("session files round-trip their bytes and literal metadata", async () => {
  const restored = await importSessionFile(await exportSessionFile(record));
  assert.deepEqual(await plain(restored), await plain(record));
  assert.deepEqual(await decodeSessionSnapshot(restored.bytes), bytes);
});

test("a session file is checked without its save in one buffer, which a browser refuses past 2 GiB", async t => {
  // A save larger than the file's metadata, which is read whole.
  const large = { ...record, ...await encodeSessionSnapshot(new Uint8Array(randomBytes(65536)).buffer) };
  const whole = Blob.prototype.arrayBuffer;
  Blob.prototype.arrayBuffer = function () {
    if (this.size >= large.bytes.size) throw new RangeError("Array buffer allocation failed");
    return whole.call(this);
  };
  t.after(() => { Blob.prototype.arrayBuffer = whole; });
  const restored = await importSessionFile(await exportSessionFile(large));
  Blob.prototype.arrayBuffer = whole;
  assert.deepEqual(await plain(restored), await plain(large));
});

test("streamed compression preserves bytes across chunks and rejects an incomplete producer", async () => {
  const encoded = await encodeSessionStream(async write => {
    for (let at = 0; at < bytes.byteLength; at += 7) await write(new Uint8Array(bytes.slice(at, at + 7)));
  });
  assert.deepEqual(await decodeSessionSnapshot(encoded.bytes), bytes);
  await assert.rejects(encodeSessionStream(async write => {
    await write(new Uint8Array(bytes));
    throw Error("producer stopped");
  }), /producer stopped/);
});

test("an allocation failure cancels compression instead of stranding its producer", async () => {
  const original = globalThis.Blob;
  globalThis.Blob = class { constructor() { throw Error("allocation failed"); } };
  try {
    await assert.rejects(encodeSessionStream(async write => {
      await write(new Uint8Array(bytes));
    }), /allocation failed/);
  } finally {
    globalThis.Blob = original;
  }
});

test("compression and decompression retain data across buffer growth", async () => {
  const input = randomBytes(256 * 1024 + 19);
  const encoded = await encodeSessionSnapshot(new Uint8Array(input).buffer);
  const decoded = await decodeSessionSnapshot(encoded.bytes);
  assert.ok(Buffer.from(decoded).equals(input));
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
    meta => { meta.buildId = "x".repeat(8192); }, meta => { delete meta.version; },
  ]) await assert.rejects(importSessionFile(await edit(file, mutate)));
  // Another version's file is refused by a message naming the version it belongs to.
  await assert.rejects(importSessionFile(await edit(file, meta => { meta.version = "9.8.7"; })), /9\.8\.7/);
  await assert.rejects(exportSessionFile({ ...record, bytes }), /invalid Dolly session record/);
});

test("custom session files retain the exact recipe, artifact and inherited restrictions", async () => {
  const source = `DOLLY 7\nAPPLICATION custom-proof\nFILE /usr/share/note\n    ${"note".repeat(2500)}\nENTRY /bin/slop\n`;
  const customImage = { source, artifact: { buildId: "image-build",
    recipeSha256: createHash("sha256").update(source).digest("hex"), sha256: "a".repeat(64),
    byteLength: 1234, inputs: [{ recipeSha256: "b".repeat(64), sha256: "c".repeat(64) }] },
    policies: [{ rules: [], maxRequests: 3 }, null] };
  const saved = { ...record, image: "custom", imageIdentity: customSessionIdentity(customImage), customImage };
  const imported = await importSessionFile(await exportSessionFile(saved));
  assert.deepEqual(await plain(imported), await plain(saved));
  // A save is its whole filesystem: the runtime decides, not the image the recipe built.
  assert.equal(sessionCompatible(imported, [], record.buildId), true);
  assert.equal(sessionCompatible(imported, [], "another-runtime"), false);
  // An image without http@0 inherits no policies: its session is as valid.
  const { policies: _none, ...offline } = customImage;
  const quiet = { ...saved, customImage: offline };
  assert.deepEqual(await plain(await importSessionFile(await exportSessionFile(quiet))), await plain(quiet));
  assert.equal(sessionCompatible(quiet, [], record.buildId), true);
  for (const mutate of [
    meta => { delete meta.customImage; },
    meta => { meta.image = "default"; },
    meta => { meta.imageIdentity += "changed"; },
    meta => { meta.customImage.source = "DOLLY 2"; },
    meta => { meta.customImage.artifact.sha256 = "invalid"; },
    meta => { meta.customImage.artifact.sha256 = ["a".repeat(64)]; },
    meta => { meta.customImage.artifact.byteLength = MAX_SNAPSHOT_BYTES + 1; },
    meta => { meta.customImage.artifact.inputs[0].sha256 = "invalid"; },
    meta => { meta.customImage.policies = []; },
    meta => { meta.customImage.policies = ["x".repeat(65536)]; },
  ]) await assert.rejects(importSessionFile(await edit(await exportSessionFile(saved), mutate)));
});

// The custom image a save names may be as large as any image.
test("a session's custom image may be as large as any image", () => {
  const source = "DOLLY 7\nAPPLICATION large\nENTRY /bin/slop\n";
  const custom = byteLength => ({ source, artifact: { buildId: "image-build",
    recipeSha256: createHash("sha256").update(source).digest("hex"), sha256: "a".repeat(64), byteLength, inputs: [] } });
  assert.match(customSessionIdentity(custom(MAX_SNAPSHOT_BYTES)), /^custom:/);
  assert.throws(() => customSessionIdentity(custom(MAX_SNAPSHOT_BYTES + 1)), /invalid custom session base/);
});

test("incompatible build IDs remain exportable without interpreting filesystem records", async () => {
  const old = { ...record, buildId: "older-build", imageIdentity: "older-image" };
  assert.deepEqual(await plain(await importSessionFile(await exportSessionFile(old))), await plain(old));
  const file = await edit(await exportSessionFile(record), metadata => {
    Object.defineProperty(metadata, "__proto__", { value: { polluted: true }, enumerable: true });
    metadata.browserPath = "/host/path";
  });
  assert.deepEqual(await plain(await importSessionFile(file)), await plain(record));
  assert.equal({}.polluted, undefined);
});
