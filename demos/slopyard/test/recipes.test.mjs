import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { createDollyfileGraphLoader } from "../../../scripts/dollyfile-graph.mjs";

const loadProjectGraph = createDollyfileGraphLoader(resolve(import.meta.dirname, "../../.."));
const requirements = (module, type) =>
  module.requirements.filter(item => item.type === type).map(({ name }) => name);

test("the gamedev SDK declares its tools, headers and licenses", async () => {
  const sdk = (await loadProjectGraph("Dollyfile-gamedev-sdk")).modules.find(({ name }) => name === "gamedev-sdk");
  for (const path of ["/usr/share/licenses/raylib/LICENSE", "/usr/share/licenses/box3d/LICENSE"]) {
    assert.ok(sdk.files.some(file => file.path === path), path);
  }
  for (const tool of ["ar", "cc", "mkdir"]) assert.ok(requirements(sdk, "TOOL").includes(tool), tool);
  assert.deepEqual(requirements(sdk, "HEADER"), ["libc", "display"]);
  assert.deepEqual(sdk.exports.filter(({ type }) => type === "HEADER").map(({ name }) => name),
    ["raylib", "box3d", "dolly-raylib"]);
});

test("Slopyard declares GPU rendering and threads", async () => {
  const requirements = (await loadProjectGraph("Dollyfile-slopyard")).root.hostRequirements;
  for (const name of ["gpu@0", "threads@0"]) assert.ok(requirements.includes(name), name);
});
