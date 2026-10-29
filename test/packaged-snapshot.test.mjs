import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { shareSnapshots } from "../scripts/share-pages-snapshots.mjs";
import { parseGeneratedConstant } from "../scripts/site-release.mjs";
import { encodeSnapshotRecords } from "../src/snapshot-records.mjs";
import { loadImages } from "../src/images.mjs";
import { packagedSystemSnapshot } from "../src/packaged-snapshot.mjs";
import { Sha256 } from "../src/sha256.mjs";

const digest = bytes => createHash("sha256").update(bytes).digest("hex");

test("the incremental hash is SHA-256 however the bytes are split", () => {
  const bytes = Uint8Array.from({ length: 1000 }, (_, index) => index * 7919 >>> 3);
  for (const length of [0, 1, 55, 56, 63, 64, 65, 119, 120, 1000]) {
    for (const split of [0, 1, 63, 64, 65]) {
      const hash = new Sha256(), input = bytes.subarray(0, length), at = Math.min(split, length);
      hash.update(input.subarray(0, at));
      hash.update(input.subarray(at));
      assert.equal(hash.hex(), digest(input), `${length} bytes split at ${at}`);
    }
  }
});

// Two images sharing files are packed as the site publishes them: each
// image's records then lie in packs that interleave in path order.
test("a package's snapshot is merged from its packs as it is read, and checked whole", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "dolly-packaged-snapshot-"));
  const nodeFetch = globalThis.fetch;
  try {
    const file = (seed, length) => ({ kind: 2, data: Uint8Array.from({ length }, (_, index) => (index * seed) >>> 5) });
    const shared = new Map([["/usr", { kind: 1, data: new Uint8Array(0) }], ["/usr/b", file(3, 3 << 20)], ["/usr/d", file(5, 1000)]]);
    const own = new Map([...shared, ["/usr/a", file(7, 5 << 20)], ["/usr/c", file(11, 2000)], ["/usr/e", { kind: 3, data: new TextEncoder().encode("d") }]]);
    const dist = resolve(directory, "dist"), inputs = resolve(directory, "inputs");
    await mkdir(inputs, { recursive: true });
    for (const [image, records] of [["own", own], ["other", new Map([...shared, ["/other", file(13, 10)]])]]) {
      const bytes = encodeSnapshotRecords(records);
      await writeFile(resolve(inputs, `dolly-${image}-system.snapshot`), bytes);
      await mkdir(dist, { recursive: true });
      await writeFile(resolve(dist, `dolly-${image}-system-snapshot.mjs`),
        `export const DOLLY_SYSTEM_SNAPSHOT = Object.freeze(${JSON.stringify({ image, byteLength: bytes.length, sha256: digest(bytes) })});\n`);
    }
    await shareSnapshots(dist, inputs);
    await writeFile(resolve(dist, "dolly-images.mjs"), "export const DOLLY_IMAGES = [], DOLLY_STATIC_SOURCES = [];\n");
    await loadImages(pathToFileURL(`${directory}/`));
    globalThis.fetch = async url => new Response(await readFile(fileURLToPath(url)));
    const metadata = parseGeneratedConstant(await readFile(resolve(dist, "dolly-own-system-snapshot.mjs"), "utf8"), "DOLLY_SYSTEM_SNAPSHOT");
    assert.ok(metadata.packs.length >= 3);
    const read = async metadata => {
      const chunks = [];
      for await (const chunk of await packagedSystemSnapshot("own", metadata)) chunks.push(chunk);
      return Buffer.concat(chunks);
    };
    assert.deepEqual(new Uint8Array(await read(metadata)), encodeSnapshotRecords(own));
    await assert.rejects(read({ ...metadata, sha256: "0".repeat(64) }), /packed snapshot integrity mismatch/);
    // A pack of the declared sizes whose bytes are not the ones its hash names.
    const [first, ...rest] = metadata.packs, wrong = gzipSync(new Uint8Array(first.byteLength));
    await writeFile(resolve(dist, "packs", `${first.sha256}.snapshot.gz`), wrong);
    await assert.rejects(read({ ...metadata, packs: [{ ...first, encodedByteLength: wrong.length }, ...rest] }), /^Error: snapshot integrity mismatch$/);
  } finally {
    globalThis.fetch = nodeFetch;
    await rm(directory, { recursive: true, force: true });
  }
});
