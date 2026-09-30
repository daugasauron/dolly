import assert from "node:assert/strict";
import test from "node:test";
import { DOLLY_IMAGES } from "../../../dist/dolly-images.mjs";

test("images retain no game SDK build trees", async () => {
  for (const { image } of DOLLY_IMAGES) {
    const { DOLLY_SYSTEM_SNAPSHOT: { manifest } } = await import(
      new URL(`../../../dist/dolly-${image}-system-snapshot.mjs`, import.meta.url));
    assert.equal(manifest.some(path => /^\/usr\/src\/(raylib|box3d|dolly\/gamedev)\/build\//.test(path)), false, image);
  }
});
