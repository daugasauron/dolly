import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import {
  loadDollyfileGraph,
  moduleCacheRecords,
} from "../scripts/dollyfile-graph.mjs";
import { renderDollyfilePage } from "../scripts/render-dollyfile-view.mjs";
import { inspectDollyfile } from "../src/dollyfile-view.mjs";

const projectDir = resolve(import.meta.dirname, "..");
const imageSpecs = [
  { image: "default", filename: "Dollyfile", uses: ["default"], entry: "/bin/slop" },
  {
    image: "pi", filename: "Dollyfile-pi",
    uses: ["default", "quickjs", "typescript", "pi"],
    entry: "/usr/bin/pi",
  },
  {
    image: "python", filename: "Dollyfile-python",
    uses: ["default", "python"],
    entry: "/bin/slop",
  },
  {
    image: "python-pi", filename: "Dollyfile-python-pi",
    uses: ["default", "python", "quickjs", "typescript", "pi"],
    entry: "/usr/bin/pi",
  },
  {
    image: "gamedev", filename: "Dollyfile-gamedev",
    uses: ["default", "quickjs", "typescript", "pi", "gamedev"],
    entry: "/usr/bin/graphics-demo",
  },
];
const defaultChildren = [
  "bootstrap", "core-tools", "download", "tar", "make", "zig", "ghostty", "cpp",
  "ninja", "zlib", "curl", "git", "awk", "sbase",
  "sbase-tools-1", "sbase-tools-2", "sbase-tools-3", "sbase-tools-4",
  "sbase-tools-5", "sbase-tools-6", "sbase-tools-7", "sbase-tools-8",
  "sbase-tools-9", "sbase-tools-10", "sbase-tools-11", "sbase-tools-12",
  "agent-tools",
];

