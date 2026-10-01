import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { createDollyfileGraphLoader } from "../../../scripts/dollyfile-graph.mjs";

const loadProjectGraph = createDollyfileGraphLoader(resolve(import.meta.dirname, "../../.."));
const requirements = (module, type) =>
  module.requirements.filter(item => item.type === type).map(({ name }) => name);

test("QuickJS and TypeScript declare their tools, headers and license", async () => {
  const graph = await loadProjectGraph("demos/javascript/Dollyfile-typescript-build");
  const quickjs = graph.modules.find(({ name }) => name === "quickjs");
  const typescript = graph.modules.find(({ name }) => name === "typescript");
  assert.ok(quickjs.files.some(({ path }) => path === "/usr/share/licenses/quickjs-ng/LICENSE"));
  for (const tool of ["ar", "cc"]) assert.ok(requirements(quickjs, "TOOL").includes(tool), tool);
  assert.ok(requirements(typescript, "TOOL").includes("cc"));
  assert.deepEqual(requirements(quickjs, "HEADER"), ["libc", "runtime", "http", "download"]);
  assert.deepEqual(quickjs.exports.filter(({ type }) => type === "HEADER").map(({ name }) => name),
    ["quickjs-runner", "quickjs"]);
  assert.ok(typescript.sources.some(({ location }) => location === "https://daugasauron.com/dist/static/default/typescript-5.9.3.tgz"));
  assert.ok(typescript.exports.some(({ type, name }) => type === "TOOL" && name === "tsc"));
});
