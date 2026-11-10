import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { loadDollyfileGraph } from "../../../scripts/dollyfile-graph.mjs";

test("Studio declares the image build service", async () => {
  const graph = await loadDollyfileGraph(resolve(import.meta.dirname, "../../.."), "demos/studio/Dollyfile-dollyfile-studio");
  assert.ok(graph.root.hostRequirements.includes("build@0"));
});
