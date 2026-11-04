import assert from "node:assert/strict";
import test from "node:test";
import catalog from "../../../dist/dolly-images.json" with { type: "json" };

test("images retain no game SDK build trees", async () => {
  for (const { image } of catalog.images) {
    const { default: { manifest } } = await import(
      new URL(`../../../dist/dolly-${image}-system-snapshot.json`, import.meta.url), { with: { type: "json" } });
    assert.equal(manifest.some(path => /^\/usr\/src\/(raylib|box3d|dolly\/gamedev)\/build\//.test(path)), false, image);
  }
});
