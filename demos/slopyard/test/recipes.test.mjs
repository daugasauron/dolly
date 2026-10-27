import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { createDollyfileGraphLoader } from "../../../scripts/dollyfile-graph.mjs";

const loadProjectGraph = createDollyfileGraphLoader(resolve(import.meta.dirname, "../../.."));
const requirements = (recipe, type) =>
  recipe.requirements.filter(item => item.type === type).map(({ name }) => name);

test("raylib and Box3D build their own packages, and the gamedev SDK installs them", async () => {
  const load = async name => (await loadProjectGraph(`demos/slopyard/Dollyfile-${name}`)).root;
  const [raylib, box3d, sdk] = await Promise.all(["raylib", "box3d", "gamedev-sdk"].map(load));
  for (const [recipe, paths] of [[raylib, ["/usr/share/licenses/raylib/LICENSE", "/usr/include/raymath.h"]], [box3d, ["/usr/share/licenses/box3d/LICENSE"]]]) {
    for (const path of paths) assert.ok(recipe.files.some(file => file.path === path), path);
    for (const tool of ["ar", "cc", "make"]) assert.ok(requirements(recipe, "TOOL").includes(tool), tool);
  }
  assert.deepEqual(raylib.exports.filter(({ type }) => type === "HEADER").map(({ name }) => name), ["raylib", "dolly-raylib"]);
  assert.deepEqual(box3d.exports.filter(({ type }) => type === "HEADER").map(({ name }) => name), ["box3d"]);
  for (const name of ["raylib", "box3d"]) assert.ok(sdk.installs.some(({ image }) => image === name), name);
});

test("Slopyard declares the host modules its game uses", async () => {
  const requirements = (await loadProjectGraph("demos/slopyard/Dollyfile-slopyard")).root.hostRequirements;
  for (const name of ["display@0", "input@0", "gpu@0", "threads@0"]) assert.ok(requirements.includes(name), name);
});
