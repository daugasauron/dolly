import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { shareSnapshots, splitSnapshotRecords } from "../scripts/share-pages-snapshots.mjs";
import { parseGeneratedConstant } from "../scripts/site-release.mjs";
import { decodeSnapshotRecords, encodeSnapshotRecords, mergeSnapshotRecords, validateSnapshotPacks } from "../src/snapshot-records.mjs";

const digest = value => createHash("sha256").update(value).digest("hex");
const file = text => ({ kind: 2, data: new TextEncoder().encode(text) });
async function packImages(directory, inputs) {
  for (const [image, records] of inputs) {
    const bytes = encodeSnapshotRecords(records);
    await writeFile(resolve(directory, `dolly-${image}-system.snapshot`), bytes);
    await writeFile(resolve(directory, `dolly-${image}-system-snapshot.mjs`),
      `export const DOLLY_SYSTEM_SNAPSHOT = Object.freeze(${JSON.stringify({ image, byteLength: bytes.length, sha256: digest(bytes) })});\n`);
  }
  await shareSnapshots(directory);
  return new Map(await Promise.all([...inputs.keys()].map(async image => [image,
    parseGeneratedConstant(await readFile(resolve(directory, `dolly-${image}-system-snapshot.mjs`), "utf8"), "DOLLY_SYSTEM_SNAPSHOT")])));
}

test("bounded record packs isolate large files and stabilize after small edits", () => {
  const records = new Map([["/a-config", file("original")]]);
  for (let i = 0; i < 64; i++) records.set(`/headers/${String(i).padStart(3, "0")}`, {
    kind: 2, data: new Uint8Array(128 * 1024).fill(i),
  });
  records.set("/z-compiler", { kind: 2, data: new Uint8Array(6 * 1024 * 1024).fill(123) });
  const original = splitSnapshotRecords(records).map(encodeSnapshotRecords);
  assert.deepEqual(mergeSnapshotRecords(original), encodeSnapshotRecords(records));
  assert.deepEqual(splitSnapshotRecords(new Map([...records].reverse())).map(encodeSnapshotRecords), original);
  for (const bytes of original) {
    if (bytes.length > 4 * 1024 * 1024) assert.deepEqual([...decodeSnapshotRecords(bytes).keys()], ["/z-compiler"]);
  }
  records.set("/a-config", file("changed and longer"));
  const changed = splitSnapshotRecords(records).map(encodeSnapshotRecords);
  const known = new Set(original.map(digest));
  assert.equal(changed.filter(bytes => !known.has(digest(bytes))).length, 1);
  records.delete("/a-config");
  const deleted = splitSnapshotRecords(records).map(encodeSnapshotRecords);
  assert.equal(deleted.filter(bytes => !known.has(digest(bytes))).length, 1);
});

test("shared packs reconstruct every image exactly, including type changes and Unicode paths", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "dolly-packs-"));
  try {
    const inputs = new Map([
      ["first", new Map([["/shared", file("common")], ["/東京", file("one")], ["/kind", { kind: 1, data: new Uint8Array() }]])],
      ["second", new Map([["/shared", file("common")], ["/東京", file("two")], ["/kind", file("replaced directory")]])],
      ["third", new Map([["/shared", file("common")], ["/東京", file("one")]])],
    ]);
    await packImages(directory, inputs);
    const allPacks = new Map();
    for (const [image, records] of inputs) {
      const metadata = parseGeneratedConstant(await readFile(resolve(directory, `dolly-${image}-system-snapshot.mjs`), "utf8"), "DOLLY_SYSTEM_SNAPSHOT");
      const parts = [];
      for (const pack of validateSnapshotPacks(metadata)) {
        const bytes = gunzipSync(await readFile(resolve(directory, `packs/${pack.sha256}.snapshot.gz`)));
        assert.equal(bytes.length, pack.byteLength);
        assert.equal(digest(bytes), pack.sha256);
        allPacks.set(pack.sha256, bytes);
        parts.push(bytes);
      }
      assert.deepEqual(mergeSnapshotRecords(parts), encodeSnapshotRecords(records));
      await assert.rejects(readFile(resolve(directory, `dolly-${image}-system.snapshot`)), { code: "ENOENT" });
    }
    assert.equal([...allPacks.values()].filter(bytes => decodeSnapshotRecords(bytes).has("/shared")).length, 1);
    const part = encodeSnapshotRecords(inputs.get("third"));
    assert.throws(() => mergeSnapshotRecords([part, part]), /duplicate/);
    assert.throws(() => decodeSnapshotRecords(part.subarray(0, part.length - 1)), /size|truncated/);
    assert.throws(() => validateSnapshotPacks({ byteLength: 20, packs: [{ sha256: "../../oops" }] }), /descriptor/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("adding a partially overlapping image preserves large existing pack identities", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "dolly-pack-addition-"));
  try {
    const common = new Map([["/config", file("original")],
      ["/compiler", { kind: 2, data: new Uint8Array(6 * 1024 * 1024).fill(123) }]]);
    const inputs = new Map([["first", common], ["second", new Map([...common, ["/extra", file("second")]])]]);
    const original = await packImages(directory, inputs);
    const known = new Set([...original.values()].flatMap(image => image.packs.map(pack => pack.sha256)));
    inputs.set("third", new Map([["/compiler", common.get("/compiler")], ["/config", file("different")]]));
    const added = await packImages(directory, inputs);
    for (const image of added.values()) {
      const changed = image.packs.filter(pack => !known.has(pack.sha256));
      assert.ok(changed.reduce((sum, pack) => sum + pack.byteLength, 0) < 1024);
      assert.ok(image.packs.some(pack => known.has(pack.sha256) && pack.byteLength > 6 * 1024 * 1024));
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
