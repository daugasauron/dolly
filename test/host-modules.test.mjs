import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { executableHostRequirements, checkHostAbi } from "../host/requirements.mjs";
import { createDollyfileGraphLoader } from "../scripts/dollyfile-graph.mjs";
import { discoverImageDefinitions } from "../scripts/image-definitions.mjs";
import { hostManifests } from "../host/manifests.mjs";
import { siteReference } from "../src/static-asset.mjs";

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
  // installs packages with amy and runs what they bring: threaded tools and
  // programs that load modules.
  const core = {
    default: [...interactive, "packages@0", "threads@0", "dso@0", "sockets@0"], system: interactive, "gpu-sdk": [...interactive, "gpu@0"],
    "audio-sdk": [...interactive, "audio@0", "microphone@0"], "system-build": ["runtime@0", "http@0"], "zig-build": ["runtime@0", "http@0"],
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
    const base = "DOLLY 7\nAPPLICATION base\nREQUIRES HOST display@0\nENTRY /bin/slop\n";
    const donor = "DOLLY 7\nAPPLICATION donor\nREQUIRES HOST threads@0\nENTRY /bin/slop\n";
    const pkg = "DOLLY 7\nPACKAGE pkg\nREQUIRES HOST gpu@0\nFILE /usr/share/pkg\n";
    const recipe = hosts => `DOLLY 7\nAPPLICATION default\n${hosts.map(host => `REQUIRES HOST ${host}\n`).join("")}FROM ${siteReference("Dollyfile-base")} ${digest(base)}\nCOPY ${siteReference("Dollyfile-donor")} ${digest(donor)} /usr /usr\nINSTALL ${siteReference("Dollyfile-pkg")} ${digest(pkg)}\nENTRY /bin/slop\n`;
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

// Operation numbers are one space: module_for() in src/process-kernel.c hands a
// number to the module whose dolly_NAME_kernel range holds it, before the core.
test("no two contracts claim one process operation number", async () => {
  const text = (path, base = import.meta.url) => readFile(new URL(path, base), "utf8");
  const core = (await text("../include/dolly/process.h")).match(/enum dolly_process_operation \{([^}]*)\}/)[1];
  const claims = [...core.matchAll(/(DOLLY_PROCESS_\w+) = (\d+)/g)]
    .map(([, name, number]) => ({ name, first: Number(number), last: Number(number) }));
  for (const { name, url, provides, kernel } of hostManifests) {
    if (provides === "kernel" || !kernel.length) continue;
    const sources = (await Promise.all(kernel.map(file => text(file, url)))).join("\n");
    const [, first, last] = sources.match(new RegExp(`dolly_kernel_module dolly_${name}_kernel = \\{\\s*(\\w+)(?:,\\s*(\\w+),)?`));
    if (first === "0" && !last) continue; // The module handles no process operation.
    const abi = await import(new URL("abi.mjs", url));
    claims.push({ name: `${name}@${first}`, first: abi[first], last: abi[last] });
  }
  // A module served inside the process Worker takes its operations there,
  // before the kernel sees them (call() in src/process-worker.mjs).
  for (const { name, url, processWorker } of hostManifests) {
    if (!processWorker) continue;
    const { serve } = await import(new URL(processWorker, url));
    const local = serve({ memory: new WebAssembly.Memory({ initial: 1 }),
      instance: { exports: {} }, processInterface: { exports: [] } });
    for (let operation = 0; operation < 256; ++operation) {
      if (local.handles(operation)) claims.push({ name: `${name}@${operation}`, first: operation, last: operation });
    }
  }
  claims.sort((left, right) => left.first - right.first);
  for (const [index, claim] of claims.entries()) {
    assert.ok(Number.isInteger(claim.first) && claim.first <= claim.last, claim.name);
    if (index) assert.ok(claims[index - 1].last < claim.first, `${claims[index - 1].name} and ${claim.name} both claim ${claim.first}`);
  }
});
