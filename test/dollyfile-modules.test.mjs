import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";
import test from "node:test";

import {
  loadDollyfileGraph, createDollyfileGraphLoader,
} from "../scripts/dollyfile-graph.mjs";
import { renderDollyfilePage } from "../scripts/render-dollyfile-view.mjs";
import { inspectDollyfile } from "../src/dollyfile-view.mjs";

const projectDir = resolve(import.meta.dirname, "..");
const loadProjectGraph = createDollyfileGraphLoader(projectDir);

test("module-owned command sources have no divergent standalone copies", async () => {
  const commands = new Set(await readdir(resolve(projectDir, "src/commands")));
  for (const filename of await readdir(resolve(projectDir, "modules"))) {
    if (!filename.endsWith(".dm")) continue;
    const module = inspectDollyfile(await readFile(resolve(projectDir, "modules", filename), "utf8"), filename);
    for (const file of module.files) {
      if (!file.path.endsWith(".c")) continue;
      assert.ok(!commands.has(basename(file.path)), `${filename}: ${file.path} duplicates src/commands/${basename(file.path)}`);
    }
  }
});

const imageSpecs = [
  {
    image: "default", filename: "Dollyfile",
    uses: ["default", "startup-default"], program: "/bin/slop",
  },
  {
    image: "pi", filename: "Dollyfile-pi",
    uses: ["default", "quickjs", "typescript", "pi", "startup-pi"],
    program: "/usr/bin/pi",
  },
  {
    image: "python", filename: "Dollyfile-python",
    uses: ["default", "python", "startup-python"],
    program: "/bin/slop",
  },
  {
    image: "python-pi", filename: "Dollyfile-python-pi",
    uses: [
      "default", "python", "quickjs", "typescript", "pi",
      "python-pi-integration",
    ],
    program: "/usr/bin/pi",
  },
  {
    image: "gamedev", filename: "Dollyfile-gamedev",
    uses: [
      "default", "quickjs", "typescript", "pi", "gamedev",
      "startup-gamedev",
    ],
    program: "/usr/bin/graphics-demo",
  },
];
async function loadImages() {
  return Promise.all(imageSpecs.map(async (spec) => ({
    spec,
    graph: await loadProjectGraph(spec.filename),
  })));
}

function uniqueModules(images) {
  const modules = new Map();
  for (const { graph } of images) {
    for (const module of graph.modules) modules.set(module.name, module);
  }
  return modules;
}

function digest(source) {
  return createHash("sha256").update(source).digest("hex");
}

