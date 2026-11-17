import assert from "node:assert/strict";
import test from "node:test";
import { access, mkdtemp, readdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sha256 as digest } from "../scripts/sha256.mjs";
import { executableHostRequirements, checkHostAbi } from "../host/requirements.mjs";
import { createDollyfileGraphLoader } from "../scripts/dollyfile-graph.mjs";
import { discoverImageDefinitions } from "../scripts/image-definitions.mjs";
import { hostManifests } from "../host/manifests.mjs";
import { DOLLY_NENA_GIVES_BYTES, DOLLY_NENA_REASON_BYTES } from "../host/nena/abi.mjs";
import { siteReference } from "../page/static-asset.mjs";
test("every image declares its complete host set itself", async () => {
  const root = new URL("../", import.meta.url).pathname;
  const load = createDollyfileGraphLoader(root);
  const terminal = ["runtime@0", "display@0", "input@0"];
  // Every image declares the runtime it is built on; the engine retained for
  // FROM builds fetches nothing; download and upload tools arrive with
  // transfer, which default installs; a terminal draws with display@0 and
  // reads keys with input@0, which the display package alone does not ask for;
  // Git, which system-tools holds, runs threads; curl and Git's HTTP helpers
  // fetch; default installs packages with amy, which has nena enable what a
  // package needs beyond these (curl's http@0).
  const core = {
    default: [...terminal, "download@0", "snapshot@0", "upload@0", "packages@0", "nena@0"],
    system: [...terminal, "snapshot@0", "threads@0"],
    "system-build": ["runtime@0"], "zig-build": ["runtime@0"],
    "ghostty-build": terminal,
    "system-tools": [...terminal, "threads@0"], transfer: ["runtime@0", "download@0", "upload@0"],
    git: ["runtime@0", "threads@0"], "git-http": ["runtime@0", "http@0", "threads@0"],
    zlib: ["runtime@0"], gzip: ["runtime@0"], curl: ["runtime@0", "http@0"], display: ["runtime@0", "display@0"],
    nena: ["runtime@0", "nena@0"], amy: ["runtime@0", "packages@0"], dollyfile: ["runtime@0"],
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
  // Where the session has nena@0, the refusal names the command that enables the module.
  assert.throws(() => checkHostAbi(parse(record("audio")), new Map([...provided, ["nena@0", layout]])), /nena enable audio/);
});

// nena prints each module's line, and the reason of one that is never
// switched after "fixed: ": both must fit the record of host/nena.
test("every host module says what it gives within nena's record", () => {
  for (const { name, gives, fixed } of hostManifests) {
    assert.ok(typeof gives === "string" && gives && Buffer.byteLength(gives) < DOLLY_NENA_GIVES_BYTES, `host/${name}/module.json: gives`);
    assert.ok(fixed === undefined || (fixed && Buffer.byteLength(`fixed: ${fixed}`) < DOLLY_NENA_REASON_BYTES), `host/${name}/module.json: fixed`);
  }
});

// A module is its directory (host/README.md): the manifest names each of its
// files but itself and the generated abi.mjs, and nothing elsewhere but a
// runtime's kernel; what the page and its Workers load of it, its host and
// processWorker and what they import, reaches beyond its directory only the
// runtime's files.
test("each host module's manifest names the files of its directory, whose JavaScript imports only them and the runtime's", async () => {
  const root = new URL("../", import.meta.url), checkout = url => url.href.slice(root.href.length);
  const paths = ["host", "processWorker", "seed", "fixtures", "contracts", "process", "headers", "kernel", "client", "tools", "files"];
  const runtime = new RegExp(`^(?:page|host${hostManifests.filter(({ provides }) => provides === "kernel")
    .map(({ name }) => `|host/${name}`).join("")})/[^/]+\\.mjs$`);
  const specifiers = [/\bfrom\s+"(\.{1,2}\/[^"]+)"/g, /\bimport\s+"(\.{1,2}\/[^"]+)"/g,
    /\bimport\(\s*"(\.{1,2}\/[^"]+)"\s*\)/g, /new URL\(\s*"(\.{1,2}\/[^"]+)"\s*,\s*import\.meta\.url\s*\)/g];
  for (const manifest of hostManifests) {
    const directory = new URL("./", manifest.url), own = checkout(directory);
    const named = new Set(paths.flatMap(field => [manifest[field] ?? []].flat()).map(path => checkout(new URL(path, directory))));
    for (const path of named) {
      await access(new URL(path, root));
      assert.ok(path.startsWith(own) || manifest.provides === "kernel", `${own}module.json names ${path}`);
    }
    for (const file of await readdir(directory)) {
      assert.ok(["module.json", "abi.mjs"].includes(file) || named.has(own + file), `${own}module.json does not name ${file}`);
    }
    const pending = [manifest.host, manifest.processWorker ?? []].flat().map(path => own + path), loaded = new Set();
    while (pending.length) {
      const file = pending.pop();
      if (loaded.has(file)) continue;
      loaded.add(file);
      const text = await readFile(new URL(file, root), "utf8");
      for (const pattern of specifiers) for (const [, specifier] of text.matchAll(pattern)) {
        const target = checkout(new URL(specifier, new URL(file, root)));
        if (target.startsWith(own)) pending.push(target);
        else assert.match(target, runtime, `${file} imports ${target}`);
      }
    }
  }
});

// The registry's list, enable and disable go to the page side of the module
// whose manifest asks for them (host/modules.mjs), and nothing else switches
// a module.
test("nena@0 alone is given the registry's switches", () => {
  assert.deepEqual(hostManifests.filter(manifest => manifest.switches).map(manifest => manifest.name), ["nena"]);
});

// Operation numbers are one space: module_for() in kernel/process-kernel.c hands a
// number to the module whose dolly_NAME_kernel range holds it, before the core.
test("no two contracts claim one process operation number", async () => {
  const text = (path, base = import.meta.url) => readFile(new URL(path, base), "utf8");
  const core = (await text("../include/dolly/process.h")).match(/enum dolly_process_operation \{([^}]*)\}/)[1];
  const claims = [...core.matchAll(/(DOLLY_PROCESS_\w+) = (\d+)/g)]
    .map(([, name, number]) => ({ name, first: Number(number), last: Number(number) }));
  for (const { name, url, provides, kernel } of hostManifests) {
    if (provides === "kernel" || !kernel.length) continue;
    const sources = (await Promise.all(kernel.map(file => text(file, url)))).join("\n");
    const [, first, last] = sources.match(new RegExp(
      `dolly_kernel_module dolly_${name}_kernel = \\{\\s*(?:\\.first_operation = )?(\\w+)(?:,\\s*(?:\\.last_operation = )?(\\w+),)?`));
    if (first === "0" && !last) continue; // The module handles no process operation.
    const abi = await import(new URL("abi.mjs", url));
    claims.push({ name: `${name}@${first}`, first: abi[first], last: abi[last] });
  }
  // A module served inside the process Worker takes its operations there,
  // before the kernel sees them (call() in page/process-worker.mjs).
  for (const { name, url, processWorker } of hostManifests) {
    if (!processWorker) continue;
    const { serve } = await import(new URL(processWorker, url));
    // What a process Worker gives a provider, with stack-wrap's two exports.
    const local = serve({ memory: new WebAssembly.Memory({ initial: 1 }), processInterface: { exports: [] },
      instance: { exports: { dolly_stack_room: new WebAssembly.Global({ value: "i32", mutable: true }, 0),
        dolly_stack_continue() {} } }, stack: { promisingEntry: false, depths: { direct: 0, promising: 0 } } });
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
