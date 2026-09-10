import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { inspectDollyfile } from "../src/dollyfile-view.mjs";
import { loadDollyfileGraph, recipeRecords } from "../scripts/dollyfile-graph.mjs";
import { discoverImageDefinitions, inspectStaticSources, selectImageDefinitions } from "../scripts/image-definitions.mjs";
import { renderDollyfilePage } from "../scripts/render-dollyfile-view.mjs";
import { updateRecipePins } from "../scripts/update-module-pins.mjs";

const project = resolve(import.meta.dirname, "..");
const digest = source => createHash("sha256").update(source).digest("hex");

test("pin updates change only digest operands, not matching paths or comments", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "dolly-pin-operands-"));
  try {
    const old = "0".repeat(64), payload = "new source bytes\n";
    const base = "DOLLY 3\nIMAGE base\nENTRY /bin/slop\n";
    const module = "DOLLY 3\nMODULE child\nSLOP true\n";
    await mkdir(resolve(directory, "modules"));
    await mkdir(resolve(directory, "dist/static"), { recursive: true });
    await writeFile(resolve(directory, "dist/static", old), payload);
    await writeFile(resolve(directory, "Dollyfile-base"), base);
    await writeFile(resolve(directory, "modules/child.dm"), module);
    const recipe = (sourcePin, basePin, modulePin) => `DOLLY 3
IMAGE default
FROM HOST /Dollyfile-base '${basePin}' # ${old}
SOURCE HOST /static/${old} \\ # ${old}
  /tmp/${old} \\
  "${sourcePin}" # ${old}
COPY FROM HOST /Dollyfile-base ${basePin} /usr/share/${old} /usr/share/${old}
USE HOST /modules/child.dm \\ # ${old}
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
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("unreferenced module sources are admitted without staging their inputs or executing them", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "dolly-module-source-"));
  try {
    await mkdir(resolve(directory, "modules"));
    await writeFile(resolve(directory, "Dollyfile"), "DOLLY 3\nIMAGE default\nENTRY /bin/slop\n");
    const source = `DOLLY 3\nMODULE addon\nREQUIRES TOOL arbitrary\nSOURCE HOST /static/not-staged /tmp/input ${"0".repeat(64)}\n`;
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
  const expected = {
    "ghostty-build": [], "system-build": ["ghostty-build"],
    system: ["system-build", "ripgrep", "fd-build"], default: ["system"], javascript: ["system"],
    "rust-sdk": ["system-build"], "rust-tools": ["rust-sdk"],
    ripgrep: ["rust-tools"], "fd-build": ["rust-tools"], "protox-build": ["rust-tools"],
    "codex-build": ["rust-tools", "protox-build"], codex: ["default", "codex-build"],
    "external-source": ["system"],
    "dollyfile-studio": ["pi-local", "neovim-build"],
    "cmake-build": ["system"], "neovim-build": ["cmake-build"],
    "sdl2-build": ["cmake-build"], "rts-build": ["sdl2-build"],
    "classicube-build": ["sdl2-build"], classicube: ["pi-runtime", "classicube-build", "sdl2-build"],
    "rts-arena": ["pi-runtime", "rts-build"],
    neovim: ["system", "neovim-build"],
    "pi-runtime": ["javascript"], pi: ["pi-runtime"], "pi-local": ["pi"],
    "python-runtime": ["system"], python: ["python-runtime"],
    "gamedev-sdk": ["system"], gamedev: ["pi", "gamedev-sdk"],
    "gamedev-phone": ["gamedev"],
    bhop: ["gamedev"],
    "python-pi": ["pi-runtime", "python"],
  };
  for (const definition of await discoverImageDefinitions(project)) {
    const graph = await loadDollyfileGraph(project, definition.filename);
    assert.deepEqual([...new Set(graph.artifacts.map(artifact => artifact.image))], expected[definition.image]);
    assert.equal(graph.exporters.has("TOOL:zig"), definition.image === "ghostty-build");
    if (definition.image === "neovim") {
      assert.deepEqual(graph.root.entry, ["/bin/foreground", "-i", "/bin/slop", "/etc/dolly/init.slop"]);
      const startup = graph.root.files.find(file => file.path === "/etc/dolly/init.slop").body;
      assert.match(startup, /foreground \/usr\/bin\/nvim \/usr\/share\/nvim\/welcome.txt/);
      assert.match(startup, /foreground -i \/bin\/slop/);
      assert.ok(graph.root.files.some(file => file.path === "/usr/share/nvim/welcome.txt"));
      assert.equal(graph.exporters.has("TOOL:nvim"), true);
      assert.equal(graph.exporters.has("TOOL:cmake"), false);
      assert.equal(graph.artifacts.filter(artifact => artifact.copy)
        .some(artifact => /\/tmp\/|\/include\/|cmake/.test(artifact.source)), false);
    }
    const records = recipeRecords(graph);
    assert.equal(records.at(-1).name, definition.image);
    assert.equal(new Set(records.map(record => record.locator)).size, records.length);
    const pages = graph.records.map(record => renderDollyfilePage(record, graph));
    for (const dependency of expected[definition.image]) {
      assert.ok(pages.some(page => page.includes(`/view/${dependency}/"`)), `${definition.image} must link its ${dependency} dependency`);
      assert.ok(records.some(record => record.kind === "image" && record.name === dependency));
    }
    if (definition.image === "python-pi") {
      assert.equal(graph.root.uses.length, 1, "only integration executes in the combined image");
      assert.deepEqual(graph.root.artifacts.filter(artifact => artifact.copy).map(({ source, destination }) => [source, destination]),
        ["/usr/bin/python", "/usr/bin/python3", "/usr/bin/bonnie", "/usr/include/python3.14",
          "/usr/include/ffi.h", "/usr/include/ffitarget.h", "/usr/lib/python3.14", "/usr/lib/bonnie",
          "/usr/lib/libpython3.14.a", "/usr/lib/libffi.a", "/usr/share/licenses/cpython",
          "/usr/share/licenses/libffi", "/etc/bonnie"].map(path => [path, path]));
    }
  }
  const definitions = await discoverImageDefinitions(project);
  assert.deepEqual(new Set((await selectImageDefinitions(definitions, "python-pi")).map(item => item.image)),
    new Set(["python-pi", "pi-runtime", "javascript", "python", "python-runtime", "system", "ghostty-build",
      "system-build", "rust-sdk", "rust-tools", "ripgrep", "fd-build"]));
  const publicImages = (await readFile(resolve(project, "config/public-images.txt"), "utf8")).trim().split("\n");
  const selected = await selectImageDefinitions(definitions, publicImages.join(","));
  assert.deepEqual(selected.map(item => item.image), definitions
    .filter(item => !["codex", "codex-build", "protox-build"].includes(item.image)).map(item => item.image));
});

