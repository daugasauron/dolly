import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { inspectDollyfile } from "../src/dollyfile-view.mjs";
import { imageHostRequirements } from "../src/image-requirements.mjs";
import { hostRequirements, executableHostRequirements, checkHostAbi } from "../src/host/requirements.mjs";
import { createDollyfileGraphLoader } from "../scripts/dollyfile-graph.mjs";

const digest = value => createHash("sha256").update(value).digest("hex");
test("Dollyfile 4 host requirements are versioned declarations, not exported objects", () => {
  const source = requirement => `DOLLY 4\nMODULE test\n${requirement}\n`;
  assert.deepEqual(inspectDollyfile(source("REQUIRES HOST gpu@0\nREQUIRES HOST http@0\nREQUIRES HOST gpu@0")).hostRequirements,
    ["gpu@0", "http@0"]);
  for (const invalid of ["gpu", "gpu@01", "GPU@0", "gpu@-1", "gpu@65536", "gpu@0 extra"]) {
    assert.throws(() => inspectDollyfile(source(`REQUIRES HOST ${invalid}`)));
  }
  assert.throws(() => inspectDollyfile(source("EXPORTS HOST gpu@0")));
  assert.throws(() => inspectDollyfile(source("REQUIRES HOST gpu@0").replace("DOLLY 4", "DOLLY 3")));
  assert.throws(() => hostRequirements(["gpu@0", "gpu@1"]));
  assert.deepEqual(inspectDollyfile("DOLLY 3\nMODULE legacy\n").hostRequirements, []);
});

test("build graph and artifact requirements inherit FROM and USE, not COPY", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dolly-host-modules-"));
  try {
    await mkdir(join(dir, "modules"));
    const base = "DOLLY 4\nIMAGE base\nREQUIRES HOST display@0\nENTRY /bin/slop\n";
    const donor = "DOLLY 4\nIMAGE donor\nREQUIRES HOST threads@0\nENTRY /bin/slop\n";
    const child = "DOLLY 4\nMODULE child\nREQUIRES HOST gpu@0\n";
    const root = `DOLLY 4\nIMAGE default\nFROM HOST /Dollyfile-base ${digest(base)}\nCOPY FROM HOST /Dollyfile-donor ${digest(donor)} /usr /usr\nUSE HOST /modules/child.dm ${digest(child)}\nREQUIRES HOST http@0\nENTRY /bin/slop\n`;
    const sources = new Map([["/Dollyfile", root], ["/Dollyfile-base", base], ["/Dollyfile-donor", donor], ["/modules/child.dm", child]]);
    for (const [path, source] of sources) await writeFile(join(dir, path.slice(1)), source);
    const graph = await createDollyfileGraphLoader(dir)();
    const loaded = [];
    const observed = await imageHostRequirements(root, async ref => { loaded.push(ref.location); return sources.get(ref.location); });
    assert.deepEqual(observed, ["display@0", "gpu@0", "http@0"]);
    assert.deepEqual(graph.root.hostRequirements, observed);
    assert.deepEqual(loaded, ["/Dollyfile-base", "/modules/child.dm"]);
    sources.set("/modules/child.dm", child.replace("gpu@0", "http@1"));
    await assert.rejects(imageHostRequirements(root, async ref => sources.get(ref.location)));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("executable requirements reject malformed records and incompatible providers", () => {
  const record = (name, version = 0) => {
    const data = new Uint8Array(40);
    data.set(new TextEncoder().encode(name));
    new DataView(data.buffer).setUint32(32, version, true);
    return data;
  };
  const parse = (...records) => executableHostRequirements({customSectionData:
    records.map(data => ({name: "dolly.host", data}))});
  assert.deepEqual(parse(record("http"), record("runtime"), record("http")), ["http@0", "runtime@0"]);
  assert.throws(() => parse(record("http"), record("http", 1)));
  for (const data of [new Uint8Array(), new Uint8Array(39), record(""), record("GPU"), record("http", 65536)]) {
    assert.throws(() => parse(data));
  }
  const padding = record("gpu"); padding[8] = 1;
  assert.throws(() => parse(padding));
  const reserved = record("gpu"); reserved[36] = 1;
  assert.throws(() => parse(reserved));
  assert.throws(() => parse(...Array.from({length: 65}, () => record("gpu"))));
  assert.throws(() => checkHostAbi(["gpu@1"], ["gpu@0"]), /gpu@1/);
  assert.throws(() => checkHostAbi(["gpu@0"], ["http@0"]), /gpu@0/);
  assert.doesNotThrow(() => checkHostAbi(parse(record("gpu")), ["gpu@0", "runtime@0"]));
});
