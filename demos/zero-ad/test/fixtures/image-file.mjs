// Programs the zero-ad image chain built inside Dolly, written as fixture files.
import { readFile, rename, writeFile } from "node:fs/promises";
import { decodeSystemSnapshot, resolveSnapshotFile } from "../../../../scripts/system-snapshot-format.mjs";

const root = new URL("../../../../", import.meta.url);
// Returns the fixture's path relative to the checkout.
export async function imageFile(image, path, name) {
  const snapshot = decodeSystemSnapshot(await readFile(new URL(`dist/dolly-${image}-system.snapshot`, root)));
  const output = `build/0ad/${name}`;
  await writeFile(new URL(`${output}.tmp`, root), resolveSnapshotFile(snapshot, path));
  await rename(new URL(`${output}.tmp`, root), new URL(output, root));
  return output;
}
export const engineFixture = () => imageFile("zero-ad-engine", "/opt/0ad/system/pyrogenesis", "zero-ad-engine.wasm");
