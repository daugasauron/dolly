import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { createDollyfileGraphLoader } from "../../../scripts/dollyfile-graph.mjs";

const projectDir = resolve(import.meta.dirname, "../../..");
const loadProjectGraph = createDollyfileGraphLoader(projectDir);
const requirements = (module, type) =>
  module.requirements.filter(item => item.type === type).map(({ name }) => name);

test("CPython, libffi and Bonnie declare their tools, headers, licenses and exports", async () => {
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
  assert.deepEqual(requirements(module("cpython"), "HEADER"), ["libc", "ffi", "ffitarget", "runtime", "zlib"]);
  assert.deepEqual(requirements(module("bonnie"), "HEADER"), ["curl", "libc", "runtime"]);
  assert.deepEqual(module("libffi").exports.filter(({ type }) => type === "HEADER").map(({ name }) => name),
    ["ffi", "ffitarget"]);
});

test("Bonnie is a retained two-file command with transactional graph helpers", async () => {
  const graph = await loadProjectGraph("demos/python/Dollyfile-python");
  const bonnie = graph.modules.find(({ name }) => name === "bonnie");
  assert.deepEqual(
    bonnie.sources.map(({ location, destination }) => [location, destination]),
    [
      ["https://daugasauron.com/dist/static/python/commands/bonnie.c", "/tmp/bonnie/bonnie.c"],
      ["https://daugasauron.com/dist/static/python/runtimes/bonnie.py", "/usr/lib/bonnie/bonnie.py"],
    ],
  );
  assert.ok(bonnie.files.some(({ path, body }) =>
    path === "/usr/lib/bonnie/bonnie.py" && body === null));

  const helperPath = resolve(projectDir, "demos/python/bonnie.py");
  const temporary = await mkdtemp(resolve(tmpdir(), "dolly-bonnie-helper-"));
  try {
    const combined = resolve(temporary, "combined.txt");
    execFileSync("python3", [
      helperPath,
      "combine",
      "Requests[socks]>=2",
      "requests<3,!=2.5",
      combined,
    ]);
    const requirement = await readFile(combined, "utf8");
    assert.match(requirement, /^requests\[socks\]/);
    assert.match(requirement, />=2/);
    assert.match(requirement, /<3/);
    assert.match(requirement, /!=2\.5/);
    const metadata = resolve(temporary, "metadata.json");
    const selected = resolve(temporary, "selected.txt");
    const releases = { "1.0": [{ packagetype: "bdist_wheel", filename: "Demo_Project-1.0-py3-none-any.whl" }] };
    await writeFile(metadata, JSON.stringify({ info: { name: "Demo_Project" }, releases }));
    execFileSync("python3", [helperPath, "select", "demo.project", metadata, selected]);
    assert.match(await readFile(selected, "utf8"), /^name demo-project$/m);
    await writeFile(metadata, JSON.stringify({ info: { name: "other" }, releases }));
    assert.throws(() => execFileSync("python3", [helperPath, "select", "demo-project", metadata, selected],
      { stdio: "pipe" }), /PyPI returned project 'other'/);
    const applicable = resolve(temporary, "applicable.txt");
    execFileSync("python3", [helperPath, "applicable", 'Demo[b,a]>=1; python_version >= "3"', applicable]);
    assert.equal(await readFile(applicable, "utf8"), "Demo[a,b]>=1\n");
    execFileSync("python3", [helperPath, "applicable", 'demo; python_version < "3"', applicable]);
    assert.equal(await readFile(applicable, "utf8"), "");
    execFileSync("python3", ["-B", resolve(projectDir, "demos/python/test/fixtures/bonnie-policy.py"), helperPath, temporary]);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
