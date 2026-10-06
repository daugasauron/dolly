import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { loadDollyfileGraph, recipeRecords } from "../scripts/dollyfile-graph.mjs";
import { discoverImageDefinitions, selectImageDefinitions } from "../scripts/image-definitions.mjs";
import { renderDollyfilePage } from "../scripts/render-dollyfile-view.mjs";
import { updateRecipePins } from "../scripts/update-recipe-pins.mjs";
import { lintDollyfiles } from "../scripts/lint-dollyfiles.mjs";
import { recipeFiles } from "../scripts/recipe-files.mjs";

const project = resolve(import.meta.dirname, "..");
const digest = source => createHash("sha256").update(source).digest("hex");
const url = path => `https://daugasauron.com/${path}`;

test("every catalog recipe graph lints", () => lintDollyfiles(project));

test("lint names the runtime line a recipe lacks", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "dolly-lint-runtime-"));
  try {
    await writeFile(resolve(directory, "Dollyfile"), "DOLLY 6\nAPPLICATION default\nREQUIRES HOST display@0\nENTRY /bin/slop\n");
    await assert.rejects(lintDollyfiles(directory), /add REQUIRES HOST runtime@0/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("lint refuses an ENTRY program that no recipe of the image declares", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "dolly-lint-entry-"));
  try {
    const hosts = "REQUIRES HOST runtime@0\nREQUIRES HOST display@0\n";
    const core = "DOLLY 6\nPACKAGE core\nREQUIRES HOST runtime@0\nEXPORTS TOOL slop\nEXPORTS TOOL foreground\n";
    const install = `INSTALL ${url("Dollyfile-core")} ${digest(core)}\n`;
    const base = `DOLLY 6\nTOOLCHAIN base\n${hosts}${install}FILE /etc/dolly/init.slop\n    true\nFOLDER /usr/share/base\n`;
    const from = `FROM ${url("Dollyfile-base")} ${digest(base)}\n`;
    // A package keeps nothing of the base it is built in.
    const pkg = `DOLLY 6\nPACKAGE pkg\n${hosts}${from}EXPORTS TOOL rg\n`;
    for (const [name, text] of [["-core", core], ["-base", base], ["-pkg", pkg]]) {
      await writeFile(resolve(directory, `Dollyfile${name}`), text);
    }
    const lint = async rows => {
      await writeFile(resolve(directory, "Dollyfile"), `DOLLY 6\nAPPLICATION default\n${hosts}${rows}`);
      return lintDollyfiles(directory);
    };
    const game = "SLOP cc /tmp/game.c -o /usr/bin/game\n";
    for (const rows of [
      `${from}ENTRY /bin/foreground -i /bin/slop /etc/dolly/init.slop\n`,
      `${from}${game}EXPORTS TOOL game\nENTRY /bin/foreground -i /usr/bin/game --level 2\n`,
      `${from}${game}FILE /usr/bin/game\nENTRY /usr/bin/game\n`,
      `${from}ENTRY /usr/share/base/start\n`,
      `${install}INSTALL ${url("Dollyfile-pkg")} ${digest(pkg)}\nENTRY /bin/foreground /usr/bin/rg\n`,
      // Only the build knows which arguments name files.
      `${from}ENTRY /bin/slop /usr/share/unknown /workspace/notes\n`,
    ]) await lint(rows);
    await assert.rejects(lint(`${from}${game}ENTRY /bin/foreground -i /usr/bin/game\n`),
      /Dollyfile: ENTRY program \/usr\/bin\/game .*add EXPORTS TOOL game or FILE \/usr\/bin\/game$/);
    await assert.rejects(lint(`${from}${game}ENTRY /usr/bin/game\n`), /add EXPORTS TOOL game/);
    await assert.rejects(lint(`INSTALL ${url("Dollyfile-pkg")} ${digest(pkg)}\nENTRY /bin/foreground /usr/bin/rg\n`),
      /ENTRY program \/bin\/foreground /);
    await assert.rejects(lint(`${from}ENTRY /bin/foreground -i /workspace/game\n`), /\/workspace\/game is in scratch/);
    await assert.rejects(lint(`${from}ENTRY /bin/foreground -i game\n`), /absolute path of a program/);
    await assert.rejects(lint(`${from}ENTRY /bin/foreground -i\n`), /absolute path of a program/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("pin updates change only digest operands, not matching paths or comments", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "dolly-pin-operands-"));
  try {
    const old = "0".repeat(64), payload = "new source bytes\n";
    const base = "DOLLY 6\nTOOLCHAIN base\nENTRY /bin/slop\n";
    const child = "DOLLY 6\nPACKAGE child\nSLOP true\n";
    await mkdir(resolve(directory, "dist/static"), { recursive: true });
    await writeFile(resolve(directory, "dist/static", old), payload);
    await writeFile(resolve(directory, "Dollyfile-base"), base);
    await writeFile(resolve(directory, "Dollyfile-child"), child);
    const recipe = (sourcePin, basePin, childPin) => `DOLLY 6
APPLICATION default
FROM https://daugasauron.com/Dollyfile-base '${basePin}' # ${old}
SOURCE https://daugasauron.com/dist/static/${old} \\ # ${old}
  "${sourcePin}" \\
  /tmp/${old} # ${old}
COPY https://daugasauron.com/Dollyfile-base ${basePin} /usr/share/${old} /usr/share/${old}
INSTALL https://daugasauron.com/Dollyfile-child \\ # ${old}
  ${childPin}
FILE /usr/share/note
    ${old}
ENTRY /bin/slop
`;
    await writeFile(resolve(directory, "Dollyfile"), recipe(old, old, old));
    await updateRecipePins(directory, "all");
    const expected = recipe(digest(payload), digest(base), digest(child));
    assert.equal(await readFile(resolve(directory, "Dollyfile"), "utf8"), expected);
    await updateRecipePins(directory, "all");
    assert.equal(await readFile(resolve(directory, "Dollyfile"), "utf8"), expected, "second update is byte-identical");
    await loadDollyfileGraph(directory);
    await writeFile(resolve(directory, "Dollyfile"), expected.replace(
      `COPY https://daugasauron.com/Dollyfile-base ${digest(base)} `, `COPY https://daugasauron.com/Dollyfile-base ${old} `));
    await assert.rejects(loadDollyfileGraph(directory), /stale recipe pin/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("images separate reusable toolchains and packages from applications", async () => {
  const core = {
    "system-build": [], zlib: ["system-build"], curl: ["system-build"], gzip: ["system-build", "zlib"],
    "zig-build": ["system-build"], "ghostty-build": ["zig-build"], display: ["ghostty-build"],
    "system-tools": ["system-build", "zlib", "gzip", "curl", "display"], system: ["system-tools"],
    default: ["system"], "gpu-sdk": ["system"], "audio-sdk": ["system"],
  };
  const files = await recipeFiles(project);
  const definitions = await discoverImageDefinitions(project);
  for (const definition of definitions) {
    const graph = await loadDollyfileGraph(project, definition.filename);
    const dependencies = [...new Set(graph.artifacts.map(artifact => artifact.image))];
    const records = recipeRecords(graph);
    if (core[definition.image]) {
      assert.deepEqual(dependencies, core[definition.image], definition.image);
      assert.deepEqual(records.filter(record => files.get(record.locator).startsWith("demos/")), [],
        `core image ${definition.image} uses demo recipes`);
    }
    assert.equal(graph.exporters.has("TOOL:zig"), ["zig-build", "ghostty-build"].includes(definition.image));
    // A package carries its builder's chain as provenance, nothing of its files.
    if (!graph.root.hostRequirements.includes("display@0") && definition.parsed.role !== "package") {
      assert.equal(graph.exporters.has("ENV:DISPLAY"), false, definition.image);
      assert.equal(records.some(record => record.name === "ghostty-build"), false, definition.image);
    }
    assert.equal(records.at(-1).name, definition.image);
    assert.equal(new Set(records.map(record => record.locator)).size, records.length);
    const page = renderDollyfilePage(graph.root, graph);
    for (const dependency of dependencies) {
      assert.ok(page.includes(`/view/${dependency}/"`), `${definition.image} must link its ${dependency} dependency`);
      assert.ok(records.some(record => record.name === dependency));
    }
  }
  assert.deepEqual((await selectImageDefinitions(definitions, "all")).map(item => item.image),
    definitions.map(item => item.image));
  for (const list of ["config/github-pages-images.txt", "config/domain-pages-images.txt"]) {
    await selectImageDefinitions(definitions, (await readFile(resolve(project, list), "utf8")).trim().split("\n").join(","));
  }
});

test("demo recipes are published at their checkout paths and names stay unique", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "dolly-demo-recipes-"));
  try {
    await mkdir(resolve(directory, "demos/example"), { recursive: true });
    const extra = "DOLLY 6\nPACKAGE extra\nEXPORTS ENV EXTRA 1\n";
    const base = "DOLLY 6\nAPPLICATION default\nENTRY /bin/slop\n";
    await writeFile(resolve(directory, "Dollyfile"), base);
    await writeFile(resolve(directory, "demos/example/Dollyfile-extra"), extra);
    await writeFile(resolve(directory, "demos/example/Dollyfile-example"),
      `DOLLY 6\nAPPLICATION example\nFROM ${url("Dollyfile")} ${digest(base)}\nINSTALL ${url("demos/example/Dollyfile-extra")} ${digest(extra)}\nENTRY /bin/slop\n`);
    assert.deepEqual((await discoverImageDefinitions(directory)).map(({ filename }) => filename),
      ["Dollyfile", "demos/example/Dollyfile-example", "demos/example/Dollyfile-extra"]);
    const graph = await loadDollyfileGraph(directory, "demos/example/Dollyfile-example");
    assert.deepEqual(recipeRecords(graph).map(record => record.locator),
      [url("Dollyfile"), url("demos/example/Dollyfile-extra"), url("demos/example/Dollyfile-example")]);
    assert.deepEqual(graph.exporters.get("ENV:EXTRA").exported.details, ["1"]);
    await writeFile(resolve(directory, "Dollyfile-extra"), extra);
    await assert.rejects(recipeFiles(directory), /Dollyfile-extra is already/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("roles decide what FROM, INSTALL and COPY import; host requirements are never inherited", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "dolly-roles-"));
  try {
    const base = "DOLLY 6\nTOOLCHAIN base\nREQUIRES HOST display@0\nEXPORTS ENV DISPLAY /usr/lib/libdisplay.so\nEXPORTS TOOL cc\nENTRY /bin/slop\n";
    const pkg = `DOLLY 6\nPACKAGE pkg\nREQUIRES HOST threads@0\nFROM ${url("Dollyfile-base")} ${digest(base)}\nEXPORTS TOOL rg\nEXPORTS ENV RG 1\n`;
    // addon's own declaration precedes the install and still wins.
    const addon = `DOLLY 6\nPACKAGE addon\nREQUIRES HOST threads@0\nEXPORTS TOOL rg\nINSTALL ${url("Dollyfile-pkg")} ${digest(pkg)}\n`;
    const files = {
      "Dollyfile-base": base, "Dollyfile-pkg": pkg, "Dollyfile-addon": addon,
      "Dollyfile": `DOLLY 6\nAPPLICATION default\nREQUIRES HOST display@0\nREQUIRES HOST threads@0\nFROM ${url("Dollyfile-base")} ${digest(base)}\nINSTALL ${url("Dollyfile-addon")} ${digest(addon)}\nENTRY /bin/slop\n`,
      "Dollyfile-copier": `DOLLY 6\nTOOLCHAIN copier\nCOPY ${url("Dollyfile-pkg")} ${digest(pkg)} /usr/bin/rg /usr/bin/rg\n`,
      "Dollyfile-on-pkg": `DOLLY 6\nAPPLICATION on-pkg\nFROM ${url("Dollyfile-pkg")} ${digest(pkg)}\nENTRY /bin/slop\n`,
      "Dollyfile-installs-base": `DOLLY 6\nAPPLICATION installs-base\nINSTALL ${url("Dollyfile-base")} ${digest(base)}\nENTRY /bin/slop\n`,
      "Dollyfile-undeclared": `DOLLY 6\nAPPLICATION undeclared\nREQUIRES HOST display@0\nFROM ${url("Dollyfile-base")} ${digest(base)}\nINSTALL ${url("Dollyfile-pkg")} ${digest(pkg)}\nENTRY /bin/slop\n`,
      "Dollyfile-silent": `DOLLY 6\nAPPLICATION silent\nFROM ${url("Dollyfile-base")} ${digest(base)}\nENTRY /bin/slop\n`,
    };
    for (const [path, text] of Object.entries(files)) await writeFile(resolve(directory, path), text);
    const packageGraph = await loadDollyfileGraph(directory, "Dollyfile-pkg");
    assert.deepEqual([...packageGraph.exporters.keys()], ["TOOL:rg", "ENV:RG"], "a package keeps nothing of its base");
    const graph = await loadDollyfileGraph(directory);
    assert.deepEqual([...graph.exporters.keys()].sort(), ["ENV:DISPLAY", "ENV:RG", "TOOL:cc", "TOOL:rg"]);
    assert.equal(graph.exporters.get("TOOL:rg").module.name, "addon");
    assert.deepEqual(graph.root.hostRequirements, ["display@0", "threads@0"]);
    assert.deepEqual(graph.artifacts.map(({ operation, image }) => `${operation} ${image}`), ["from base", "install addon"]);
    const copier = await loadDollyfileGraph(directory, "Dollyfile-copier");
    assert.deepEqual([...copier.exporters.keys()], []);
    assert.deepEqual(copier.root.hostRequirements, []);
    // The base's display@0 is not inherited: silent declares nothing.
    assert.deepEqual((await loadDollyfileGraph(directory, "Dollyfile-silent")).root.hostRequirements, []);
    await assert.rejects(loadDollyfileGraph(directory, "Dollyfile-on-pkg"), /pkg is a package/);
    await assert.rejects(loadDollyfileGraph(directory, "Dollyfile-installs-base"), /base is a toolchain/);
    await assert.rejects(loadDollyfileGraph(directory, "Dollyfile-undeclared"), /pkg needs REQUIRES HOST threads@0/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
