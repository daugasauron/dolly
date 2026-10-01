import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";
import test from "node:test";

import {
  loadDollyfileGraph, createDollyfileGraphLoader,
} from "../scripts/dollyfile-graph.mjs";
import { discoverImageDefinitions } from "../scripts/image-definitions.mjs";
import { recipeFiles } from "../scripts/recipe-files.mjs";
import { renderDollyfilePage } from "../scripts/render-dollyfile-view.mjs";
import { inspectDollyfile } from "../src/dollyfile-view.mjs";

const projectDir = resolve(import.meta.dirname, "..");
const loadProjectGraph = createDollyfileGraphLoader(projectDir);

test("module-owned command sources have no divergent standalone copies", async () => {
  const commands = new Set(await readdir(resolve(projectDir, "src/commands")));
  for (const [location, path] of await recipeFiles(projectDir)) {
    if (!path.endsWith(".dm")) continue;
    const module = inspectDollyfile(await readFile(resolve(projectDir, path), "utf8"), location);
    for (const file of module.files) {
      if (!file.path.endsWith(".c")) continue;
      assert.ok(!commands.has(basename(file.path)), `${path}: ${file.path} duplicates src/commands/${basename(file.path)}`);
    }
  }
});

function uniqueModules(graphs) {
  const modules = new Map();
  for (const graph of graphs) {
    for (const module of graph.modules) modules.set(module.name, module);
  }
  return modules;
}
const coreModules = async () => uniqueModules([await loadProjectGraph()]);
async function catalogModules() {
  const definitions = await discoverImageDefinitions(projectDir);
  return uniqueModules(await Promise.all(definitions.map(({ filename }) => loadProjectGraph(filename))));
}

function digest(source) {
  return createHash("sha256").update(source).digest("hex");
}


test("the linked viewer preserves table alignment whitespace", async () => {
  const graph = await loadProjectGraph();
  const page = renderDollyfilePage(graph.root, graph);
  for (const use of graph.root.uses) {
    const sourceLine = graph.root.source.split("\n")[use.line - 1];
    const gap = sourceLine.slice(
      sourceLine.indexOf(use.location) + use.location.length,
      sourceLine.indexOf(use.sha256),
    );
    assert.ok(page.includes(`</a>${gap}${use.sha256}`), use.location);
  }
  const bootstrap = graph.modules.find(({ name }) => name === "bootstrap");
  const bootstrapPage = renderDollyfilePage(bootstrap, graph);
  for (const source of bootstrap.sources) {
    const sourceLine = bootstrap.source.split("\n")[source.line - 1];
    const after = sourceLine.slice(sourceLine.indexOf(source.location) + source.location.length);
    assert.ok(bootstrapPage.includes(`>${source.location}</a>${after}`), source.location);
  }
  for (const exported of bootstrap.exports.filter(({ sha256 }) => sha256)) {
    const sourceLine = bootstrap.source.split("\n")[exported.line - 1];
    const gap = sourceLine.slice(
      sourceLine.indexOf(exported.name) + exported.name.length,
      sourceLine.indexOf(exported.sha256),
    );
    assert.ok(bootstrapPage.includes(`</span>${gap}${exported.sha256}`), exported.name);
  }
});

