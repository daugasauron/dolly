import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { promisify } from "node:util";
import { ensureSnapshotPacks, shareSnapshots, splitSnapshotRecords } from "../scripts/share-pages-snapshots.mjs";
import { parseGeneratedConstant } from "../scripts/image-directory.mjs";
import { decodeSnapshotRecords, encodeSnapshotRecords, mergeSnapshotRecords, scanSnapshotRecords, validateSnapshotPacks, MAX_SNAPSHOT_BYTES } from "../src/snapshot-records.mjs";

const digest = value => createHash("sha256").update(value).digest("hex");
const execFile = promisify(execFileCallback);
const file = text => ({ kind: 2, data: new TextEncoder().encode(text) });
test("development images reuse complete packs and repair missing delivery files", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "dolly-image-packs-"));
  try {
    const bytes = encodeSnapshotRecords(new Map([["/config", file("config")],
      ["/large", { kind: 2, data: new Uint8Array(5 * 1024 * 1024).fill(42) }]]));
    const metadata = { image: "fixture", byteLength: bytes.length, sha256: digest(bytes) };
    await writeFile(resolve(directory, "dolly-fixture-system.snapshot"), bytes);
    const packed = await ensureSnapshotPacks(directory, metadata);
    assert.equal(packed.packs.length, 2);
    assert.equal(await ensureSnapshotPacks(directory, packed), packed);
    await rm(resolve(directory, "packs", `${packed.packs[0].sha256}.snapshot.gz`));
    const repaired = await ensureSnapshotPacks(directory, packed);
    assert.deepEqual(repaired, packed);
    const parts = await Promise.all(repaired.packs.map(async pack =>
      gunzipSync(await readFile(resolve(directory, "packs", `${pack.sha256}.snapshot.gz`)))));
    assert.deepEqual(mergeSnapshotRecords(parts), bytes);
    await assert.rejects(ensureSnapshotPacks(directory, { ...metadata, sha256: "0".repeat(64) }), /mismatch/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("large image packs fit the image bound, including aggregate-size enforcement", () => {
  const limit = MAX_SNAPSHOT_BYTES;
  const pack = size => ({ sha256: "a".repeat(64), byteLength: size, encodedByteLength: size });
  assert.equal(validateSnapshotPacks({ byteLength: limit, packs: [pack(limit)] }).length, 1);
  assert.throws(() => validateSnapshotPacks({ byteLength: limit + 1, packs: [pack(limit + 1)] }), /descriptor/);
  assert.throws(() => validateSnapshotPacks({ byteLength: limit + 1,
    packs: [pack(limit), { ...pack(17), sha256: "b".repeat(64) }] }), /size limit/);
});

test("an image of small files at the size bound fits the pack bound", () => {
  // Records of 700 KiB, as a library's .olean files, up to the image bound.
  const records = new Map(), size = 700 * 1024;
  let byteLength = 16;
  for (let index = 0; ; index += 1) {
    const path = `/usr/lib/${String(index).padStart(6, "0")}`;
    if (byteLength + 16 + path.length + size > MAX_SNAPSHOT_BYTES) break;
    records.set(path, { kind: 2, byteLength: size });
    byteLength += 16 + path.length + size;
  }
  const packs = splitSnapshotRecords(records).map((part, index) => {
    const packLength = [...part].reduce((sum, [path, record]) => sum + 16 + path.length + record.byteLength, 16);
    return { sha256: index.toString(16).padStart(64, "0"), byteLength: packLength, encodedByteLength: packLength };
  });
  assert.equal(validateSnapshotPacks({ byteLength, packs }).length, packs.length);
});

async function packImages(directory, inputs) {
  const snapshots = resolve(directory, "inputs");
  await mkdir(snapshots, { recursive: true });
  for (const [image, records] of inputs) {
    const bytes = encodeSnapshotRecords(records);
    await writeFile(resolve(snapshots, `dolly-${image}-system.snapshot`), bytes);
    await writeFile(resolve(directory, `dolly-${image}-system-snapshot.mjs`),
      `export const DOLLY_SYSTEM_SNAPSHOT = Object.freeze(${JSON.stringify({ image, byteLength: bytes.length, sha256: digest(bytes) })});\n`);
  }
  await shareSnapshots(directory, snapshots);
  for (const [image, records] of inputs) {
    assert.deepEqual(new Uint8Array(await readFile(resolve(snapshots, `dolly-${image}-system.snapshot`))), encodeSnapshotRecords(records));
  }
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

// The release catalog is 25 GB; sharing must hold one chunk at a time, not
// the catalog. Eight 32 MB images of distinct content: a script that reads
// snapshots whole or keeps every pack peaks above twice the catalog.
test("sharing a catalog peaks below the catalog's size", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "dolly-pack-memory-"));
  try {
    const snapshots = resolve(directory, "inputs");
    await mkdir(snapshots);
    let catalogBytes = 0;
    for (let image = 0; image < 8; image += 1) {
      const records = new Map();
      for (let index = 0; index < 8; index += 1) {
        records.set(`/file-${index}`, { kind: 2, data: new Uint8Array(4 * 1024 * 1024).fill(image * 8 + index) });
      }
      const bytes = encodeSnapshotRecords(records);
      catalogBytes += bytes.length;
      await writeFile(resolve(snapshots, `dolly-image${image}-system.snapshot`), bytes);
      await writeFile(resolve(directory, `dolly-image${image}-system-snapshot.mjs`),
        `export const DOLLY_SYSTEM_SNAPSHOT = Object.freeze(${JSON.stringify({ image: `image${image}`, byteLength: bytes.length, sha256: digest(bytes) })});\n`);
    }
    const { stdout } = await execFile(process.execPath, ["--input-type=module", "-e", `
      const { shareSnapshots } = await import(${JSON.stringify(new URL("../scripts/share-pages-snapshots.mjs", import.meta.url).href)});
      await shareSnapshots(${JSON.stringify(directory)}, ${JSON.stringify(snapshots)});
      console.log(process.resourceUsage().maxRSS * 1024);`]);
    const peakBytes = Number(stdout.trim().split("\n").at(-1));
    assert.ok(peakBytes < catalogBytes, `sharing ${catalogBytes} bytes peaked at ${peakBytes} bytes`);
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

test("a snapshot read in pieces decodes as the whole does, holding only the selected data", async () => {
  const directory = { kind: 1, data: new Uint8Array(0) };
  const records = new Map([["/etc", directory], ["/etc/dolly", directory], ["/etc/dolly/Dollyfile", file("DOLLY 7\n")],
    ["/link", { kind: 3, data: new TextEncoder().encode("etc") }], ["/usr", directory],
    ["/usr/large", { kind: 2, data: new Uint8Array(70_000).map((_, index) => index) }]]);
  const bytes = encodeSnapshotRecords(records);
  const pieces = function* (size) { for (let offset = 0; offset < bytes.length; offset += size) yield bytes.subarray(offset, offset + size); };
  for (const size of [1, 7, 16, 4096, bytes.length]) {
    const { records: scanned, byteLength } = await scanSnapshotRecords(pieces(size), path => path.startsWith("/etc/dolly/"));
    assert.equal(byteLength, bytes.length);
    assert.deepEqual([...scanned.keys()], [...decodeSnapshotRecords(bytes).keys()]);
    const whole = decodeSnapshotRecords(bytes), at = path => ({ offset: whole.get(path).data.byteOffset, size: whole.get(path).data.length });
    assert.deepEqual(scanned.get("/etc/dolly/Dollyfile"), { ...records.get("/etc/dolly/Dollyfile"), ...at("/etc/dolly/Dollyfile") });
    assert.deepEqual(scanned.get("/link").data, records.get("/link").data);
    assert.deepEqual(scanned.get("/usr/large"), { kind: 2, data: undefined, ...at("/usr/large") });
  }
  assert.equal((await scanSnapshotRecords([bytes, new Uint8Array(0)], () => false)).byteLength, bytes.length);
  await assert.rejects(scanSnapshotRecords([bytes.subarray(0, -1)], () => false), /truncated/);
  await assert.rejects(scanSnapshotRecords([bytes, new Uint8Array(1)], () => false), /trailing/);
  const unsorted = new Uint8Array(bytes);
  unsorted.set(new TextEncoder().encode("/aaa"), bytes.length - 70_000 - 10);
  await assert.rejects(scanSnapshotRecords([unsorted], () => false), /invalid snapshot path/);
});
