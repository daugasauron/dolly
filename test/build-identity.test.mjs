import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { buildIdentities, imageBuildInputs } from "../scripts/write-build-id.mjs";

test("kernel edits preserve image compatibility; seed, loader and ABI edits invalidate it", async t => {
  const directory = await mkdtemp(resolve(tmpdir(), "dolly-build-identity-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const name of ["dolly.wasm", ...imageBuildInputs]) await writeFile(resolve(directory, name), name);
  const identify = () => buildIdentities(resolve(directory, "dolly.wasm"), resolve(directory, "dolly.data"));
  const original = await identify();
  assert.deepEqual(await identify(), original);
  await writeFile(resolve(directory, "dolly.wasm"), "updated kernel");
  const kernel = await identify();
  assert.notEqual(kernel.buildId, original.buildId);
  assert.equal(kernel.imageBuildId, original.imageBuildId);
  for (const name of imageBuildInputs) {
    await writeFile(resolve(directory, name), `updated ${name}`);
    const changed = await identify();
    assert.notEqual(changed.buildId, kernel.buildId, name);
    assert.notEqual(changed.imageBuildId, kernel.imageBuildId, name);
    await writeFile(resolve(directory, name), name);
    assert.deepEqual(await identify(), kernel);
  }
  await rm(resolve(directory, "dolly-seed.mjs"));
  await assert.rejects(identify(), { code: "ENOENT" });
});
