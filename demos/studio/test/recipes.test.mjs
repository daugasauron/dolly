import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { loadDollyfileGraph } from "../../../scripts/dollyfile-graph.mjs";

test("Studio declares the image build service and GPU", async () => {
  const graph = await loadDollyfileGraph(resolve(import.meta.dirname, "../../.."), "demos/studio/Dollyfile-dollyfile-studio");
  for (const name of ["build@0", "gpu@0"]) assert.ok(graph.root.hostRequirements.includes(name), name);
});
