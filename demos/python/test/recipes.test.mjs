import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { createDollyfileGraphLoader } from "../../../scripts/dollyfile-graph.mjs";

const projectDir = resolve(import.meta.dirname, "../../..");
const loadProjectGraph = createDollyfileGraphLoader(projectDir);
const requirements = (recipe, type) =>
  recipe.requirements.filter(item => item.type === type).map(({ name }) => name);

test("the python package builds CPython, libffi and pip with their licenses and exports", async () => {
  const graph = await loadProjectGraph("demos/python/Dollyfile-python");
  const recipe = graph.root;
  assert.equal(recipe.role, "package");
  for (const path of ["/usr/share/licenses/libffi/LICENSE", "/usr/share/licenses/cpython/LICENSE", "/etc/pip.conf"]) {
    assert.ok(recipe.files.some(file => file.path === path), path);
  }
  assert.ok(recipe.exports.some(({ type, name, details }) =>
    type === "ENV" && name === "PYTHONDONTWRITEBYTECODE" && details[0] === "1"));
  assert.equal(recipe.slops.some(({ command }) => command[0] === "python" && command.includes("-B")), false);
  for (const tool of ["ar", "cc", "c++", "make"]) assert.ok(requirements(recipe, "TOOL").includes(tool), tool);
  for (const header of ["libc", "http", "ffi", "ffitarget", "runtime", "zlib", "curl"]) {
    assert.ok(requirements(recipe, "HEADER").includes(header), header);
  }
  for (const key of ["TOOL:python", "TOOL:pip", "LIB:python", "HEADER:python", "HEADER:ffi", "FOLDER:python-stdlib"]) {
    assert.ok(graph.exporters.has(key), key);
  }
  assert.deepEqual(recipe.hostRequirements, ["dso@0", "http@0", "runtime@0", "sockets@0", "threads@0"]);
});

test("the data packages copy each root python-data-build installs, once, and python-data installs them all", async () => {
  const build = (await loadProjectGraph("demos/python/Dollyfile-python-data-build")).root;
  const roots = build.slops.filter(({ command }) => command.includes("/tmp/python-data/install"))
    .map(({ command }) => command[command.indexOf("/tmp/python-data/install") + 1]).sort();
  const packages = ["numpy", "python-dateutil", "pandas", "matplotlib", "seaborn"];
  const copied = [];
  for (const name of packages) {
    const recipe = (await loadProjectGraph(`demos/python/Dollyfile-${name}`)).root;
    assert.equal(recipe.role, "package");
    for (const { location, source } of recipe.artifacts.filter(({ operation }) => operation === "copy")) {
      assert.ok(location.endsWith("/demos/python/Dollyfile-python-data-build"), name);
      copied.push(source.slice("/opt/python-data/".length));
    }
  }
  assert.deepEqual(copied.sort(), roots);
  const data = (await loadProjectGraph("demos/python/Dollyfile-python-data")).root;
  assert.equal(data.artifacts.filter(({ operation }) => operation === "copy").length, 0);
  assert.deepEqual(data.installs.map(({ location }) => location.split("Dollyfile-")[1]).filter(name => packages.includes(name)).sort(),
    [...packages].sort());
});
