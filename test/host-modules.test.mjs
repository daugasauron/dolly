import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { executableHostRequirements, checkHostAbi } from "../host/requirements.mjs";
import { createDollyfileGraphLoader } from "../scripts/dollyfile-graph.mjs";
import { discoverImageDefinitions } from "../scripts/image-definitions.mjs";

const digest = value => createHash("sha256").update(value).digest("hex");
test("retained images declare only their runtime providers", async () => {
  const root = new URL("../", import.meta.url).pathname;
  const load = createDollyfileGraphLoader(root);
  const interactive = ["display@0", "download@0", "http@0", "snapshot@0", "upload@0"];
  const core = {
    default: interactive, system: interactive, "gpu-sdk": [...interactive, "gpu@0"],
    "audio-sdk": [...interactive, "audio@0"], "system-build": [], "system-tools": ["display@0"], "zig-build": [],
    "ghostty-build": ["display@0"],
  };
  const optional = new Set(["audio@0", "build@0", "gpu@0", "threads@0"]);
  for (const image of await discoverImageDefinitions(root)) {
    const requirements = (await load(image.filename)).root.hostRequirements;
    if (core[image.image]) assert.deepEqual(requirements, core[image.image].toSorted(), image.image);
    const base = requirements.filter(name => !optional.has(name));
    assert.ok([[], ["display@0"], interactive].some(allowed => base.join() === allowed.join()), image.image);
    const headless = ["system-build", "zig-build"].includes(image.image) || image.parsed.role === "package";
    assert.equal(base.includes("display@0"), !headless, image.image);
  }
});
test("build graph and artifact requirements inherit FROM and USE, not COPY", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dolly-host-modules-"));
  try {
    await mkdir(join(dir, "modules"));
    const base = "DOLLY 6\nAPPLICATION base\nREQUIRES HOST display@0\nENTRY /bin/slop\n";
    const donor = "DOLLY 6\nAPPLICATION donor\nREQUIRES HOST threads@0\nENTRY /bin/slop\n";
    const child = "DOLLY 6\nMODULE child\nREQUIRES HOST gpu@0\n";
    const root = `DOLLY 6\nAPPLICATION default\nFROM https://daugasauron.com/Dollyfile-base ${digest(base)}\nCOPY https://daugasauron.com/Dollyfile-donor ${digest(donor)} /usr /usr\nUSE https://daugasauron.com/modules/child.dm ${digest(child)}\nREQUIRES HOST http@0\nENTRY /bin/slop\n`;
    const sources = new Map([["/Dollyfile", root], ["/Dollyfile-base", base], ["/Dollyfile-donor", donor], ["/modules/child.dm", child]]);
    for (const [path, source] of sources) await writeFile(join(dir, path.slice(1)), source);
    const graph = await createDollyfileGraphLoader(dir)();
    assert.deepEqual(graph.root.hostRequirements, ["display@0", "gpu@0", "http@0"]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("executable requirements reject malformed records and incompatible providers", () => {
  const layout = digest("http layout"), other = digest("another http layout");
  const record = (name, version = 0, abi = layout) => {
    const data = new Uint8Array(72);
    data.set(new TextEncoder().encode(name));
    new DataView(data.buffer).setUint32(32, version, true);
    data.set(Buffer.from(abi, "hex"), 40);
    return data;
  };
  const parse = (...records) => executableHostRequirements({customSectionData:
    records.map(data => ({name: "dolly.host", data}))});
  assert.deepEqual([...parse(record("http"), record("gpu"), record("http"))], [["http@0", layout], ["gpu@0", layout]]);
  assert.throws(() => parse(record("http"), record("http", 1)));
  assert.throws(() => parse(record("http"), record("http", 0, other)), /conflicting/);
  for (const data of [new Uint8Array(), new Uint8Array(71), record(""), record("GPU"), record("http", 65536)]) {
    assert.throws(() => parse(data));
  }
  const padding = record("gpu"); padding[8] = 1;
  assert.throws(() => parse(padding));
  const reserved = record("gpu"); reserved[36] = 1;
  assert.throws(() => parse(reserved));
  assert.throws(() => parse(...Array.from({length: 65}, () => record("gpu"))));
  const provided = new Map([["http@0", layout], ["gpu@0", layout]]);
  assert.doesNotThrow(() => checkHostAbi(parse(record("http")), provided));
  assert.throws(() => checkHostAbi(parse(record("http", 1)), provided), /http@1 is unsupported/);
  assert.throws(() => checkHostAbi(parse(record("audio")), provided), /audio@0 is unsupported/);
  assert.throws(() => checkHostAbi(parse(record("http", 0, other)), provided), /http@0 has a different layout/);
});