test("QuickJS is selected only by Pi-bearing images", async () => {
  const images = await loadImages();
  const defaultGraph = images.find(({ spec }) => spec.image === "default").graph;
  assert.equal(defaultGraph.modules.some(({ name }) => name === "quickjs"), false);
  assert.equal(defaultGraph.exporters.has("HEADER:quickjs-runner"), false);
  assert.equal(defaultGraph.exporters.has("LIB:dolly-js"), false);
  const pythonGraph = images.find(({ spec }) => spec.image === "python").graph;
  assert.equal(pythonGraph.modules.some(({ name }) => name === "quickjs"), false);

  for (const { spec, graph } of images.filter(({ spec }) =>
    ["pi", "python-pi", "gamedev"].includes(spec.image))) {
    const quickjs = graph.modules.find(({ name }) => name === "quickjs");
    const pi = graph.modules.find(({ name }) => name === "pi");
    assert.ok(quickjs, `${spec.image} must include quickjs`);
    assert.ok(pi, `${spec.image} must include pi`);
    for (const requirement of ["LIB:dolly-js", "HEADER:quickjs-runner"]) {
      const [type, name] = requirement.split(":");
      const edge = pi.dependencies.find((item) =>
        item.requirement.type === type && item.requirement.name === name);
      assert.ok(edge?.provider === quickjs, `${spec.image}: ${requirement}`);
    }
  }
});

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
    const seed = "DOLLY 3\nMODULE seed\n\nEXPORTS TOOL cc\n";
    const child = `DOLLY 3
MODULE child

REQUIRES TOOL cc
EXPORTS TOOL result
`;
    const aggregate = `DOLLY 3
MODULE aggregate

REQUIRES TOOL cc
USE HOST /modules/child.dm ${digest(child)}

EXPORTS TOOL result
`;
    await Promise.all([
      writeFile(resolve(fixture, "modules/seed.dm"), seed),
      writeFile(resolve(fixture, "modules/child.dm"), child),
      writeFile(resolve(fixture, "modules/aggregate.dm"), aggregate),
    ]);
    await writeFile(resolve(fixture, "Dollyfile"), `DOLLY 3
IMAGE default

USE HOST /modules/seed.dm      ${digest(seed)}
USE HOST /modules/aggregate.dm ${digest(aggregate)}

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
    const child = "DOLLY 3\nMODULE child\n\nEXPORTS LIB z /usr/lib/libz.a\n";
    const aggregate = `DOLLY 3
MODULE aggregate

USE HOST /modules/child.dm ${digest(child)}
EXPORTS LIB z /usr/lib/replacement.a
`;
    await Promise.all([
      writeFile(resolve(fixture, "modules/child.dm"), child),
      writeFile(resolve(fixture, "modules/aggregate.dm"), aggregate),
    ]);
    await writeFile(resolve(fixture, "Dollyfile"), `DOLLY 3
IMAGE default

USE HOST /modules/aggregate.dm ${digest(aggregate)}
ENTRY /bin/result
`);
    const graph = await loadDollyfileGraph(fixture);
    assert.deepEqual(graph.exporters.get("LIB:z").exported.details, ["/usr/lib/replacement.a"]);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("FILE consumes four-space-indented content and stops at the first other line", () => {
  const parsed = inspectDollyfile(`DOLLY 3
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
    ["libc", "toolchain", "runtime", "process", "http", "display", "download"],
  );
  const tools = bootstrap.exports.filter(({ type }) => type === "TOOL");
  assert.deepEqual(
    tools.map(({ name }) => name),
    ["cc", "c++", "ld", "ar", "slop", "dollyfile", "mkdir", "rm"],
  );
  assert.equal(
    tools.some(({ sha256 }) => sha256),
    false,
    "bootstrap tools are process-image outputs identified by the runtime build, not fetched blobs",
  );
  assert.deepEqual(
    bootstrap.exports.filter(({ type }) => type === "ENV").map(({ name }) => name),
    ["CC", "AR", "SHELL", "PATH"],
  );
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

  const pi = (await loadProjectGraph("Dollyfile-pi"))
    .modules.find(({ name }) => name === "pi");
  assert.ok(pi.exports.some(({ type, name, details }) =>
    type === "ENV" && name === "PI_SKIP_VERSION_CHECK" && details[0] === "1"));
});

test("small Dolly-owned command sources are inline", async () => {
  const graph = await loadProjectGraph();
  const core = graph.modules.find(({ name }) => name === "core-tools");
  const download = graph.modules.find(({ name }) => name === "download");
  const tar = graph.modules.find(({ name }) => name === "tar");
  assert.equal(core.sources.length, 0);
  assert.equal(core.files.length, 15);
  assert.match(core.files.find(({ path }) => path.endsWith("/foreground.c")).body,
    /dolly_spawn_foreground/);
  assert.match(core.files.find(({ path }) => path.endsWith("/ls.c")).body, /int main/);
  assert.equal(core.files.some(({ path }) => path.endsWith("/download.c")), false);
  assert.match(download.files.find(({ path }) => path.endsWith("/download.c")).body,
    /dolly_download_file/);
  assert.equal(tar.sources.length, 0);
  assert.match(tar.files.find(({ path }) => path.endsWith("/tar.c")).body, /BLOCK_SIZE = 512/);
});

