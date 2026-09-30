import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { executableHostRequirements, checkHostAbi } from "../src/host/requirements.mjs";
import { createDollyfileGraphLoader } from "../scripts/dollyfile-graph.mjs";
import { discoverImageDefinitions } from "../scripts/image-definitions.mjs";

const digest = value => createHash("sha256").update(value).digest("hex");
test("retained images declare only their runtime providers using Dollyfile 4", async () => {
  const root = new URL("../", import.meta.url).pathname;
  const load = createDollyfileGraphLoader(root);
  const graphics = new Set(["gpu-sdk", "gpu-fluid", "pi-local", "dollyfile-studio", "slopyard", "zero-ad"]);
  const audio = new Set(["audio-sdk", "zero-ad"]);
  const interactive = new Set("default audio-sdk bhop classicube codex dollyfile-studio gamedev-sdk gpu-fluid gpu-sdk javascript neovim pi pi-local pi-runtime python python-runtime rts-arena rust-tools slopyard system zero-ad".split(" "));
  for (const image of await discoverImageDefinitions(root)) {
    const graph = await load(image.filename);
    const expected = interactive.has(image.image)
      ? ["display@0", "download@0", "http@0", "snapshot@0", "upload@0"] : [];
    if (graphics.has(image.image)) expected.push("gpu@0");
    if (audio.has(image.image)) expected.push("audio@0");
    if (image.image === "slopyard") expected.push("threads@0");
    assert.deepEqual(graph.root.hostRequirements, expected.sort(), image.image);
  }
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
    assert.deepEqual(graph.root.hostRequirements, ["display@0", "gpu@0", "http@0"]);
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
