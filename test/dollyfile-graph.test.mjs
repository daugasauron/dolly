import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { loadDollyfileGraph, recipeRecords } from "../scripts/dollyfile-graph.mjs";
import { discoverImageDefinitions, inspectStaticSources, selectImageDefinitions } from "../scripts/image-definitions.mjs";
import { renderDollyfilePage } from "../scripts/render-dollyfile-view.mjs";
import { updateRecipePins } from "../scripts/update-module-pins.mjs";
import { lintDollyfiles } from "../scripts/lint-dollyfiles.mjs";
import { recipeFiles } from "../scripts/recipe-files.mjs";

const project = resolve(import.meta.dirname, "..");
const digest = source => createHash("sha256").update(source).digest("hex");

test("every catalog recipe graph lints", () => lintDollyfiles(project));

test("pin updates change only digest operands, not matching paths or comments", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "dolly-pin-operands-"));
  try {
    const old = "0".repeat(64), payload = "new source bytes\n";
    const base = "DOLLY 5\nIMAGE base\nENTRY /bin/slop\n";
    const module = "DOLLY 5\nMODULE child\nSLOP true\n";
    await mkdir(resolve(directory, "modules"));
    await mkdir(resolve(directory, "dist/static"), { recursive: true });
    await writeFile(resolve(directory, "dist/static", old), payload);
    await writeFile(resolve(directory, "Dollyfile-base"), base);
    await writeFile(resolve(directory, "modules/child.dm"), module);
    const recipe = (sourcePin, basePin, modulePin) => `DOLLY 5
IMAGE default
FROM https://daugasauron.com/Dollyfile-base '${basePin}' # ${old}
SOURCE https://daugasauron.com/static/${old} \\ # ${old}
  "${sourcePin}" \\
  /tmp/${old} # ${old}
COPY FROM https://daugasauron.com/Dollyfile-base ${basePin} /usr/share/${old} /usr/share/${old}
USE https://daugasauron.com/modules/child.dm \\ # ${old}
  ${modulePin}
FILE /usr/share/note
    ${old}
ENTRY /bin/slop
`;
    await writeFile(resolve(directory, "Dollyfile"), recipe(old, old, old));
    await updateRecipePins(directory, true);
    const expected = recipe(digest(payload), digest(base), digest(module));
    assert.equal(await readFile(resolve(directory, "Dollyfile"), "utf8"), expected);
    await updateRecipePins(directory, true);
    assert.equal(await readFile(resolve(directory, "Dollyfile"), "utf8"), expected, "second update is byte-identical");
    await loadDollyfileGraph(directory);
    await writeFile(resolve(directory, "Dollyfile"), expected.replace(
      `COPY FROM https://daugasauron.com/Dollyfile-base ${digest(base)} `, `COPY FROM https://daugasauron.com/Dollyfile-base ${old} `));
    await assert.rejects(loadDollyfileGraph(directory), /stale recipe pin/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("unreferenced module sources are admitted without staging their inputs or executing them", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "dolly-module-source-"));
  try {
    await mkdir(resolve(directory, "modules"));
    await writeFile(resolve(directory, "Dollyfile"), "DOLLY 5\nIMAGE default\nENTRY /bin/slop\n");
    const source = `DOLLY 5\nMODULE addon\nREQUIRES TOOL arbitrary\nSOURCE https://daugasauron.com/static/not-staged ${"0".repeat(64)} /tmp/input\n`;
    await writeFile(resolve(directory, "modules/addon.dm"), source);
    await writeFile(resolve(directory, "modules/draft.dm"), "unfinished recipe");
    await writeFile(resolve(directory, "modules/empty.dm"), "");
    await writeFile(resolve(directory, "modules/notes.txt"), "not a module");
    await symlink("../Dollyfile", resolve(directory, "modules/link.dm"));
    await mkdir(resolve(directory, "modules/directory.dm"));
    const definitions = await discoverImageDefinitions(directory);
    const sources = await inspectStaticSources(directory, definitions);
    assert.deepEqual(sources.map(source => source.path), ["/Dollyfile", "/modules/addon.dm", "/modules/draft.dm"]);
    assert.deepEqual(sources[1], { path: "/modules/addon.dm", sha256: digest(source), byteLength: Buffer.byteLength(source) });
    assert.deepEqual((await loadDollyfileGraph(directory)).modules, []);
    await writeFile(resolve(directory, "modules/addon.dm"), source + "# edited\n");
    assert.notEqual((await inspectStaticSources(directory, definitions))[1].sha256, sources[1].sha256);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("images separate reusable runtimes from applications and configuration", async () => {
  const core = {
    "system-build": [], "system-tools": ["system-build", "ghostty-build"], "zig-build": ["system-build"],
    "ghostty-build": ["zig-build"], system: ["system-tools"], default: ["system"], "gpu-sdk": ["system"],
    "audio-sdk": ["system"],
  };
  const files = await recipeFiles(project);
  const definitions = await discoverImageDefinitions(project);
  for (const definition of definitions) {
    const graph = await loadDollyfileGraph(project, definition.filename);
    const dependencies = [...new Set(graph.artifacts.map(artifact => artifact.image))];
    const records = recipeRecords(graph);
    if (core[definition.image]) {
      assert.deepEqual(dependencies, core[definition.image]);
      assert.deepEqual(records.filter(record => files.get(record.locator).startsWith("demos/")), [],
        `core image ${definition.image} uses demo recipes`);
    }
    assert.equal(graph.exporters.has("TOOL:zig"), ["zig-build", "ghostty-build"].includes(definition.image));
    if (!graph.root.hostRequirements.includes("display@0") && definition.image !== "ghostty-build") {
      assert.equal(graph.exporters.has("ENV:DISPLAY"), false, definition.image);
      assert.equal(records.some(record => record.name === "ghostty-build"), false, definition.image);
    }
    assert.equal(records.at(-1).name, definition.image);
    assert.equal(new Set(records.map(record => record.locator)).size, records.length);
    const pages = graph.records.map(record => renderDollyfilePage(record, graph));
    for (const dependency of dependencies) {
      assert.ok(pages.some(page => page.includes(`/view/${dependency}/"`)), `${definition.image} must link its ${dependency} dependency`);
      assert.ok(records.some(record => record.kind === "image" && record.name === dependency));
    }
  }
  assert.deepEqual((await selectImageDefinitions(definitions, "all")).map(item => item.image),
    definitions.map(item => item.image));
  for (const list of ["config/github-pages-images.txt", "config/domain-pages-images.txt"]) {
    await selectImageDefinitions(definitions, (await readFile(resolve(project, list), "utf8")).trim().split("\n").join(","));
  }
});

test("demo recipes share the flat logical namespace and names stay unique", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "dolly-demo-recipes-"));
  try {
    await mkdir(resolve(directory, "modules"));
    await mkdir(resolve(directory, "demos/example"), { recursive: true });
    const module = "DOLLY 5\nMODULE extra\nEXPORTS ENV EXTRA 1\n";
    const base = "DOLLY 5\nIMAGE default\nENTRY /bin/slop\n";
    await writeFile(resolve(directory, "Dollyfile"), base);
    await writeFile(resolve(directory, "demos/example/extra.dm"), module);
    await writeFile(resolve(directory, "demos/example/Dollyfile-example"),
      `DOLLY 5\nIMAGE example\nFROM https://daugasauron.com/Dollyfile ${digest(base)}\nUSE https://daugasauron.com/modules/extra.dm ${digest(module)}\nENTRY /bin/slop\n`);
    assert.deepEqual((await discoverImageDefinitions(directory)).map(({ filename, path }) => [filename, path]),
      [["Dollyfile", "Dollyfile"], ["Dollyfile-example", "demos/example/Dollyfile-example"]]);
    const graph = await loadDollyfileGraph(directory, "Dollyfile-example");
    assert.deepEqual(recipeRecords(graph).map(record => record.locator), ["https://daugasauron.com/Dollyfile",
      "https://daugasauron.com/modules/extra.dm", "https://daugasauron.com/Dollyfile-example"]);
    await writeFile(resolve(directory, "modules/extra.dm"), module);
    await assert.rejects(recipeFiles(directory), /\/modules\/extra\.dm is already/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("inspection permits repeated, mixed modules and unresolved runtime assertions", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "dolly-v3-"));
  try {
    await mkdir(resolve(directory, "modules"));
    const child = "DOLLY 5\nMODULE child\nFILE /usr/share/value\n    child\nEXPORTS FILE value /usr/share/value\n";
    const mixed = `DOLLY 5
MODULE mixed
EXPORTS FILE value /usr/share/value
REQUIRES TOOL whatever
SLOP LABEL=value implicit-tool; another-tool
USE https://daugasauron.com/modules/child.dm ${digest(child)}
FILE /usr/share/value
    replacement
USE https://daugasauron.com/modules/child.dm ${digest(child)}
REQUIRES TOOL whatever
EXPORTS ENV OPTIONS one
EXPORTS ENV OPTIONS APPEND two
`;
    await writeFile(resolve(directory, "modules/child.dm"), child);
    await writeFile(resolve(directory, "modules/mixed.dm"), mixed);
    await writeFile(resolve(directory, "modules/unused.dm"), "deliberately unused scratch recipe");
    await writeFile(resolve(directory, "Dollyfile"), `DOLLY 5\nIMAGE default\nUSE https://daugasauron.com/modules/mixed.dm ${digest(mixed)}\nSLOP arbitrary-command\nENTRY /bin/slop\n`);
    const graph = await loadDollyfileGraph(directory);
    assert.equal(graph.root.children[0].children.length, 2);
    assert.equal(graph.root.children[0].requirements.length, 2);
    assert.deepEqual(graph.exporters.get("FILE:value").exported.details, ["/usr/share/value"]);
    assert.deepEqual(recipeRecords(graph).map(record => record.name), ["child", "mixed", "default"]);
    const override = "DOLLY 5\nMODULE child\nEXPORTS ENV AUDIT_VALUE new\n";
    await writeFile(resolve(directory, "modules/child.dm"), override);
    await writeFile(resolve(directory, "Dollyfile"), `DOLLY 5\nIMAGE default\nEXPORTS ENV AUDIT_VALUE old\nUSE https://daugasauron.com/modules/child.dm ${digest(override)}\nENTRY /bin/slop\n`);
    const overridden = await loadDollyfileGraph(directory);
    assert.deepEqual(overridden.exporters.get("ENV:AUDIT_VALUE").exported.details, ["new"]);
    await writeFile(resolve(directory, "modules/child.dm"), child + "# changed\n");
    await assert.rejects(loadDollyfileGraph(directory), /stale recipe pin/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("repeated modules resolve requirements in their own caller scope", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "dolly-scopes-"));
  try {
    await mkdir(resolve(directory, "modules"));
    const sources = {
      first: "DOLLY 5\nMODULE first\nEXPORTS TOOL cc\n",
      second: "DOLLY 5\nMODULE second\nEXPORTS TOOL cc\n",
      consumer: "DOLLY 5\nMODULE consumer\nREQUIRES TOOL cc\n",
    };
    for (const [name, source] of Object.entries(sources)) {
      await writeFile(resolve(directory, `modules/${name}.dm`), source);
    }
    await writeFile(resolve(directory, "Dollyfile"), "DOLLY 5\nIMAGE default\n" +
      ["first", "consumer", "second", "consumer"].map(name =>
        `USE https://daugasauron.com/modules/${name}.dm ${digest(sources[name])}\n`).join("") + "ENTRY /bin/slop\n");
    const { root } = await loadDollyfileGraph(directory);
    assert.deepEqual([root.children[1], root.children[3]].map(record =>
      record.imports.get("TOOL:cc").module.name), ["first", "second"]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("imported images are separate builds outside the USE nesting limit", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "dolly-depth-"));
  try {
    await mkdir(resolve(directory, "modules"));
    async function nest(prefix, innermost) {
      let operation = innermost;
      for (let i = 14; i >= 0; i--) {
        const module = `DOLLY 5\nMODULE ${prefix}-${i}\n${operation}`;
        await writeFile(resolve(directory, `modules/${prefix}-${i}.dm`), module);
        operation = `USE https://daugasauron.com/modules/${prefix}-${i}.dm ${digest(module)}\n`;
      }
      return operation;
    }
    const base = `DOLLY 5\nIMAGE base\n${await nest("base", "")}ENTRY /bin/slop\n`;
    await writeFile(resolve(directory, "Dollyfile-base"), base);
    const copy = `COPY FROM https://daugasauron.com/Dollyfile-base ${digest(base)} /usr/share/value /usr/share/value\n`;
    await writeFile(resolve(directory, "Dollyfile"), `DOLLY 5\nIMAGE default\n${await nest("root", copy)}ENTRY /bin/slop\n`);
    assert.equal((await loadDollyfileGraph(directory)).artifacts.length, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
