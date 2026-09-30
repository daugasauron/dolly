import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { loadDollyfileGraph } from "../../../scripts/dollyfile-graph.mjs";

test("the Neovim image opens the editor and keeps only its runtime", async () => {
  const graph = await loadDollyfileGraph(resolve(import.meta.dirname, "../../.."), "Dollyfile-neovim");
  assert.deepEqual(graph.root.entry, ["/bin/foreground", "-i", "/bin/slop", "/etc/dolly/init.slop"]);
  const startup = graph.root.files.find(file => file.path === "/etc/dolly/init.slop").body;
  assert.match(startup, /foreground \/usr\/bin\/nvim \/usr\/share\/nvim\/welcome.txt/);
  assert.match(startup, /foreground -i \/bin\/slop/);
  assert.ok(graph.root.files.some(file => file.path === "/usr/share/nvim/welcome.txt"));
  assert.equal(graph.exporters.has("TOOL:nvim"), true);
  assert.equal(graph.exporters.has("TOOL:cmake"), false);
  assert.equal(graph.artifacts.filter(artifact => artifact.copy)
    .some(artifact => /\/tmp\/|\/include\/|cmake/.test(artifact.source)), false);
});
