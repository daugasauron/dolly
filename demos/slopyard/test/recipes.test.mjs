import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { createDollyfileGraphLoader } from "../../../scripts/dollyfile-graph.mjs";

const loadProjectGraph = createDollyfileGraphLoader(resolve(import.meta.dirname, "../../.."));
const requirements = (recipe, type) =>
  recipe.requirements.filter(item => item.type === type).map(({ name }) => name);

test("the gamedev SDK declares its tools, headers and licenses", async () => {
  const sdk = (await loadProjectGraph("demos/slopyard/Dollyfile-gamedev-sdk")).root;
  for (const path of ["/usr/share/licenses/raylib/LICENSE", "/usr/share/licenses/box3d/LICENSE", "/usr/include/raymath.h"]) {
    assert.ok(sdk.files.some(file => file.path === path), path);
  }
  for (const tool of ["ar", "cc", "mkdir"]) assert.ok(requirements(sdk, "TOOL").includes(tool), tool);
  assert.deepEqual(requirements(sdk, "HEADER"), ["libc", "display"]);
  assert.deepEqual(sdk.exports.filter(({ type }) => type === "HEADER").map(({ name }) => name),
    ["raylib", "box3d", "dolly-raylib"]);
});

test("Slopyard declares the host modules its game uses", async () => {
  const requirements = (await loadProjectGraph("demos/slopyard/Dollyfile-slopyard")).root.hostRequirements;
  for (const name of ["display@0", "gpu@0", "threads@0"]) assert.ok(requirements.includes(name), name);
});
