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
test("every image declares its complete host set itself", async () => {
  const root = new URL("../", import.meta.url).pathname;
  const load = createDollyfileGraphLoader(root);
  const terminal = ["runtime@0", "display@0", "input@0"];
  const interactive = [...terminal, "download@0", "http@0", "snapshot@0", "upload@0"];
  // Every image declares the runtime it is built on; the engine retained for
  // FROM builds uses http@0; download and upload tools arrive with
  // system-tools; a terminal draws with display@0 and reads keys with
  // input@0, which the display package alone does not ask for; default
  // installs packages with amy and runs the threaded tools they bring.
  const core = {
    default: [...interactive, "packages@0", "threads@0"], system: interactive, "gpu-sdk": [...interactive, "gpu@0"],
    "audio-sdk": [...interactive, "audio@0"], "system-build": ["runtime@0", "http@0"], "zig-build": ["runtime@0", "http@0"],
    "ghostty-build": [...terminal, "http@0"],
    "system-tools": [...terminal, "download@0", "http@0", "upload@0"],
    zlib: ["runtime@0"], gzip: ["runtime@0"], curl: ["runtime@0", "http@0"], display: ["runtime@0", "display@0"],
  };
  for (const image of await discoverImageDefinitions(root)) {
    const graph = await load(image.filename);
    assert.deepEqual(graph.root.hostRequirements, image.parsed.hostRequirements, `${image.image}: nothing inherited`);
    if (core[image.image]) assert.deepEqual(graph.root.hostRequirements, core[image.image].toSorted(), image.image);
    for (const module of image.parsed.entry ? ["display@0", "input@0"] : []) {
      assert.ok(graph.root.hostRequirements.includes(module), `${image.image} opens a terminal: ${module}`);
    }
  }
});
test("FROM, INSTALL and COPY carry no host requirements; a package's must be declared", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dolly-host-modules-"));
  try {
    const base = "DOLLY 6\nAPPLICATION base\nREQUIRES HOST display@0\nENTRY /bin/slop\n";
    const donor = "DOLLY 6\nAPPLICATION donor\nREQUIRES HOST threads@0\nENTRY /bin/slop\n";
    const pkg = "DOLLY 6\nPACKAGE pkg\nREQUIRES HOST gpu@0\nFILE /usr/share/pkg\n";
    const recipe = hosts => `DOLLY 6\nAPPLICATION default\n${hosts.map(host => `REQUIRES HOST ${host}\n`).join("")}FROM https://daugasauron.com/Dollyfile-base ${digest(base)}\nCOPY https://daugasauron.com/Dollyfile-donor ${digest(donor)} /usr /usr\nINSTALL https://daugasauron.com/Dollyfile-pkg ${digest(pkg)}\nENTRY /bin/slop\n`;
    for (const [path, source] of [["Dollyfile-base", base], ["Dollyfile-donor", donor], ["Dollyfile-pkg", pkg]]) {
      await writeFile(join(dir, path), source);
    }
    await writeFile(join(dir, "Dollyfile"), recipe(["http@0", "gpu@0"]));
    assert.deepEqual((await createDollyfileGraphLoader(dir)()).root.hostRequirements, ["gpu@0", "http@0"]);
    await writeFile(join(dir, "Dollyfile"), recipe(["http@0"]));
    await assert.rejects(createDollyfileGraphLoader(dir)(), /pkg needs REQUIRES HOST gpu@0/);
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
  assert.throws(() => checkHostAbi(parse(record("http", 1)), provided), /http@1 is not declared/);
  assert.throws(() => checkHostAbi(parse(record("audio")), provided), /audio@0 is not declared/);
  assert.throws(() => checkHostAbi(parse(record("http", 0, other)), provided), /http@0 has a different layout/);
});
