import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { createDollyfileGraphLoader, recipeRecords } from "../../../scripts/dollyfile-graph.mjs";
import { discoverImageDefinitions } from "../../../scripts/image-definitions.mjs";

const project = resolve(import.meta.dirname, "../../..");
const loadGraph = createDollyfileGraphLoader(project);

test("only Rust build images carry the Rust SDK, and they carry no display stack", async () => {
  for (const definition of await discoverImageDefinitions(project)) {
    const graph = await loadGraph(definition.filename);
    if (graph.root.hostRequirements.includes("display@0") || definition.parsed.role === "package") continue;
    const names = recipeRecords(graph).map(record => record.name);
    const rust = /^demos\/(rust|codex)\//.test(definition.filename);
    assert.equal(names.includes("rust-sdk"), rust, definition.image);
    if (rust) assert.equal(names.some(name => ["git", "ghostty", "startup-default"].includes(name)), false, definition.image);
  }
});
