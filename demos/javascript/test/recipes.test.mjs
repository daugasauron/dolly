import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { createDollyfileGraphLoader } from "../../../scripts/dollyfile-graph.mjs";
import { siteReference } from "../../../src/static-asset.mjs";

const loadProjectGraph = createDollyfileGraphLoader(resolve(import.meta.dirname, "../../.."));
const requirements = (recipe, type) =>
  recipe.requirements.filter(item => item.type === type).map(({ name }) => name);

test("QuickJS and TypeScript declare their tools, headers and license; the package keeps the outputs", async () => {
  const build = (await loadProjectGraph("demos/javascript/Dollyfile-typescript-build")).root;
  assert.ok(build.files.some(({ path }) => path === "/usr/share/licenses/quickjs-ng/LICENSE"));
  for (const tool of ["ar", "cc", "qjs"]) assert.ok(requirements(build, "TOOL").includes(tool), tool);
  assert.deepEqual(requirements(build, "HEADER"), ["libc", "runtime", "http", "download", "quickjs-runner"]);
  assert.ok(build.sources.some(({ location }) => location === siteReference("dist/static/default/typescript-5.9.3.tgz")));
  const javascript = await loadProjectGraph("demos/javascript/Dollyfile-javascript");
  assert.equal(javascript.root.role, "package");
  for (const key of ["TOOL:qjs", "TOOL:janis", "TOOL:tsc", "LIB:dolly-js", "HEADER:quickjs-runner", "HEADER:quickjs"]) {
    assert.ok(javascript.exporters.has(key), key);
  }
  assert.deepEqual(javascript.root.hostRequirements, ["download@0", "http@0", "runtime@0"]);
});
