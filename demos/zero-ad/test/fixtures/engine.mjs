// The engine the zero-ad-engine image built, written beside the other
// fixtures. Returns its path relative to the checkout.
import { readFile, rename, writeFile } from "node:fs/promises";
import { decodeSystemSnapshot, resolveSnapshotFile } from "../../../../scripts/system-snapshot-format.mjs";

const root = new URL("../../../../", import.meta.url);
export async function engineFixture() {
  const snapshot = decodeSystemSnapshot(await readFile(new URL("dist/dolly-zero-ad-engine-system.snapshot", root)));
  const path = "build/0ad/zero-ad-engine.wasm";
  await writeFile(new URL(`${path}.tmp`, root), resolveSnapshotFile(snapshot, "/opt/0ad/system/pyrogenesis"));
  await rename(new URL(`${path}.tmp`, root), new URL(path, root));
  return path;
}
