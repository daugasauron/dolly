import assert from "node:assert/strict";
import test from "node:test";
import { DOLLY_IMAGES } from "../../../dist/dolly-images.mjs";
import { loadDollyfileGraph } from "../../../scripts/dollyfile-graph.mjs";
import { discoverImageDefinitions } from "../../../scripts/image-definitions.mjs";

const project = new URL("../../..", import.meta.url).pathname;
const shipped = {
  rg: ["/usr/bin/rg", "/usr/share/dolly/builds/ripgrep.lock", "/usr/share/licenses/ripgrep/LICENSE-MIT"],
  fd: ["/usr/bin/fd", "/usr/share/dolly/builds/fd.lock", "/usr/share/licenses/fd/LICENSE-MIT",
    "/usr/share/licenses/fd/LICENSE-APACHE"],
  pi: ["/usr/bin/pi", "/usr/share/licenses/pi-source/LICENSE",
    "/usr/share/licenses/pi-source/modelcontextprotocol-typescript-sdk.txt"],
};

test("images ship Pi's tools with their licenses exactly when their recipes export them", async () => {
  const definitions = await discoverImageDefinitions(project);
  for (const { image } of DOLLY_IMAGES) {
    const { DOLLY_SYSTEM_SNAPSHOT: { manifest } } = await import(
      new URL(`../../../dist/dolly-${image}-system-snapshot.mjs`, import.meta.url));
    const graph = await loadDollyfileGraph(project,
      definitions.find(definition => definition.image === image).filename);
    for (const [tool, paths] of Object.entries(shipped)) {
      for (const path of paths) {
        assert.equal(manifest.includes(path), graph.exporters.has(`TOOL:${tool}`), `${image}: ${path}`);
      }
    }
  }
});
