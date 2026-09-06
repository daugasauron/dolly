import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { inspectDollyfile } from "../src/dollyfile-view.mjs";
import { loadDollyfileGraph, recipeRecords } from "../scripts/dollyfile-graph.mjs";
import { discoverImageDefinitions, selectImageDefinitions } from "../scripts/image-definitions.mjs";
import { renderDollyfilePage } from "../scripts/render-dollyfile-view.mjs";

const project = resolve(import.meta.dirname, "..");
const digest = source => createHash("sha256").update(source).digest("hex");

test("all five images use explicit artifact boundaries with source provenance", async () => {
  const expected = { default: [], pi: ["default"], python: ["default"], gamedev: ["pi"], "python-pi": ["pi", "python"] };
  for (const definition of await discoverImageDefinitions(project)) {
    const graph = await loadDollyfileGraph(project, definition.filename);
    assert.deepEqual([...new Set(graph.artifacts.map(artifact => artifact.image))], expected[definition.image]);
    const records = recipeRecords(graph);
    assert.equal(records.at(-1).name, definition.image);
    assert.equal(new Set(records.map(record => record.locator)).size, records.length);
    const page = renderDollyfilePage(graph.root, graph);
    for (const dependency of expected[definition.image]) {
      assert.ok(page.includes(`href="../../view/${dependency}/"`));
      assert.ok(records.some(record => record.kind === "image" && record.name === dependency));
    }
    if (definition.image === "python-pi") {
      assert.equal(graph.root.uses.length, 1, "only integration executes in the combined image");
      assert.deepEqual(graph.root.artifacts.filter(artifact => artifact.copy).map(({ source, destination }) => [source, destination]),
        [["/usr", "/usr"], ["/etc/bonnie", "/etc/bonnie"]]);
    }
  }
  const definitions = await discoverImageDefinitions(project);
  assert.deepEqual(new Set((await selectImageDefinitions(definitions, "python-pi")).map(item => item.image)),
    new Set(["python-pi", "pi", "python", "default"]));
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