test("an aggregate imports its requirements into its child scope", async () => {
  const fixture = await mkdtemp(resolve(tmpdir(), "dolly-imported-requirement-"));
  try {
    await mkdir(resolve(fixture, "modules"));
    const seed = "DOLLY 5\nMODULE seed\n\nEXPORTS TOOL cc\n";
    const child = `DOLLY 5
MODULE child

REQUIRES TOOL cc
EXPORTS TOOL result
`;
    const aggregate = `DOLLY 5
MODULE aggregate

REQUIRES TOOL cc
USE https://daugasauron.com/modules/child.dm ${digest(child)}

EXPORTS TOOL result
`;
    await Promise.all([
      writeFile(resolve(fixture, "modules/seed.dm"), seed),
      writeFile(resolve(fixture, "modules/child.dm"), child),
      writeFile(resolve(fixture, "modules/aggregate.dm"), aggregate),
    ]);
    await writeFile(resolve(fixture, "Dollyfile"), `DOLLY 5
IMAGE default

USE https://daugasauron.com/modules/seed.dm      ${digest(seed)}
USE https://daugasauron.com/modules/aggregate.dm ${digest(aggregate)}

ENTRY /bin/result
`);
    const graph = await loadDollyfileGraph(fixture);
    const nested = graph.modules.find(({ name }) => name === "child");
    assert.equal(nested.dependencies[0].provider.name, "seed");
    assert.equal(graph.exporters.get("TOOL:result").module.name, "aggregate");
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("aggregate filesystem exports use their declared paths without provider checks", async () => {
  const fixture = await mkdtemp(resolve(tmpdir(), "dolly-explicit-export-"));
  try {
    await mkdir(resolve(fixture, "modules"));
    const child = "DOLLY 5\nMODULE child\n\nEXPORTS LIB z /usr/lib/libz.a\n";
    const aggregate = `DOLLY 5
MODULE aggregate

USE https://daugasauron.com/modules/child.dm ${digest(child)}
EXPORTS LIB z /usr/lib/replacement.a
`;
    await Promise.all([
      writeFile(resolve(fixture, "modules/child.dm"), child),
      writeFile(resolve(fixture, "modules/aggregate.dm"), aggregate),
    ]);
    await writeFile(resolve(fixture, "Dollyfile"), `DOLLY 5
IMAGE default

USE https://daugasauron.com/modules/aggregate.dm ${digest(aggregate)}
ENTRY /bin/result
`);
    const graph = await loadDollyfileGraph(fixture);
    assert.deepEqual(graph.exporters.get("LIB:z").exported.details, ["/usr/lib/replacement.a"]);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("FILE consumes four-space-indented content and stops at the first other line", () => {
  const parsed = inspectDollyfile(`DOLLY 5
MODULE inline
REQUIRES TOOL printf

FILE /tmp/example.txt
    alpha
      beta
    
SLOP printf done
`, "inline.dm");
  assert.equal(parsed.files.length, 1);
  assert.equal(parsed.files[0].path, "/tmp/example.txt");
  assert.equal(parsed.files[0].body, "alpha\n  beta\n\n");
  assert.deepEqual(parsed.slops[0].command, ["printf", "done"]);
});

test("bootstrap exports exact compiler tools and first-class headers", async () => {
  const graph = await loadProjectGraph();
  const bootstrap = graph.modules.find(({ name }) => name === "bootstrap");
  assert.equal(bootstrap.name, "bootstrap");
  assert.equal(bootstrap.requirements.length, 0);
  assert.equal(bootstrap.slops.length, 0);
  assert.deepEqual(
    bootstrap.exports.filter(({ type }) => type === "HEADER").map(({ name }) => name),
    ["libc", "toolchain", "runtime", "process", "http", "http-abi", "display", "display-abi", "download", "download-abi",
      "host", "host-abi", "gpu", "gpu-abi", "audio", "audio-abi", "upload", "upload-abi", "threads", "threads-abi"],
  );
  const tools = bootstrap.exports.filter(({ type }) => type === "TOOL");
  assert.deepEqual(
    tools.map(({ name }) => name),
    ["cc", "c++", "ld", "ar", "dollyfile"],
  );
  assert.equal(
    tools.some(({ sha256 }) => sha256),
    false,
    "bootstrap tools are process-image outputs identified by the runtime build, not fetched blobs",
  );
  assert.deepEqual(
    bootstrap.exports.filter(({ type }) => type === "ENV").map(({ name }) => name),
    ["CC", "AR", "PATH"],
  );
  // Slop is built before any SLOP step can run, so its module uses none.
  const slop = graph.modules.find(({ name }) => name === "slop");
  assert.equal(slop.slops.length, 0);
  assert.deepEqual(slop.exports.map(({ type, name }) => `${type} ${name}`), ["TOOL slop", "ENV SHELL"]);
  assert.ok(bootstrap.exports.some(({ type, name, details }) =>
    type === "LIB" && name === "compiler-rt" &&
    details[0] === "/usr/lib/libclang_rt.builtins.a"));

  const cpp = graph.modules.find(({ name }) => name === "cpp");
  assert.ok(cpp.requirements.some(({ type, name }) =>
    type === "FOLDER" && name === "process-sdk"));
  assert.ok(cpp.exports.some(({ type, name, details }) =>
    type === "HEADER" && name === "cpp" && details[0] === "/usr/include/c++/v1"));
  assert.deepEqual(
    cpp.exports.filter(({ type }) => type === "LIB").map(({ name }) => name),
    ["c++", "c++abi"],
  );
  assert.ok(cpp.exports.some(({ type, name, details }) =>
    type === "ENV" && name === "CXX" && details[0] === "c++"));

});

test("small Dolly-owned command sources are inline", async () => {
  const graph = await loadProjectGraph();
  const core = graph.modules.find(({ name }) => name === "core-tools");
  const download = graph.modules.find(({ name }) => name === "download");
  const tar = graph.modules.find(({ name }) => name === "tar");
  assert.equal(core.sources.length, 0);
  assert.match(core.files.find(({ path }) => path.endsWith("/foreground.c")).body,
    /dolly_spawn_foreground/);
  assert.equal(core.files.some(({ path }) => path.endsWith("/download.c")), false);
  assert.match(download.files.find(({ path }) => path.endsWith("/download.c")).body,
    /dolly_download_file/);
  assert.equal(tar.sources.length, 0);
  assert.match(tar.files.find(({ path }) => path.endsWith("/tar.c")).body, /BLOCK_SIZE = 512/);
});


test("redistributed upstream modules retain their licenses", async () => {
  const modules = await coreModules();
  const expected = new Map([
    ["make", ["/usr/share/licenses/make/COPYING"]],
    ["cpp", [
      "/usr/share/licenses/libcxx/LICENSE",
      "/usr/share/licenses/libcxxabi/LICENSE",
    ]],
    ["ninja", ["/usr/share/licenses/samurai/LICENSE"]],
    ["zlib", ["/usr/share/licenses/zlib/LICENSE"]],
    ["curl", ["/usr/share/licenses/curl/COPYING"]],
    ["git", ["/usr/share/licenses/git/COPYING"]],
    ["zig", ["/usr/share/licenses/zig/LICENSE"]],
    ["ghostty", [
      "/usr/share/licenses/ghostty/LICENSE",
      "/usr/share/licenses/uucode/LICENSE.md",
    ]],
    ["awk", ["/usr/share/licenses/awk/LICENSE"]],
    ["sbase", ["/usr/share/licenses/sbase/LICENSE"]],
  ]);
  for (const [name, paths] of expected) {
    const retained = new Set(modules.get(name).files.map(({ path }) => path));
    for (const path of paths) assert.ok(retained.has(path), `${name} does not retain ${path}`);
  }
});

test("production exports exclude build-only checks and unconsumed archives", async () => {
  const modules = await coreModules();
  assert.equal(modules.get("ghostty").exports.some(
    ({ type, name }) => type === "TOOL" && name === "ghostty-vt"), false);
  assert.equal(modules.get("ghostty").sources.some(
    ({ location }) => location.endsWith("/ghostty/check.c")), false);
  assert.equal(modules.get("git").exports.some(
    ({ type, name }) => type === "LIB" && name === "git"), false);
});

test("non-temporary SOURCE inputs are retained or explicitly removed by their module", async () => {
  const modules = await catalogModules();
  const contains = (root, path) => path === root || path.startsWith(`${root}/`);
  for (const module of modules.values()) {
    const retained = [
      ...module.files.map(({ path }) => path).filter((path) => !path.startsWith("/tmp/")),
      ...module.folders.map(({ path }) => path),
      ...module.exports.flatMap(({ type, details }) =>
        type !== "ENV" && type !== "TOOL" && details[0] ? [details[0]] : []),
    ];
    const tools = new Set(
      module.exports.filter(({ type }) => type === "TOOL").map(({ name }) => name),
    );
    const cleanup = (module.slops.at(-1)?.command[0] === "rm"
      ? module.slops.at(-1).command
      : []).filter((word) => word.startsWith("/"));
    for (const source of module.sources.filter(
      ({ destination }) => !destination.startsWith("/tmp/"),
    )) {
      const tool = source.destination.split("/").at(-1);
      const exportedTool = tools.has(tool) &&
        [`/bin/${tool}`, `/usr/bin/${tool}`].includes(source.destination);
      assert.ok(
        retained.some((root) => contains(root, source.destination)) ||
        cleanup.some((root) => contains(root, source.destination)) ||
        exportedTool,
        `${module.name} neither retains nor removes ${source.destination}`,
      );
    }
  }
});


test("build modules declare tools used by their own recipes", async () => {
  const modules = await coreModules();
  const module = (name) => modules.get(name);
  assert.deepEqual(
    module("zlib").requirements.map(({ type, name }) => `${type} ${name}`),
    ["HEADER libc", "TOOL ar", "TOOL cc", "TOOL make", "TOOL rm", "TOOL tar"],
  );
  for (const tool of ["cc", "mkdir", "rm", "tar"]) {
    assert.ok(
      module("make").requirements.some(({ type, name }) => type === "TOOL" && name === tool),
      tool,
    );
  }
  for (const tool of ["ar"]) {
    assert.equal(
      module("make").requirements.some(({ type, name }) => type === "TOOL" && name === tool),
      false,
      `make must not absorb downstream ${tool} usage`,
    );
  }
  const recipeTools = new Map([
    ["awk", ["cc"]],
    ["curl", ["ar", "cc"]],
    ["ghostty", ["ar", "cc", "zig"]],
    ["git", ["ar", "cc", "mkdir", "rm"]],
    ["ninja", ["make"]],
    ["agent-tools", ["cc"]],
    ["sbase", ["cc"]],
    ["zlib", ["ar", "cc"]],
  ]);
  for (const [name, tools] of recipeTools) {
    for (const tool of tools) {
      assert.ok(
        module(name).requirements.some((item) => item.type === "TOOL" && item.name === tool),
        `${name} must require Makefile tool ${tool}`,
      );
    }
  }
});

test("compiled modules declare their direct C header surfaces", async () => {
  const modules = await coreModules();
  const requiringLibc = [
    "tar", "core-tools", "download", "make", "cpp", "ninja", "zlib", "curl", "git", "ghostty", "awk", "sbase",
  ];
  for (const name of requiringLibc) {
    assert.ok(
      modules.get(name).requirements.some((item) => item.type === "HEADER" && item.name === "libc"),
      `${name} must require HEADER libc`,
    );
  }
  const headers = (name) => modules.get(name).requirements
    .filter(({ type }) => type === "HEADER")
    .map(({ name: header }) => header);
  assert.deepEqual(headers("core-tools"), ["libc", "runtime"]);
  assert.deepEqual(headers("download"), ["libc", "download"]);
  assert.deepEqual(headers("cpp"), ["libc"]);
  assert.deepEqual(headers("ninja"), ["libc", "runtime"]);
  assert.deepEqual(headers("curl"), ["libc", "http"]);
  assert.deepEqual(headers("git"), ["libc", "runtime", "curl", "zlib"]);

  const exportedHeaders = (name) => modules.get(name).exports
    .filter(({ type }) => type === "HEADER")
    .map(({ name: header }) => header);
  assert.deepEqual(exportedHeaders("zlib"), ["zlib", "zconf"]);
  assert.deepEqual(exportedHeaders("curl"), ["curl"]);
  assert.deepEqual(exportedHeaders("ghostty"), ["ghostty-vt"]);

  const ghostty = modules.get("ghostty");
  assert.ok(ghostty.exports.some(({ type, name }) => type === "LIB" && name === "display"));
  assert.equal(ghostty.exports.some(({ type, name }) =>
    type === "FILE" && name === "display-wasm"), false);
  assert.ok(ghostty.files.some(({ path }) =>
    path === "/usr/share/fonts/IosevkaTerm-SemiBold.ttf"));
});

test("the system graph retains no retired extras or Awk generator inputs", async () => {
  const graph = await loadProjectGraph();
  assert.equal(graph.modules.some(({ name }) => name === "extras"), false);
  const make = graph.modules.find(({ name }) => name === "make");
  assert.equal(make.requirements.some(({ type, name }) =>
    type === "TOOL" && name === "slop"), false);
  for (const tool of ["cc", "mkdir", "rm", "tar"]) {
    assert.ok(make.requirements.some(({ type, name }) => type === "TOOL" && name === tool));
  }
  const awk = graph.modules.find(({ name }) => name === "awk");
  assert.equal(awk.files.some(({ path }) =>
    path.endsWith("/awk-maketab") || path.endsWith("/proctab.c")), false);
});

