import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { createDollyfileGraphLoader, recipeRecords } from "../../../scripts/dollyfile-graph.mjs";
import { siteReference } from "../../../src/static-asset.mjs";

const loadProjectGraph = createDollyfileGraphLoader(resolve(import.meta.dirname, "../../.."));

test("QuickJS reaches only Pi-bearing images, through the janis package", async () => {
  const defaultGraph = await loadProjectGraph();
  assert.equal(recipeRecords(defaultGraph).some(({ name }) => name === "janis"), false);
  assert.equal(defaultGraph.exporters.has("HEADER:quickjs-runner"), false);
  assert.equal(defaultGraph.exporters.has("LIB:dolly-js"), false);
  for (const [demo, image] of [["pi", "pi-agent"], ["bhop", "bhop"]]) {
    const graph = await loadProjectGraph(`demos/${demo}/Dollyfile-${image}`);
    const names = recipeRecords(graph).map(({ name }) => name);
    for (const name of ["quickjs", "janis", "pi", "pi-build"]) assert.ok(names.includes(name), `${image}: ${name}`);
    const build = graph.records.find(({ name }) => name === "pi-build");
    for (const [requirement, provider] of [["LIB:quickjs", "quickjs"], ["LIB:dolly-js", "janis"], ["HEADER:quickjs-runner", "janis"]]) {
      const [type, name] = requirement.split(":");
      const edge = build.dependencies.find((item) => item.requirement.type === type && item.requirement.name === name);
      assert.equal(edge?.provider.name, provider, `${image}: ${requirement}`);
    }
  }
});

test("Pi is compiled from pinned source by the typescript package", async () => {
  const graph = await loadProjectGraph("demos/pi/Dollyfile-pi-agent");
  const typescript = graph.records.find(({ name }) => name === "typescript");
  const pi = graph.records.find(({ name }) => name === "pi-build");
  assert.ok(typescript.sources.some(({ location }) =>
    location === siteReference("dist/static/default/typescript-5.9.3.tgz")));
  assert.ok(typescript.exports.some(({ type, name }) => type === "TOOL" && name === "tsc"));
  assert.ok(pi.sources.some(({ location }) =>
    location === siteReference("dist/static/default/pi-source.tar")));
  assert.equal(pi.sources.some(({ location }) => location.includes("pi-package.tar")), false);
  assert.deepEqual(
    pi.slops.filter(({ command }) => command[0] === "tsc").map(({ cwd }) => cwd),
    ["chord", "telemetry", "ai", "agent", "codemode", "mcp", "tui", "coding-agent"]
      .map(name => `/usr/src/pi-source/packages/${name}`),
  );
  assert.ok(pi.folders.some(({ path }) => path === "/usr/src/pi-source"));
  assert.ok(pi.exports.some(({ type, name, details }) =>
    type === "ENV" && name === "PI_PACKAGE_DIR" && details[0] === "/usr/lib/node_modules/@earendil-works/pi-coding-agent"));
  assert.ok(pi.requirements.some(({ type, name }) => type === "TOOL" && name === "cc"));
  assert.ok(pi.folders.some(({ path }) => path === "/usr/share/licenses/pi-source"));
  const agent = graph.records.find(({ name }) => name === "pi");
  assert.equal(agent.role, "package");
  assert.ok(agent.exports.some(({ type, name, details }) =>
    type === "ENV" && name === "PI_SKIP_VERSION_CHECK" && details[0] === "1"));
  for (const tool of ["rg", "fd", "pi"]) assert.ok(graph.exporters.has(`TOOL:${tool}`), tool);
  assert.deepEqual(agent.hostRequirements, ["download@0", "http@0", "runtime@0", "threads@0"]);
});