test("Pi is compiled from pinned source after an in-sandbox TypeScript layer", async () => {
  const graph = await loadProjectGraph("Dollyfile-pi");
  const typescript = graph.modules.find(({ name }) => name === "typescript");
  const pi = graph.modules.find(({ name }) => name === "pi");
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
});

test("redistributed upstream modules retain their licenses", async () => {
  const modules = uniqueModules(await loadImages());
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
    ["quickjs", ["/usr/share/licenses/quickjs-ng/LICENSE"]],
    ["libffi", ["/usr/share/licenses/libffi/LICENSE"]],
    ["cpython", ["/usr/share/licenses/cpython/LICENSE"]],
    ["gamedev-sdk", [
      "/usr/share/licenses/raylib/LICENSE",
      "/usr/share/licenses/box3d/LICENSE",
    ]],
  ]);
  for (const [name, paths] of expected) {
    const retained = new Set(modules.get(name).files.map(({ path }) => path));
    for (const path of paths) assert.ok(retained.has(path), `${name} does not retain ${path}`);
  }
});

test("production exports exclude build-only checks and unconsumed archives", async () => {
  const modules = uniqueModules(await loadImages());
  assert.equal(modules.get("ghostty").exports.some(
    ({ type, name }) => type === "TOOL" && name === "ghostty-vt"), false);
  assert.equal(modules.get("ghostty").sources.some(
    ({ location }) => location.endsWith("/ghostty/check.c")), false);
  assert.equal(modules.get("git").exports.some(
    ({ type, name }) => type === "LIB" && name === "git"), false);
  assert.ok(modules.get("cpython").exports.some(
    ({ type, name, details }) =>
      type === "ENV" && name === "PYTHONDONTWRITEBYTECODE" && details[0] === "1"));
  assert.equal(modules.get("cpython").slops.some(
    ({ command }) => command[0] === "python" && command.includes("-B")), false);
});

test("host preparation can select one image and only its reachable modules", async () => {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const run = promisify(execFile);
  const { stdout } = await run(process.execPath, ["scripts/list-images.mjs", "--modules"], {
    cwd: projectDir,
    env: { ...process.env, DOLLY_BUILD_IMAGES: "default" },
  });
  const modules = stdout.trim().split("\n");
  assert.ok(modules.includes("default"));
  assert.equal(modules.includes("quickjs"), false);
  assert.equal(modules.includes("pi"), false);
  assert.equal(modules.includes("python"), false);
  assert.equal(modules.includes("gamedev"), false);
});

