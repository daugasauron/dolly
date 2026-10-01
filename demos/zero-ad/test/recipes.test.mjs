import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { loadDollyfileGraph } from "../../../scripts/dollyfile-graph.mjs";

test("0 A.D. declares graphics and playback without requiring threads", async () => {
  const graph = await loadDollyfileGraph(resolve(import.meta.dirname, "../../.."), "demos/zero-ad/Dollyfile-zero-ad");
  for (const name of ["gpu@0", "audio@0"]) assert.ok(graph.root.hostRequirements.includes(name), name);
  assert.ok(!graph.root.hostRequirements.includes("threads@0"));
});
