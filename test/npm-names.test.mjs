// Every npm package the release publishes has a name npm takes and no other package has.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { hostManifests } from "../host/manifests.mjs";
import { npmPackageName, npmRefusedWords } from "../scripts/npm-names.mjs";

test("published names avoid the words npm refuses and are distinct", async () => {
  const listed = (await readFile(new URL("../config/npm-images.txt", import.meta.url), "utf8")).split("\n").filter(Boolean);
  const names = [...hostManifests.map(({ name }) => npmPackageName("host", name)),
    ...listed.flatMap(image => ["image", "package"].map(kind => npmPackageName(kind, image)))];
  for (const name of names) {
    for (const word of Object.keys(npmRefusedWords)) assert.ok(!name.includes(word), `${name} has ${word}`);
  }
  assert.equal(new Set(names).size, names.length);
  assert.equal(npmPackageName("package", "libdolly-download"), "dolly-package-libdolly-save");
  assert.equal(npmPackageName("host", "download"), "dolly-host-save");
});
