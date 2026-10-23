import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { createDollyfileGraphLoader, recipeRecords } from "../../../scripts/dollyfile-graph.mjs";
import { siteReference } from "../../../src/static-asset.mjs";

const projectDir = resolve(import.meta.dirname, "../../..");
const loadProjectGraph = createDollyfileGraphLoader(projectDir);

test("QuickJS reaches only Pi-bearing images, through the janis package", async () => {
  const defaultGraph = await loadProjectGraph();
  assert.equal(recipeRecords(defaultGraph).some(({ name }) => name === "janis"), false);
  assert.equal(defaultGraph.exporters.has("HEADER:quickjs-runner"), false);
  assert.equal(defaultGraph.exporters.has("LIB:dolly-js"), false);
  for (const [demo, image] of [["pi", "pi-agent"], ["bhop", "bhop"]]) {
    const graph = await loadProjectGraph(`demos/${demo}/Dollyfile-${image}`);
    const names = recipeRecords(graph).map(({ name }) => name);
    for (const name of ["quickjs", "janis", "janis-install", "pi"]) assert.ok(names.includes(name), `${image}: ${name}`);
    const pi = graph.records.find(({ name }) => name === "pi");
    for (const [requirement, provider] of [["LIB:quickjs", "quickjs"], ["LIB:dolly-js", "janis"], ["HEADER:quickjs-runner", "janis"]]) {
      const [type, name] = requirement.split(":");
      const edge = pi.dependencies.find((item) => item.requirement.type === type && item.requirement.name === name);
      assert.equal(edge?.provider.name, provider, `${image}: ${requirement}`);
    }
  }
});

test("Pi is installed by janis-install from the npm tree package-lock.json pins", async () => {
  const graph = await loadProjectGraph("demos/pi/Dollyfile-pi-agent");
  const pi = graph.records.find(({ name }) => name === "pi");
  const { dependencies } = JSON.parse(await readFile(resolve(projectDir, "package.json"), "utf8"));
  assert.equal(pi.role, "package");
  assert.ok(pi.sources.some(({ location }) => location === siteReference("dist/static/default/pi-npm.tar")));
  assert.ok(pi.slops.some(({ command }) => command.join(" ") ===
    `janis-install --registry /tmp/pi-npm @earendil-works/pi-coding-agent@${dependencies["@earendil-works/pi-coding-agent"]}`));
  assert.ok(pi.exports.some(({ type, name, details }) =>
    type === "ENV" && name === "PI_PACKAGE_DIR" && details[0] === "/usr/lib/node_modules/@earendil-works/pi-coding-agent"));
  assert.ok(pi.exports.some(({ type, name, details }) =>
    type === "ENV" && name === "PI_SKIP_VERSION_CHECK" && details[0] === "1"));
  for (const tool of ["rg", "fd", "pi", "pi-key"]) assert.ok(graph.exporters.has(`TOOL:${tool}`), tool);
  assert.deepEqual(pi.hostRequirements, ["download@0", "http@0", "runtime@0", "threads@0"]);
});