test("non-temporary SOURCE inputs are retained or explicitly removed by their module", async () => {
  const modules = uniqueModules(await loadImages());
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

test("Bonnie is a retained two-file command with transactional graph helpers", async () => {
  const graph = await loadProjectGraph("Dollyfile-python");
  const bonnie = graph.modules.find(({ name }) => name === "bonnie");
  assert.deepEqual(
    bonnie.sources.map(({ location, destination }) => [location, destination]),
    [
      ["/static/python/commands/bonnie.c", "/tmp/bonnie/bonnie.c"],
      ["/static/python/runtimes/bonnie.py", "/usr/lib/bonnie/bonnie.py"],
    ],
  );
  assert.ok(bonnie.files.some(({ path, body }) =>
    path === "/usr/lib/bonnie/bonnie.py" && body === null));

  const helperPath = resolve(projectDir, "src/runtimes/bonnie.py");
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
    execFileSync("python3", ["-B", resolve(projectDir, "test/fixtures/bonnie-policy.py"), helperPath, temporary]);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("build modules declare tools used by their own recipes", async () => {
  const modules = uniqueModules(await loadImages());
  const module = (name) => modules.get(name);
  assert.deepEqual(
    module("zlib").requirements.map(({ type, name }) => `${type} ${name}`),
    ["HEADER libc", "TOOL ar", "TOOL cc", "TOOL make", "TOOL rm", "TOOL tar"],
  );
  for (const tool of ["cc", "cp", "mkdir", "rm", "tar"]) {
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
    ["gamedev-sdk", ["ar", "cc", "mkdir"]],
    ["gamedev", ["cc", "make"]],
    ["ghostty", ["ar", "cc", "zig"]],
    ["git", ["ar", "cc", "mkdir", "rm"]],
    ["ninja", ["make"]],
    ["agent-tools", ["cc"]],
    ["pi", ["cc"]],
    ["quickjs", ["ar", "cc"]],
    ["sbase", ["cc"]],
    ["typescript", ["cc"]],
    ["libffi", ["ar", "cc"]],
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
  const modules = uniqueModules(await loadImages());
  const requiringLibc = [
    "tar", "core-tools", "download", "make", "cpp", "ninja", "zlib", "curl", "git", "quickjs", "pi",
    "ghostty", "awk", "sbase", "python", "libffi", "cpython", "bonnie", "gamedev-sdk",
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
  assert.deepEqual(headers("quickjs"), ["libc", "runtime", "http", "download"]);
  assert.deepEqual(headers("pi"), ["libc", "quickjs-runner"]);
  assert.deepEqual(headers("python"), ["curl", "libc", "runtime", "zlib"]);
  assert.deepEqual(headers("libffi"), ["libc"]);
  assert.deepEqual(headers("cpython"), ["libc", "ffi", "ffitarget", "runtime", "zlib"]);
  assert.deepEqual(headers("bonnie"), ["curl", "libc", "runtime"]);
  assert.deepEqual(headers("gamedev-sdk"), ["libc", "display"]);

  const exportedHeaders = (name) => modules.get(name).exports
    .filter(({ type }) => type === "HEADER")
    .map(({ name: header }) => header);
  assert.deepEqual(exportedHeaders("zlib"), ["zlib", "zconf"]);
  assert.deepEqual(exportedHeaders("libffi"), ["ffi", "ffitarget"]);
  assert.deepEqual(exportedHeaders("curl"), ["curl"]);
  assert.deepEqual(exportedHeaders("quickjs"), ["quickjs-runner"]);
  assert.deepEqual(exportedHeaders("ghostty"), ["ghostty-vt"]);
  assert.deepEqual(exportedHeaders("gamedev-sdk"), ["raylib", "box3d", "dolly-raylib"]);

  const ghostty = modules.get("ghostty");
  assert.ok(ghostty.exports.some(({ type, name }) => type === "LIB" && name === "display"));
  assert.ok(ghostty.exports.some(({ type, name, details }) =>
    type === "ENV" && name === "DISPLAY" && details[0] === "/usr/lib/libdisplay.so"));
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

test("recipes reject directives before the image or module declaration", () => {
  assert.throws(
    () => inspectDollyfile(`DOLLY 3
SOURCE HOST /static/input /tmp/input ${"0".repeat(64)}
MODULE bad
`, "modules/bad.dm"),
    /expected IMAGE or MODULE/,
  );
});

test("Patti pins its C implementation and parser without a Python runtime dependency", async () => {
  const module = inspectDollyfile(await readFile(resolve(projectDir, "modules/patti.dm"), "utf8"), "patti.dm");
  assert.ok(!module.requirements.some(requirement => requirement.name.startsWith("python")));
  const sources = new Map([
    ["patti.c", "src/commands/patti.c"], ["sha256.h", "src/sha256.h"],
    ["tomlc17.c", "src/third_party/tomlc17/tomlc17.c"],
    ["tomlc17.h", "src/third_party/tomlc17/tomlc17.h"],
    ["LICENSE", "src/third_party/tomlc17/LICENSE"],
  ]);
  assert.equal(module.sources.length, sources.size);
  for (const source of module.sources) {
    const path = sources.get(basename(source.location));
    assert.ok(path, source.location);
    assert.equal(createHash("sha256").update(await readFile(resolve(projectDir, path))).digest("hex"), source.sha256);
  }
  assert.ok(module.slops.some(step => step.command[0] === "cc" && step.command.includes("/usr/bin/patti")));
});
