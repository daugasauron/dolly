import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { createDollyfileGraphLoader } from "../../../scripts/dollyfile-graph.mjs";
import { siteReference } from "../../../src/static-asset.mjs";

const loadProjectGraph = createDollyfileGraphLoader(resolve(import.meta.dirname, "../../.."));
const installs = recipe => recipe.artifactTargets.filter(({ reference }) => reference.operation === "install").map(({ target }) => target.name);

test("quickjs, janis and typescript are packages, each built on the one before", async () => {
  const [quickjs, janis, typescript] = await Promise.all(["quickjs", "janis", "typescript"]
    .map(async name => (await loadProjectGraph(`demos/javascript/Dollyfile-${name}`)).root));
  for (const recipe of [quickjs, janis, typescript]) assert.equal(recipe.role, "package");
  assert.deepEqual([quickjs, janis, typescript].map(installs), [[], ["quickjs"], ["janis"]]);
  const exported = recipe => recipe.exports.map(({ type, name }) => `${type}:${name}`).sort();
  assert.deepEqual(exported(quickjs), ["HEADER:quickjs", "LIB:quickjs", "TOOL:qjs"]);
  assert.deepEqual(exported(janis), ["HEADER:quickjs-runner", "LIB:dolly-js", "TOOL:janis"]);
  assert.deepEqual(exported(typescript), ["FOLDER:typescript", "TOOL:tsc"]);
  assert.ok(quickjs.files.some(({ path }) => path === "/usr/share/licenses/quickjs-ng/LICENSE"));
  assert.ok(typescript.sources.some(({ location }) => location === siteReference("dist/static/default/typescript-5.9.3.tgz")));
  // The engine's own command reaches no host module but the runtime; Janis adds HTTP.
  assert.deepEqual(quickjs.hostRequirements, ["runtime@0"]);
  for (const recipe of [janis, typescript]) assert.deepEqual(recipe.hostRequirements, ["download@0", "http@0", "runtime@0"]);
});
