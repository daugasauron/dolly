// A published image over 512 MB, served in place of IMAGE's: its records plus
// LARGE_INPUT_PATH, 520 MiB of zeros in a pack of its own. files maps each
// URL path the page fetches (the metadata, the new pack) to what to
// serve; the image's other packs are the ones in dist/.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { metadataJson } from "../../scripts/image-directory.mjs";
import { decodeSnapshotRecords, encodeSnapshotRecords } from "../../src/snapshot-records.mjs";

export const LARGE_INPUT_PATH = "/usr/share/large-input";
export const LARGE_INPUT_BYTES = 520 * 1024 * 1024;
const digest = bytes => createHash("sha256").update(bytes).digest("hex");

export async function largePublishedInput(image) {
  const metadata = JSON.parse(await readFile(new URL(`../../dist/dolly-${image}-system-snapshot.json`, import.meta.url), "utf8"));
  const records = decodeSnapshotRecords(await readFile(new URL(`../../dist/dolly-${image}-system.snapshot`, import.meta.url)));
  const large = { kind: 2, data: new Uint8Array(LARGE_INPUT_BYTES) };
  const pack = encodeSnapshotRecords(new Map([[LARGE_INPUT_PATH, large]]));
  const encoded = gzipSync(pack, { level: 1 });
  const snapshot = encodeSnapshotRecords(records.set(LARGE_INPUT_PATH, large));
  const packed = { ...metadata, byteLength: snapshot.length, sha256: digest(snapshot),
    manifest: [...records.keys()].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right))),
    packs: [...metadata.packs, { sha256: digest(pack), byteLength: pack.length, encodedByteLength: encoded.length }] };
  return { sha256: packed.sha256, byteLength: packed.byteLength, files: new Map([
    [`/dist/dolly-${image}-system-snapshot.json`, { type: "application/json", body: metadataJson(packed) }],
    [`/dist/packs/${digest(pack)}.snapshot.gz`, { type: "application/gzip", body: encoded }],
  ]) };
}
