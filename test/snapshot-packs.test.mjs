import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { shareSnapshots } from "../scripts/share-pages-snapshots.mjs";
import { parseGeneratedConstant } from "../scripts/site-release.mjs";
import { decodeSnapshotRecords, encodeSnapshotRecords, mergeSnapshotRecords, validateSnapshotPacks } from "../src/snapshot-records.mjs";

const digest = value => createHash("sha256").update(value).digest("hex");
const file = text => ({ kind: 2, data: new TextEncoder().encode(text) });
test("shared packs reconstruct every image exactly, including type changes and Unicode paths", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "dolly-packs-"));
  try {
    const inputs = new Map([
      ["first", new Map([["/shared", file("common")], ["/東京", file("one")], ["/kind", { kind: 1, data: new Uint8Array() }]])],
      ["second", new Map([["/shared", file("common")], ["/東京", file("two")], ["/kind", file("replaced directory")]])],
      ["third", new Map([["/shared", file("common")], ["/東京", file("one")]])],
    ]);
    for (const [image, records] of inputs) {
      const bytes = encodeSnapshotRecords(records);
      await writeFile(resolve(directory, `dolly-${image}-system.snapshot`), bytes);
      await writeFile(resolve(directory, `dolly-${image}-system-snapshot.mjs`),
        `export const DOLLY_SYSTEM_SNAPSHOT = Object.freeze(${JSON.stringify({ image, byteLength: bytes.length, sha256: digest(bytes) })});\n`);
    }
    await shareSnapshots(directory);
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
