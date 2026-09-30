import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { createDollyfileGraphLoader } from "../../../scripts/dollyfile-graph.mjs";

const loadProjectGraph = createDollyfileGraphLoader(resolve(import.meta.dirname, "../../.."));

test("QuickJS is selected only by Pi-bearing images", async () => {
  const defaultGraph = await loadProjectGraph();
  assert.equal(defaultGraph.modules.some(({ name }) => name === "quickjs"), false);
  assert.equal(defaultGraph.exporters.has("HEADER:quickjs-runner"), false);
  assert.equal(defaultGraph.exporters.has("LIB:dolly-js"), false);
  for (const image of ["pi", "bhop"]) {
    const graph = await loadProjectGraph(`Dollyfile-${image}`);
    const quickjs = graph.modules.find(({ name }) => name === "quickjs");
    const pi = graph.modules.find(({ name }) => name === "pi-build");
    assert.ok(quickjs, `${image} must include quickjs`);
    assert.ok(pi, `${image} must include pi`);
    for (const requirement of ["LIB:dolly-js", "HEADER:quickjs-runner"]) {
      const [type, name] = requirement.split(":");
      const edge = pi.dependencies.find((item) =>
        item.requirement.type === type && item.requirement.name === name);
      assert.ok(edge?.provider === quickjs, `${image}: ${requirement}`);
    }
  }
});

test("Pi is compiled from pinned source after an in-sandbox TypeScript layer", async () => {
  const graph = await loadProjectGraph("Dollyfile-pi");
  const typescript = graph.modules.find(({ name }) => name === "typescript");
  const pi = graph.modules.find(({ name }) => name === "pi-build");
  assert.ok(typescript);
  assert.ok(pi);
  assert.ok(typescript.sources.some(({ location }) =>
    location === "/static/default/typescript-5.9.3.tgz"));
  assert.ok(typescript.exports.some(({ type, name }) =>
    type === "TOOL" && name === "tsc"));
  assert.ok(pi.sources.some(({ location }) =>
    location === "/static/default/pi-source.tar"));
  assert.equal(pi.sources.some(({ location }) => location.includes("pi-package.tar")), false);
  assert.deepEqual(
    pi.slops.filter(({ command }) => command[0] === "tsc")
      .map(({ cwd }) => cwd),
    [
      "/usr/src/pi-source/packages/telemetry",
      "/usr/src/pi-source/packages/ai",
      "/usr/src/pi-source/packages/agent",
      "/usr/src/pi-source/packages/protocol",
      "/usr/src/pi-source/packages/client",
      "/usr/src/pi-source/packages/tui",
      "/usr/src/pi-source/packages/coding-agent",
    ],
  );
  assert.ok(pi.folders.some(({ path }) => path === "/usr/src/pi-source"));
  assert.ok(pi.exports.some(({ type, name, details }) =>
    type === "ENV" && name === "PI_PACKAGE_DIR" &&
    details[0] === "/usr/lib/node_modules/@earendil-works/pi-coding-agent"));
  assert.ok(pi.requirements.some(({ type, name }) => type === "TOOL" && name === "cc"));
  assert.ok(pi.requirements.some(({ type, name }) => type === "HEADER" && name === "libc"));
  assert.deepEqual(pi.requirements.filter(({ type }) => type === "HEADER").map(({ name }) => name),
    ["libc", "quickjs-runner"]);
  assert.ok(pi.files.some(({ path }) => path === "/usr/share/licenses/pi-source/LICENSE"));
  const runtime = graph.modules.find(({ name }) => name === "pi");
  assert.ok(runtime.exports.some(({ type, name, details }) =>
    type === "ENV" && name === "PI_SKIP_VERSION_CHECK" && details[0] === "1"));
  for (const tool of ["rg", "fd"]) assert.ok(graph.exporters.has(`TOOL:${tool}`), tool);
});
