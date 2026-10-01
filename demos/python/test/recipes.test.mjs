import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { createDollyfileGraphLoader } from "../../../scripts/dollyfile-graph.mjs";

const projectDir = resolve(import.meta.dirname, "../../..");
const loadProjectGraph = createDollyfileGraphLoader(projectDir);
const requirements = (module, type) =>
  module.requirements.filter(item => item.type === type).map(({ name }) => name);

test("CPython, libffi and pip declare their tools, headers, licenses and exports", async () => {
  const graph = await loadProjectGraph("demos/python/Dollyfile-python");
  const module = name => graph.modules.find(item => item.name === name);
  assert.ok(module("libffi").files.some(({ path }) => path === "/usr/share/licenses/libffi/LICENSE"));
  assert.ok(module("cpython").files.some(({ path }) => path === "/usr/share/licenses/cpython/LICENSE"));
  assert.ok(module("cpython").exports.some(({ type, name, details }) =>
    type === "ENV" && name === "PYTHONDONTWRITEBYTECODE" && details[0] === "1"));
  assert.equal(module("cpython").slops.some(({ command }) => command[0] === "python" && command.includes("-B")), false);
  for (const tool of ["ar", "cc"]) assert.ok(requirements(module("libffi"), "TOOL").includes(tool), tool);
  assert.deepEqual(requirements(module("python"), "HEADER"), ["curl", "libc", "runtime", "zlib"]);
  assert.deepEqual(requirements(module("libffi"), "HEADER"), ["libc"]);
  assert.deepEqual(requirements(module("cpython"), "HEADER"), ["libc", "http", "ffi", "ffitarget", "runtime", "zlib"]);
  assert.deepEqual(module("libffi").exports.filter(({ type }) => type === "HEADER").map(({ name }) => name),
    ["ffi", "ffitarget"]);
});