test("inspection permits repeated, mixed modules and unresolved runtime assertions", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "dolly-v3-"));
  try {
    await mkdir(resolve(directory, "modules"));
    const child = "DOLLY 3\nMODULE child\nFILE /usr/share/value\n    child\nEXPORTS FILE value /usr/share/value\n";
    const mixed = `DOLLY 3
MODULE mixed
EXPORTS FILE value /usr/share/value
REQUIRES TOOL whatever
SLOP LABEL=value implicit-tool; another-tool
USE HOST /modules/child.dm ${digest(child)}
FILE /usr/share/value
    replacement
USE HOST /modules/child.dm ${digest(child)}
REQUIRES TOOL whatever
EXPORTS ENV OPTIONS one
EXPORTS ENV OPTIONS APPEND two
`;
    await writeFile(resolve(directory, "modules/child.dm"), child);
    await writeFile(resolve(directory, "modules/mixed.dm"), mixed);
    await writeFile(resolve(directory, "modules/unused.dm"), "deliberately unused scratch recipe");
    await writeFile(resolve(directory, "Dollyfile"), `DOLLY 3\nIMAGE default\nUSE HOST /modules/mixed.dm ${digest(mixed)}\nSLOP arbitrary-command\nENTRY /bin/slop\n`);
    const graph = await loadDollyfileGraph(directory);
    assert.equal(graph.root.children[0].children.length, 2);
    assert.equal(graph.root.children[0].requirements.length, 2);
    assert.deepEqual(graph.exporters.get("FILE:value").exported.details, ["/usr/share/value"]);
    assert.deepEqual(recipeRecords(graph).map(record => record.name), ["child", "mixed", "default"]);
    const override = "DOLLY 3\nMODULE child\nEXPORTS ENV AUDIT_VALUE new\n";
    await writeFile(resolve(directory, "modules/child.dm"), override);
    await writeFile(resolve(directory, "Dollyfile"), `DOLLY 3\nIMAGE default\nEXPORTS ENV AUDIT_VALUE old\nUSE HOST /modules/child.dm ${digest(override)}\nENTRY /bin/slop\n`);
    const overridden = await loadDollyfileGraph(directory);
    assert.deepEqual(overridden.exporters.get("ENV:AUDIT_VALUE").exported.details, ["new"]);
    await writeFile(resolve(directory, "modules/child.dm"), child + "# changed\n");
    await assert.rejects(loadDollyfileGraph(directory), /stale recipe pin/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("comments cannot swallow declarations; FROM has one explicit starting position", () => {
  const recipe = inspectDollyfile("# trailing backslash \\\nDOLLY 3\nMODULE example\n# another \\\nSLOP undeclared\n");
  assert.equal(recipe.slops.length, 1);
  const pin = "0".repeat(64);
  assert.doesNotThrow(() => inspectDollyfile(`DOLLY 3\nIMAGE derived\nFROM HOST /Dollyfile ${pin}\nFILE /usr/share/value\n    hi\nENTRY /bin/slop\n`));
  assert.throws(() => inspectDollyfile(`DOLLY 3\nIMAGE derived\nSLOP build\nFROM HOST /Dollyfile ${pin}\nENTRY /bin/slop\n`), /FROM/);
  assert.throws(() => inspectDollyfile(`DOLLY 3\nMODULE example\nFROM HOST /Dollyfile ${pin}\n`), /FROM/);
  assert.throws(() => inspectDollyfile(`DOLLY 3\nMODULE example\nCOPY FROM HOST /Dollyfile ${pin} /usr /usr/../etc\n`), /COPY/);
  assert.throws(() => inspectDollyfile("DOLLY 2\nIMAGE old\nENTRY /bin/slop\n"), /DOLLY 3/);
});