async function loadImages() {
  return Promise.all(imageSpecs.map(async (spec) => ({
    spec,
    graph: await loadDollyfileGraph(projectDir, spec.filename),
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

function assertAlignedTableBlocks(source, label) {
  const lines = source.split("\n");
  const pattern = /^(USE|SOURCE|REQUIRES|EXPORTS)\b/;
  for (let start = 0; start < lines.length;) {
    const first = pattern.exec(lines[start]);
    if (!first) {
      start += 1;
      continue;
    }
    const directive = first[1];
    let end = start + 1;
    while (end < lines.length && pattern.exec(lines[end])?.[1] === directive) end += 1;
    const rows = lines.slice(start, end).map((line) =>
      [...line.matchAll(/\S+/g)].map((match) => match.index));
    const columnCount = Math.max(...rows.map((row) => row.length));
    for (let column = 0; column < columnCount; column += 1) {
      const positions = new Set(rows.flatMap((row) => row[column] === undefined ? [] : [row[column]]));
      assert.equal(
        positions.size,
        1,
        `${label}:${start + 1}-${end}: column ${column + 1} is not aligned`,
      );
    }
    start = end;
  }
}

test("each image directly selects its unique ordered modules", async () => {
  const images = await loadImages();
  for (const { spec, graph } of images) {
    assert.equal(graph.root.image, spec.image);
    assert.deepEqual(graph.root.entry, [spec.entry]);
    assert.equal(graph.root.requirements.length, 0);
    assert.deepEqual(graph.root.children.map(({ name }) => name), spec.uses);
    assert.equal(new Set(graph.modules.map(({ name }) => name)).size, graph.modules.length);
    for (const module of graph.modules) {
      for (const edge of module.dependencies) {
        assert.ok(
          edge.provider.parent === module.parent ||
          module.parent.imports.has(`${edge.requirement.type}:${edge.requirement.name}`),
          `${edge.provider.name} -> ${module.name}`,
        );
      }
    }
  }
  const modules = uniqueModules(images);
  assert.deepEqual(
    modules.get("default").children.map(({ name }) => name),
    defaultChildren,
  );
  const diskModules = (await readdir(resolve(projectDir, "modules")))
    .filter((name) => name.endsWith(".dm"));
  assert.deepEqual(
    [...modules.keys()].sort(),
    diskModules.map((name) => name.slice(0, -3)).sort(),
  );
});

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
    const quickjs = graph.root.children.find(({ name }) => name === "quickjs");
    const pi = graph.root.children.find(({ name }) => name === "pi");
    assert.ok(quickjs, `${spec.image} must directly USE quickjs`);
    assert.ok(pi, `${spec.image} must directly USE pi`);
    for (const requirement of ["LIB:dolly-js", "HEADER:quickjs-runner"]) {
      const [type, name] = requirement.split(":");
      const edge = pi.dependencies.find((item) =>
        item.requirement.type === type && item.requirement.name === name);
      assert.equal(edge?.provider, quickjs, `${spec.image}: ${requirement}`);
    }
  }
});

test("the linked viewer preserves table alignment whitespace", async () => {
  const graph = await loadDollyfileGraph(projectDir);
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

test("a requirement cannot be satisfied by a later USE", async () => {
  const fixture = await mkdtemp(resolve(tmpdir(), "dolly-sequential-"));
  try {
    await mkdir(resolve(fixture, "modules"));
    const consumer = "DOLLY 2\nMODULE consumer\n\nREQUIRES TOOL cc\n";
    const provider = "DOLLY 2\nMODULE provider\n\nEXPORTS TOOL cc\n";
    await Promise.all([
      writeFile(resolve(fixture, "modules/consumer.dm"), consumer),
      writeFile(resolve(fixture, "modules/provider.dm"), provider),
    ]);
    const root = (first, second) => `DOLLY 2
IMAGE default

USE HOST /modules/${first}.dm ${digest(first === "consumer" ? consumer : provider)}
USE HOST /modules/${second}.dm ${digest(second === "consumer" ? consumer : provider)}

ENTRY /bin/cc
`;
    await writeFile(resolve(fixture, "Dollyfile"), root("consumer", "provider"));
    await assert.rejects(
      loadDollyfileGraph(fixture),
      /TOOL cc must be exported by an earlier USE/,
    );
    await writeFile(resolve(fixture, "Dollyfile"), root("provider", "consumer"));
    const graph = await loadDollyfileGraph(fixture);
    assert.deepEqual(graph.modules.map(({ name }) => name), ["provider", "consumer"]);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("grandchild exports do not leak into their grandparent scope", async () => {
  const fixture = await mkdtemp(resolve(tmpdir(), "dolly-nested-scope-"));
  try {
    await mkdir(resolve(fixture, "modules"));
    const provider = "DOLLY 2\nMODULE provider\n\nEXPORTS TOOL cc\n";
    const aggregate = `DOLLY 2
MODULE aggregate

USE HOST /modules/provider.dm ${digest(provider)}
`;
    const consumer = "DOLLY 2\nMODULE consumer\n\nREQUIRES TOOL cc\n";
    await Promise.all([
      writeFile(resolve(fixture, "modules/provider.dm"), provider),
      writeFile(resolve(fixture, "modules/aggregate.dm"), aggregate),
      writeFile(resolve(fixture, "modules/consumer.dm"), consumer),
    ]);
    await writeFile(resolve(fixture, "Dollyfile"), `DOLLY 2
IMAGE default

USE HOST /modules/aggregate.dm ${digest(aggregate)}
USE HOST /modules/consumer.dm  ${digest(consumer)}

ENTRY /bin/cc
`);
    await assert.rejects(
      loadDollyfileGraph(fixture),
      /TOOL cc must be exported by an earlier USE in Dollyfile/,
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("an aggregate imports its requirements into its child scope", async () => {
  const fixture = await mkdtemp(resolve(tmpdir(), "dolly-imported-requirement-"));
  try {
    await mkdir(resolve(fixture, "modules"));
    const seed = "DOLLY 2\nMODULE seed\n\nEXPORTS TOOL cc\n";
    const child = `DOLLY 2
MODULE child

REQUIRES TOOL cc
EXPORTS TOOL result
`;
    const aggregate = `DOLLY 2
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
    await writeFile(resolve(fixture, "Dollyfile"), `DOLLY 2
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

test("aggregate exports inherit the exact child object", async () => {
  const fixture = await mkdtemp(resolve(tmpdir(), "dolly-exact-reexport-"));
  try {
    await mkdir(resolve(fixture, "modules"));
    const child = "DOLLY 2\nMODULE child\n\nEXPORTS LIB z /usr/lib/libz.a\n";
    const aggregate = `DOLLY 2
MODULE aggregate

USE HOST /modules/child.dm ${digest(child)}
EXPORTS LIB z
`;
    await Promise.all([
      writeFile(resolve(fixture, "modules/child.dm"), child),
      writeFile(resolve(fixture, "modules/aggregate.dm"), aggregate),
    ]);
    await writeFile(resolve(fixture, "Dollyfile"), `DOLLY 2
IMAGE default

USE HOST /modules/aggregate.dm ${digest(aggregate)}
ENTRY /bin/result
`);
    const graph = await loadDollyfileGraph(fixture);
    assert.deepEqual(graph.exporters.get("LIB:z").exported.details, ["/usr/lib/libz.a"]);
    assert.throws(
      () => inspectDollyfile(aggregate.replace("EXPORTS LIB z", "EXPORTS LIB z /wrong")),
      /aggregate EXPORTS inherits its object/,
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("the fast parser accepts only the C executor's version-2 forms", () => {
  assert.throws(
    () => inspectDollyfile("DOLLY 1\nIMAGE old\n", "old.Dollyfile"),
    /first declaration must be DOLLY 2/,
  );
  assert.throws(
    () => inspectDollyfile(`DOLLY 2
MODULE bad
EXPORTS ENV VALUE too many words
`, "bad.dm"),
    /invalid ENV export/,
  );
  assert.throws(
    () => inspectDollyfile(`DOLLY 2
MODULE bad
EXPORTS ENV BAD-NAME value
`, "bad.dm"),
    /invalid EXPORTS environment name/,
  );
  assert.throws(
    () => inspectDollyfile(`DOLLY 2
IMAGE bad
USE URL https://example.invalid/module.dm ${"0".repeat(64)}
ENTRY /bin/bad
`, "bad.Dollyfile"),
    /invalid USE/,
  );
  assert.throws(
    () => inspectDollyfile(`DOLLY 2
IMAGE bad
SOURCE URL https://example.invalid/input /tmp/input ${"0".repeat(64)}
ENTRY /bin/bad
`, "bad.Dollyfile"),
    /IMAGE may only declare USE and ENTRY/,
  );
  assert.throws(
    () => inspectDollyfile(`DOLLY 2
MODULE mixed
USE HOST /modules/child.dm ${"0".repeat(64)}
FILE /tmp/input
    value
`, "mixed.dm"),
    /aggregate MODULE cannot contain build steps/,
  );
  assert.throws(
    () => inspectDollyfile(`DOLLY 2
MODULE mixed
FILE /tmp/input
    value
USE HOST /modules/child.dm ${"0".repeat(64)}
`, "mixed.dm"),
    /leaf MODULE cannot also USE child modules/,
  );
  assert.throws(
    () => inspectDollyfile(`DOLLY 2
MODULE mixed
EXPORTS TOOL result
USE HOST /modules/child.dm ${"0".repeat(64)}
`, "mixed.dm"),
    /leaf MODULE cannot also USE child modules/,
  );
  assert.throws(
    () => inspectDollyfile(`DOLLY 2
MODULE late-requirement
USE HOST /modules/child.dm ${"0".repeat(64)}
REQUIRES TOOL cc
`, "late-requirement.dm"),
    /REQUIRES must precede module composition and build declarations/,
  );
  assert.throws(
    () => inspectDollyfile(`DOLLY 2
MODULE duplicate-requirement
REQUIRES TOOL cc
REQUIRES TOOL cc
`, "duplicate-requirement.dm"),
    /duplicate REQUIRES TOOL cc/,
  );
  assert.throws(
    () => inspectDollyfile(`DOLLY 2
MODULE bad-url
SOURCE URL file:///host/input /tmp/input ${"0".repeat(64)}
`, "bad-url.dm"),
    /invalid SOURCE/,
  );
  assert.throws(
    () => inspectDollyfile(`DOLLY 2
IMAGE bad
ENTRY /bin/bad
USE HOST /modules/child.dm ${"0".repeat(64)}
`, "bad.Dollyfile"),
    /ENTRY must be the final declaration/,
  );
});

test("module identity and declared writes have one owner", async () => {
  const fixture = await mkdtemp(resolve(tmpdir(), "dolly-owned-paths-"));
  try {
    await mkdir(resolve(fixture, "modules"));
    const first = `DOLLY 2
MODULE first

FILE /usr/share/value
    first
EXPORTS FILE first /usr/share/value
`;
    const wrongName = "DOLLY 2\nMODULE not-second\n";
    await Promise.all([
      writeFile(resolve(fixture, "modules/first.dm"), first),
      writeFile(resolve(fixture, "modules/second.dm"), wrongName),
    ]);
    await writeFile(resolve(fixture, "Dollyfile"), `DOLLY 2
IMAGE default

USE HOST /modules/first.dm  ${digest(first)}
USE HOST /modules/second.dm ${digest(wrongName)}

ENTRY /usr/share/value
`);
    await assert.rejects(loadDollyfileGraph(fixture), /MODULE not-second must match its filename/);

    const second = `DOLLY 2
MODULE second

FILE /usr/share/value
    second
EXPORTS FILE second /usr/share/value
`;
    await writeFile(resolve(fixture, "modules/second.dm"), second);
    await writeFile(resolve(fixture, "Dollyfile"), `DOLLY 2
IMAGE default

USE HOST /modules/first.dm  ${digest(first)}
USE HOST /modules/second.dm ${digest(second)}

ENTRY /usr/share/value
`);
    await assert.rejects(loadDollyfileGraph(fixture), /already written by modules\/first\.dm/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("image environment and directory membership are sealed by the C engine", async () => {
  const engine = await readFile(resolve(projectDir, "src/dollyfile.c"), "utf8");
  const runtime = await readFile(resolve(projectDir, "src/dolly.c"), "utf8");
  assert.match(engine, /'D', 'O', 'L', 'L', 'Y', 'E', 'N', 'V'/);
  assert.match(engine, /environment_names/);
  assert.match(engine, /write_environment_file\(engine\)/);
  assert.match(engine, /strcmp\(text, "FOLDER"\)[\s\S]*?collect_tree\(engine, words\[0\]\)/);
  assert.doesNotMatch(engine, /keep_trees|KEEP-TREE/);
  assert.match(engine, /collect_paths[\s\S]*?forbidden_keep\(path\)/);
  assert.match(engine, /clean_temporary_directory\(locator\)/);
  assert.match(runtime, /load_image_environment\(\)[\s\S]*?install_display_driver\(\)/);
});

test("a module cannot be USEd twice in one Dollyfile graph", async () => {
  const fixture = await mkdtemp(resolve(tmpdir(), "dolly-duplicate-use-"));
  try {
    await mkdir(resolve(fixture, "modules"));
    const provider = "DOLLY 2\nMODULE provider\n\nEXPORTS TOOL cc\n";
    await writeFile(resolve(fixture, "modules/provider.dm"), provider);
    await writeFile(resolve(fixture, "Dollyfile"), `DOLLY 2
IMAGE default

USE HOST /modules/provider.dm ${digest(provider)}
USE HOST /modules/provider.dm ${digest(provider)}

ENTRY /bin/cc
`);
    await assert.rejects(loadDollyfileGraph(fixture), /duplicate USE \/modules\/provider\.dm/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("FILE consumes four-space-indented content and stops at the first other line", () => {
  const parsed = inspectDollyfile(`DOLLY 2
MODULE inline

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

test("version 2 has plain hashes, no media labels, and no interface object types", async () => {
  const names = await readdir(resolve(projectDir, "modules"));
  for (const name of [...imageSpecs.map(({ filename }) => filename), ...names.map((entry) => `modules/${entry}`)]) {
    const source = await readFile(resolve(projectDir, name), "utf8");
    assert.doesNotMatch(source, /\b(?:SHA256|BIN|TXT)\b/, name);
    assert.doesNotMatch(source, /^(?:REQUIRES|EXPORTS) (?:RUNTIME|HOST|WAT)\b/m, name);
    assert.doesNotMatch(source, /^CONTRACT\b/m, name);
    assert.doesNotMatch(source, /^FILE .*<</m, name);
    assertAlignedTableBlocks(source, name);
  }
});

test("bootstrap exports exact compiler tools and first-class headers", async () => {
  const graph = await loadDollyfileGraph(projectDir);
  const bootstrap = graph.modules.find(({ name }) => name === "bootstrap");
  assert.equal(bootstrap.name, "bootstrap");
  assert.equal(bootstrap.requirements.length, 0);
  assert.equal(bootstrap.slops.length, 0);
  assert.deepEqual(
    bootstrap.exports.filter(({ type }) => type === "HEADER").map(({ name }) => name),
    ["libc", "toolchain", "runtime", "http", "display", "download"],
  );
  const tools = bootstrap.exports.filter(({ type }) => type === "TOOL");
  assert.ok(tools.length > 0);
  assert.ok(tools.every(({ sha256 }) => sha256));
  assert.deepEqual(
    bootstrap.exports.filter(({ type }) => type === "ENV").map(({ name }) => name),
    ["CC", "AR", "SHELL", "PATH"],
  );
  assert.ok(bootstrap.exports.some(({ type, name, details }) =>
    type === "LIB" && name === "compiler-rt" &&
    details[0] === "/usr/lib/libclang_rt.builtins.a"));

  const cpp = graph.modules.find(({ name }) => name === "cpp");
  assert.ok(cpp.requirements.some(({ type, name }) =>
    type === "LIB" && name === "compiler-rt"));
  assert.ok(cpp.exports.some(({ type, name, details }) =>
    type === "HEADER" && name === "cpp" && details[0] === "/usr/include/c++/v1"));
  assert.deepEqual(
    cpp.exports.filter(({ type }) => type === "LIB").map(({ name }) => name),
    ["c++", "c++abi"],
  );
  assert.ok(cpp.exports.some(({ type, name, details }) =>
    type === "ENV" && name === "CXX" && details[0] === "c++"));

  const pi = (await loadDollyfileGraph(projectDir, "Dollyfile-pi"))
    .modules.find(({ name }) => name === "pi");
  assert.ok(pi.exports.some(({ type, name, details }) =>
    type === "ENV" && name === "PI_SKIP_VERSION_CHECK" && details[0] === "1"));
});

test("small Dolly-owned command sources are inline", async () => {
  const graph = await loadDollyfileGraph(projectDir);
  const core = graph.modules.find(({ name }) => name === "core-tools");
  const download = graph.modules.find(({ name }) => name === "download");
  const tar = graph.modules.find(({ name }) => name === "tar");
  assert.equal(core.sources.length, 0);
  assert.equal(core.files.length, 14);
  assert.match(core.files.find(({ path }) => path.endsWith("/ls.c")).body, /int main/);
  assert.equal(core.files.some(({ path }) => path.endsWith("/download.c")), false);
  assert.match(download.files.find(({ path }) => path.endsWith("/download.c")).body,
    /dolly_download_file/);
  assert.equal(tar.sources.length, 0);
  assert.match(tar.files.find(({ path }) => path.endsWith("/tar.c")).body, /BLOCK_SIZE = 512/);
});

test("Pi is compiled from pinned source after an in-sandbox TypeScript layer", async () => {
  const graph = await loadDollyfileGraph(projectDir, "Dollyfile-pi");
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

test("each module removes the build scratch paths it declares", async () => {
  const modules = uniqueModules(await loadImages());
  for (const module of modules.values()) {
    const extractScratchRoots = (value) => [...String(value).matchAll(/\/tmp\/([A-Za-z0-9._-]+)/g)]
      .map((match) => `/tmp/${match[1]}`);
    const scratchRoots = new Set(
      [...module.sources.flatMap(({ destination }) => extractScratchRoots(destination)),
        ...module.files.flatMap(({ path }) => extractScratchRoots(path)),
        ...module.slops.flatMap(({ cwd, command }) =>
          [cwd, ...command].flatMap(extractScratchRoots))],
    );
    if (scratchRoots.size === 0) continue;
    const cleanup = module.slops.at(-1)?.command ?? [];
    assert.equal(cleanup[0], "rm", `${module.name} must end by cleaning its scratch paths`);
    for (const root of scratchRoots) {
      assert.ok(cleanup.includes(root), `${module.name} does not clean ${root}`);
    }
  }
  const engine = await readFile(new URL("../src/dollyfile.c", import.meta.url), "utf8");
  assert.match(engine, /verify_temporary_directory_empty\(locator\)/);
  assert.match(engine, /clean_temporary_directory\(locator\)/);
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
    ["cpython", ["/usr/share/licenses/cpython/LICENSE"]],
    ["gamedev", [
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

test("scratch referenced only by SLOP still requires explicit cleanup", async () => {
  const fixture = await mkdtemp(resolve(tmpdir(), "dolly-slop-scratch-"));
  try {
    await mkdir(resolve(fixture, "modules"));
    const seed = "DOLLY 2\nMODULE seed\n\nEXPORTS TOOL cc\n";
    const leaky = `DOLLY 2
MODULE leaky

REQUIRES TOOL cc
SLOP cc \\
  -o /tmp/leaky/object.o \\
  input.c
`;
    await Promise.all([
      writeFile(resolve(fixture, "modules/seed.dm"), seed),
      writeFile(resolve(fixture, "modules/leaky.dm"), leaky),
    ]);
    await writeFile(resolve(fixture, "Dollyfile"), `DOLLY 2
IMAGE default

USE HOST /modules/seed.dm  ${digest(seed)}
USE HOST /modules/leaky.dm ${digest(leaky)}

ENTRY /bin/cc
`);
    await assert.rejects(
      loadDollyfileGraph(fixture),
      /module must end by removing its build scratch/,
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
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

test("module cache keys bind each leaf to the complete earlier recipe prefix", async () => {
  const graph = await loadDollyfileGraph(projectDir);
  const caches = moduleCacheRecords(graph);
  assert.deepEqual(caches.map(({ locator }) => locator), [
    "/modules/core-tools.dm",
    "/modules/download.dm",
    "/modules/tar.dm",
    "/modules/make.dm",
    "/modules/zig.dm",
    "/modules/ghostty.dm",
    "/modules/cpp.dm",
    "/modules/ninja.dm",
    "/modules/zlib.dm",
    "/modules/curl.dm",
    "/modules/git.dm",
    "/modules/awk.dm",
    "/modules/sbase.dm",
    "/modules/sbase-tools-1.dm",
    "/modules/sbase-tools-2.dm",
    "/modules/sbase-tools-3.dm",
    "/modules/sbase-tools-4.dm",
    "/modules/sbase-tools-5.dm",
    "/modules/sbase-tools-6.dm",
    "/modules/sbase-tools-7.dm",
    "/modules/sbase-tools-8.dm",
    "/modules/sbase-tools-9.dm",
    "/modules/sbase-tools-10.dm",
    "/modules/sbase-tools-11.dm",
    "/modules/sbase-tools-12.dm",
    "/modules/agent-tools.dm",
  ]);
  assert.ok(caches.every(({ cacheKey }) => /^[0-9a-f]{64}$/.test(cacheKey)));
  assert.equal(new Set(caches.map(({ cacheKey }) => cacheKey)).size, caches.length);
});

test("nested leaf cache keys bind the exact scope imported by their parent", async () => {
  const fixture = await mkdtemp(resolve(tmpdir(), "dolly-cache-scope-"));
  try {
    await mkdir(resolve(fixture, "modules"));
    const seed = `DOLLY 2
MODULE seed

EXPORTS TOOL cc
EXPORTS TOOL ar
`;
    const child = `DOLLY 2
MODULE child

REQUIRES TOOL cc
SLOP cc --version
EXPORTS LIB result /usr/lib/result.a
`;
    const aggregate = (includeAr) => `DOLLY 2
MODULE aggregate

REQUIRES TOOL cc
${includeAr ? "REQUIRES TOOL ar\n" : ""}USE HOST /modules/child.dm ${digest(child)}

EXPORTS LIB result
`;
    await Promise.all([
      writeFile(resolve(fixture, "modules/seed.dm"), seed),
      writeFile(resolve(fixture, "modules/child.dm"), child),
    ]);
    const keyFor = async (includeAr) => {
      const parent = aggregate(includeAr);
      await writeFile(resolve(fixture, "modules/aggregate.dm"), parent);
      await writeFile(resolve(fixture, "Dollyfile"), `DOLLY 2
IMAGE default

USE HOST /modules/seed.dm      ${digest(seed)}
USE HOST /modules/aggregate.dm ${digest(parent)}

ENTRY /bin/result
`);
      const graph = await loadDollyfileGraph(fixture);
      return moduleCacheRecords(graph)
        .find(({ locator }) => locator === "/modules/child.dm").cacheKey;
    };
    assert.notEqual(await keyFor(false), await keyFor(true));
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("Python keeps the stable interpreter ahead of the fast-moving installer", async () => {
  const graph = await loadDollyfileGraph(projectDir, "Dollyfile-python-pi");
  const python = graph.modules.find(({ name }) => name === "python");
  assert.deepEqual(python.children.map(({ name }) => name), ["cpython", "bonnie"]);
  assert.equal(python.slops.length, 0);
  const cached = moduleCacheRecords(graph).map(({ locator }) => locator);
  const cpython = cached.indexOf("/modules/cpython.dm");
  const bonnie = cached.indexOf("/modules/bonnie.dm");
  assert.ok(cpython >= 0);
  assert.equal(bonnie, cpython + 1);
});

test("Bonnie is a retained two-file command with transactional graph helpers", async () => {
  const graph = await loadDollyfileGraph(projectDir, "Dollyfile-python");
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

  const frontend = await readFile(resolve(projectDir, "src/commands/bonnie.c"), "utf8");
  const helperPath = resolve(projectDir, "src/runtimes/bonnie.py");
  const helper = await readFile(helperPath, "utf8");
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
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }

  assert.match(frontend, /dependency constraints are unsatisfiable/);
  assert.match(frontend, /preparing dependency graph/);
  assert.match(frontend, /prepare_resolved_plan/);
  assert.match(frontend, /#!\/usr\/bin\/python/);
  assert.match(frontend, /prepare_entry_points/);
  assert.doesNotMatch(frontend, /compile_entry_points|bonnie-entry-%u\.c/);
  assert.match(frontend, /stage-reset/);
  assert.match(frontend, /bonnie-stage-/);
  assert.match(helper, /def _sync_pythonpath\(\)/);
  assert.match(helper, /--no-build-isolation/);
  assert.match(helper, /wheel path escapes its installation directory/);
  assert.match(helper, /log_path = posixpath\.join\(directory, "pip\.log"\)/);
  assert.match(helper, /finally:[\s\S]*shutil\.rmtree\(directory, ignore_errors=True\)/);
  assert.doesNotMatch(helper, /requests\.|urllib\.request|socket\./);
});

test("the trusted module cache exposes no guest-selected browser capability", async () => {
  const cache = await readFile(resolve(projectDir, "src/module-cache.mjs"), "utf8");
  const worker = await readFile(resolve(projectDir, "src/runtime-worker.mjs"), "utf8");
  const snapshotBuilder = await readFile(
    resolve(projectDir, "scripts/build-system-snapshot.mjs"), "utf8",
  );
  assert.match(cache, /indexedDB\.open/);
  assert.doesNotMatch(cache, /\b(?:fetch|eval|Function|localStorage|sessionStorage|document|cookie)\b/);
  assert.match(worker, /imageDefinitions\.get\(configuredImage\)\.moduleCaches/);
  assert.match(worker, /await sha256\(layer\.bytes\) !== layer\.sha256/);
  assert.match(worker, /expected\.has\(match\[1\]\)/);
  assert.match(worker, /removeCacheTree\(dolly, directory\)/);
  assert.match(snapshotBuilder, /\.cache\/snapshot-browser-profile/);
  assert.match(snapshotBuilder, /DOLLY_BROWSER_PROFILE: snapshotBrowserProfile/);
  assert.match(snapshotBuilder, /DOLLY_BROWSER_PORT: snapshotBrowserPort/);
  assert.match(snapshotBuilder, /DOLLY_FORCE_SNAPSHOT/);
  assert.match(snapshotBuilder, /verifySnapshotIdentity\(image, parsed, expectedRecipes\(image\)\)/);
  assert.match(snapshotBuilder, /metadata\.sha256 === digest\(snapshot\)/);
});

test("compiler outputs do not depend on skipped cache-prefix job counts", async () => {
  const compiler = await readFile(resolve(projectDir, "src/compiler.cpp"), "utf8");
  assert.doesNotMatch(compiler, /\bnext_job\b/);
  assert.match(compiler, /constexpr unsigned long long job = 0/);
  assert.match(compiler, /"--threads=1"/);

  const pythonGraph = await loadDollyfileGraph(projectDir, "Dollyfile-python-pi");
  const cpython = pythonGraph.modules.find(({ name }) => name === "cpython");
  const buildInfo = cpython.slops.find(({ command }) =>
    command.includes("Modules/getbuildinfo.c"));
  assert.ok(buildInfo);
  assert.ok(buildInfo.command.includes('-DDATE="Jan 01 1970"'));
  assert.ok(buildInfo.command.includes('-DTIME="00:00:00"'));
});

test("host preparation scripts publish atomically and own their temporary paths", async () => {
  const scriptNames = await readdir(resolve(projectDir, "scripts"));
  for (const name of scriptNames) {
    const source = await readFile(resolve(projectDir, "scripts", name), "utf8");
    if (/(?:^|[($=;|& \t])mktemp[ \t]/m.test(source)) {
      assert.match(source, /trap .*EXIT|trap cleanup EXIT/, `${name} must trap cleanup`);
    }
    if (/\bmkdtemp\(/.test(source)) {
      assert.match(source, /finally\s*\{/, `${name} must clean temporary directories in finally`);
      assert.match(source, /await rm\(/, `${name} must remove temporary directories`);
    }
  }
  const archive = await readFile(
    resolve(projectDir, "scripts/build-source-tar.mjs"), "utf8",
  );
  const snapshots = await readFile(
    resolve(projectDir, "scripts/build-system-snapshot.mjs"), "utf8",
  );
  const build = await readFile(resolve(projectDir, "scripts/build.sh"), "utf8");
  const browserHarness = await readFile(
    resolve(projectDir, "scripts/browser-harness.mjs"), "utf8",
  );
  const piSource = await readFile(
    resolve(projectDir, "scripts/fetch-pi-source.sh"), "utf8",
  );
  const piPackages = await readFile(
    resolve(projectDir, "scripts/build-pi-runtime-packages.mjs"), "utf8",
  );
  const bison = await readFile(resolve(projectDir, "scripts/build-bison.sh"), "utf8");
  const awk = await readFile(resolve(projectDir, "scripts/generate-awk.sh"), "utf8");
  const nativeZig = await readFile(
    resolve(projectDir, "scripts/build-native-zig.sh"), "utf8",
  );
  const samurai = await readFile(
    resolve(projectDir, "scripts/prepare-samurai.sh"), "utf8",
  );
  const preparedSources = await Promise.all(
    ["git", "make", "zlib"].map((name) => readFile(
      resolve(projectDir, `scripts/prepare-${name}.sh`), "utf8",
    )),
  );
  const preparedCpython = await readFile(
    resolve(projectDir, "scripts/prepare-cpython.sh"), "utf8",
  );
  assert.match(archive, /await rename\(temporary, output\)/);
  assert.match(archive, /await rm\(temporary, \{ force: true \}\)/);
  assert.match(snapshots, /finally\s*\{[\s\S]*?rm\(temporarySnapshotPath/);
  assert.match(snapshots, /rename\(temporarySnapshotPath, snapshotPath\)/);
  assert.doesNotMatch(build, /rm -f[\s\S]*?dolly-\$\{image_name\}-system\.snapshot/);
  assert.match(
    browserHarness,
    /const server = await startServer\(\);[\s\S]*?try \{[\s\S]*?browserDownloadDirectory = await mkdtemp/,
  );
  assert.match(browserHarness, /if \(chrome !== null\)/);
  assert.match(piSource, /trap .*EXIT/);
  assert.match(piSource, /DOLLY_PI_SOURCE_COMMIT/);
  assert.match(piPackages, /package-lock\.json/);
  assert.match(piPackages, /pi-runtime-packages\.tar/);
  assert.doesNotMatch(bison, /bison-\$\{version\}-build/);
  assert.match(bison, /make DESTDIR="\$\{temporary_install\}" install/);
  assert.match(awk, /awk-\$\{recipe_hash:0:16\}/);
  assert.match(awk, /mktemp -d "\$\{project_dir\}\/build\/generated\/\.awk-parser/);
  assert.match(awk, /mv -T -- "\$\{temporary_dir\}" "\$\{generated_dir\}"/);
  assert.match(nativeZig, /temporary_object=/);
  assert.doesNotMatch(nativeZig, /sha256sum\s*\\\s*\n\s*"\$\{project_dir\}\/config\/source-pins\.sh"/);
  assert.match(nativeZig, /zig-source=\$\{DOLLY_ZIG_SHA256\}/);
  assert.match(nativeZig, /object_digest=[\s\S]*?dolly-native-zig-object=1[\s\S]*?native-build-options\.zig/);
  assert.match(nativeZig, /module_digest=[\s\S]*?dolly-native-zig-module=1[\s\S]*?abi\/dolly-0\.wat/);
  assert.match(nativeZig, /validate-command[\s\S]*?temporary_module/);
  assert.match(nativeZig, /\.\/bin\/dolly-cc "\$\{object\}" -o "\$\{temporary_module\}"/);
  assert.match(nativeZig, /mv -- "\$\{temporary_object_stamp\}" "\$\{object_stamp\}"/);
  assert.match(nativeZig, /mv -- "\$\{temporary_module_stamp\}" "\$\{module_stamp\}"/);
  assert.match(samurai, /trap cleanup EXIT/);
  assert.match(samurai, /patch[\s\S]*?-d "\$\{temporary\}"/);
  assert.match(samurai, /samurai-source-\$\{DOLLY_SAMURAI_COMMIT\}-\$\{recipe_hash:0:16\}/);
  assert.doesNotMatch(samurai, /rm -rf -- "\$\{output_dir\}"/);
  assert.match(samurai, /mv -T -- "\$\{temporary\}" "\$\{output_dir\}"/);
  for (const source of preparedSources) {
    assert.match(source, /recipe_hash=/);
    assert.match(source, /if \[\[ -d "\$\{output_dir\}" \]\]/);
    assert.doesNotMatch(source, /rm -rf -- "\$\{output_dir\}"/);
    assert.match(source, /mv -T --/);
  }
  assert.match(preparedCpython, /recipe_hash=/);
  assert.match(preparedCpython, /build-python=\$\{build_python_identity\}/);
  assert.doesNotMatch(preparedCpython, /rm -rf -- "\$\{output_dir\}"/);
  assert.match(preparedCpython, /mv -T -- "\$\{temporary\}" "\$\{output_dir\}"/);
});

test("snapshot creation and pruning share the canonical module recipe graph", async () => {
  const builder = await readFile(
    resolve(projectDir, "scripts/build-system-snapshot.mjs"), "utf8",
  );
  const pruner = await readFile(
    resolve(projectDir, "scripts/prune-stale-snapshots.mjs"), "utf8",
  );
  for (const source of [builder, pruner]) {
    assert.match(source, /loadDollyfileGraph/);
    assert.match(source, /recipeRecords\(graphs\.get\(image\)\)/);
  }
  assert.doesNotMatch(pruner, /definition\.extends/);
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
    ["gamedev", ["ar", "cc", "mkdir"]],
    ["ghostty", ["ar", "cc", "zig"]],
    ["git", ["ar", "cc", "mkdir", "rm"]],
    ["ninja", ["make"]],
    ["agent-tools", ["cc"]],
    ["pi", ["cc"]],
    ["quickjs", ["ar", "cc"]],
    ["sbase", ["cc"]],
    ["typescript", ["cc"]],
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
    "ghostty", "awk", "sbase", "python", "cpython", "bonnie", "gamedev",
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
  assert.deepEqual(headers("core-tools"), ["libc"]);
  assert.deepEqual(headers("download"), ["libc", "download"]);
  assert.deepEqual(headers("cpp"), ["libc"]);
  assert.deepEqual(headers("ninja"), ["libc", "runtime"]);
  assert.deepEqual(headers("curl"), ["libc", "http"]);
  assert.deepEqual(headers("git"), ["libc", "runtime", "curl", "zlib"]);
  assert.deepEqual(headers("quickjs"), ["libc", "runtime", "http", "download"]);
  assert.deepEqual(headers("pi"), ["libc", "quickjs-runner"]);
  assert.deepEqual(headers("python"), ["curl", "libc", "runtime", "zlib"]);
  assert.deepEqual(headers("cpython"), ["libc", "runtime", "zlib"]);
  assert.deepEqual(headers("bonnie"), ["curl", "libc", "runtime"]);
  assert.deepEqual(headers("gamedev"), ["libc", "display"]);

  const exportedHeaders = (name) => modules.get(name).exports
    .filter(({ type }) => type === "HEADER")
    .map(({ name: header }) => header);
  assert.deepEqual(exportedHeaders("zlib"), ["zlib", "zconf"]);
  assert.deepEqual(exportedHeaders("curl"), ["curl"]);
  assert.deepEqual(exportedHeaders("quickjs"), ["quickjs-runner"]);
  assert.deepEqual(exportedHeaders("ghostty"), ["ghostty-vt"]);
  assert.deepEqual(exportedHeaders("gamedev"), ["raylib", "box3d", "dolly-raylib"]);

  const ghostty = modules.get("ghostty");
  assert.ok(ghostty.exports.some(({ type, name }) => type === "LIB" && name === "display"));
  assert.ok(ghostty.exports.some(({ type, name, details }) =>
    type === "ENV" && name === "DISPLAY" && details[0] === "/usr/lib/libdisplay.so"));
  assert.equal(ghostty.exports.some(({ type, name }) =>
    type === "FILE" && name === "display-wasm"), false);
  assert.ok(ghostty.files.some(({ path }) =>
    path === "/usr/share/fonts/IosevkaTerm-SemiBold.ttf"));
});

test("the experiment has one execution form, no KEEP state, and no extras module", async () => {
  const names = await readdir(resolve(projectDir, "modules"));
  for (const name of [...imageSpecs.map(({ filename }) => filename), ...names.map((entry) => `modules/${entry}`)]) {
    const source = await readFile(resolve(projectDir, name), "utf8");
    assert.doesNotMatch(source, /^(?:RUN|CHECK|KEEP|KEEP-TREE|WORKDIR)\b/m, name);
  }
  const graph = await loadDollyfileGraph(projectDir);
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

test("SLOP commands require an earlier tool declaration", async () => {
  const fixture = await mkdtemp(resolve(tmpdir(), "dolly-slop-tools-"));
  try {
    await mkdir(resolve(fixture, "modules"));
    const provider = "DOLLY 2\nMODULE provider\n\nEXPORTS TOOL cc\n";
    const invalid = `DOLLY 2
MODULE invalid

REQUIRES TOOL cc
SLOP surprise --version
`;
    await Promise.all([
      writeFile(resolve(fixture, "modules/provider.dm"), provider),
      writeFile(resolve(fixture, "modules/invalid.dm"), invalid),
    ]);
    await writeFile(resolve(fixture, "Dollyfile"), `DOLLY 2
IMAGE default

USE HOST /modules/provider.dm ${digest(provider)}
USE HOST /modules/invalid.dm  ${digest(invalid)}

ENTRY /bin/cc
`);
    await assert.rejects(
      loadDollyfileGraph(fixture),
      /SLOP command surprise must be declared by an earlier REQUIRES TOOL or EXPORTS TOOL/,
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("a consumer cannot use a tool required only by another module", async () => {
  const fixture = await mkdtemp(resolve(tmpdir(), "dolly-nested-tools-"));
  try {
    await mkdir(resolve(fixture, "modules"));
    const seed = "DOLLY 2\nMODULE seed\n\nEXPORTS TOOL cc\n";
    const maker = `DOLLY 2
MODULE maker

REQUIRES TOOL cc
EXPORTS TOOL make
`;
    const consumer = (command) => `DOLLY 2
MODULE consumer

REQUIRES TOOL make
SLOP ${command} --version
`;
    await Promise.all([
      writeFile(resolve(fixture, "modules/seed.dm"), seed),
      writeFile(resolve(fixture, "modules/maker.dm"), maker),
    ]);
    const writeImage = async (command) => {
      const source = consumer(command);
      await writeFile(resolve(fixture, "modules/consumer.dm"), source);
      await writeFile(resolve(fixture, "Dollyfile"), `DOLLY 2
IMAGE default

USE HOST /modules/seed.dm     ${digest(seed)}
USE HOST /modules/maker.dm    ${digest(maker)}
USE HOST /modules/consumer.dm ${digest(source)}

ENTRY /bin/make
`);
    };
    await writeImage("cc");
    await assert.rejects(loadDollyfileGraph(fixture), /SLOP command cc must be declared/);
    await writeImage("make");
    const graph = await loadDollyfileGraph(fixture);
    assert.ok(graph.modules.find(({ name }) => name === "maker"));
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("format and graph linting runs before the expensive runtime build", async () => {
  assert.throws(
    () => inspectDollyfile(`DOLLY 2
SOURCE HOST /static/input /tmp/input ${"0".repeat(64)}
MODULE bad
`, "modules/bad.dm"),
    /expected IMAGE or MODULE/,
  );
  const build = await readFile(resolve(projectDir, "scripts/build.sh"), "utf8");
  const lint = 'node "${project_dir}/scripts/lint-dollyfiles.mjs"';
  assert.ok(build.indexOf(lint) > 0);
  assert.ok(build.indexOf(lint) < build.indexOf("podman run"));
  assert.ok(build.indexOf(lint) < build.indexOf("fetch-sbase.sh"));
});
