import { basename } from "node:path";
import { hostContracts } from "../host/modules.mjs";
import { hostFiles } from "../scripts/host-modules.mjs";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

import {
  emscriptenExports,
  validateBrowserImports,
  validateProcess,
  validateRuntime,
} from "../scripts/dolly-abi.mjs";
import {
  formatWasmType,
  readWasmInterface,
  sameWasmType,
} from "../scripts/wasm-interface.mjs";
import {
  discoverImageDefinitions,
  inspectStaticSources,
} from "../scripts/image-definitions.mjs";
import { loadDollyfileGraph, recipeRecords } from "../scripts/dollyfile-graph.mjs";

const artifact = (name) => new URL(`../dist/${name}`, import.meta.url);
const contractArtifact = file => artifact(`${basename(file, ".wat")}.wasm`);
const kernelPluginContractPath = new URL(
  "../dist/dolly-kernel-plugin-0.wasm",
  import.meta.url,
);
const processContractPath = new URL("../dist/dolly-process-0.wasm", import.meta.url);

test("the resident kernel plugin contract is exact, wasm64, and has no command entry", async () => {
  const contract = await readWasmInterface(kernelPluginContractPath);
  const memory = contract.imports.find((entry) => entry.module === "env" && entry.name === "memory");
  const table = contract.imports.find(
    (entry) => entry.module === "env" && entry.name === "__indirect_function_table",
  );

  assert.equal(formatWasmType(memory.type), "memory64(min=1024,max=131072,shared)");
  assert.equal(formatWasmType(table.type), "table64(min=1,max=*):funcref");
  assert.deepEqual(contract.exports, []);
  assert.equal(contract.imports.some((item) => item.name === "dolly_toolchain_main"), false);
  assert.equal(contract.imports.some((item) => item.name === "dolly_spawn"), false);
  assert.equal(contract.imports.some((item) => item.name === "dolly_http_perform"), false);
});

test("dolly-process-0 is a minimal private-memory executable contract", async () => {
  const contract = await readWasmInterface(processContractPath);
  const layout = contract.customSectionData.filter(
    (section) => section.name === "dolly.process.layout",
  );
  const expectedLayout = createHash("sha256").update(
    await readFile(new URL("../include/dolly/process.h", import.meta.url)),
  ).digest("hex");
  assert.deepEqual(
    contract.imports.map((entry) => `${entry.module}.${entry.name}`),
    ["env.memory", "dolly_process_0.call"],
  );
  assert.equal(formatWasmType(contract.imports[0].type), "memory64(min=1,max=131072,shared)");
  assert.equal(
    formatWasmType(contract.imports[1].type),
    "func(i32,i64,i64,i64,i64)->(i64)",
  );
  assert.equal(
    formatWasmType(contract.exports.find((entry) => entry.name === "_start").type),
    "func()->()",
  );
  assert.equal(layout.length, 1);
  assert.equal(Buffer.from(layout[0].data).toString("hex"), expectedLayout);
});

test("a statically linked process executable satisfies dolly-process-0", async () => {
  const executablePath = new URL("../build/process-probes/process-check", import.meta.url);
  await validateProcess(processContractPath, [executablePath]);
  const executable = await readWasmInterface(executablePath);
  assert.equal(executable.customSections.includes("dylink.0"), false);
  assert.equal(executable.customSections.includes("dolly.process"), true);
  assert.equal(executable.customSections.includes("dolly.process.memory"), true);
  assert.deepEqual(
    executable.imports.map((entry) => `${entry.module}.${entry.name}`),
    ["env.memory", "dolly_process_0.call"],
  );
});

test("the production seed contains only bootstrap and compiler executables, not acceptance probes", async () => {
  const { default: loadSeed } = await import("../dist/dolly-seed.mjs");
  const bytes = await readFile(new URL("../dist/dolly.data", import.meta.url));
  const files = new Map();
  let dependencies = 0;
  await loadSeed({
    getPreloadedPackage(_name, size) {
      assert.equal(size, bytes.byteLength);
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
    FS_createPath() {},
    FS_createDataFile(path, _name, contents) { files.set(path, contents); },
    addRunDependency() { dependencies++; },
    removeRunDependency() { dependencies--; },
  });
  assert.equal(dependencies, 0);
  const prefix = "/seed/usr/libexec/dolly/process-bin/";
  assert.deepEqual([...files.keys()].filter(path => path.startsWith(prefix))
    .map(path => path.slice(prefix.length)).sort(), ["bootstrap", "compiler"]);
  for (const name of ["bootstrap", "compiler"]) {
    assert.deepEqual(Buffer.from(files.get(prefix + name)),
      await readFile(new URL(`../build/process-bin/${name}`, import.meta.url)));
  }
  assert.ok(files.has("/seed/usr/include/stdio.h"));
  assert.ok(![...files.keys()].some(path => path.includes("/c++/v1/")));
  for (const port of ["boost/version.hpp", "png.h", "unicode/utypes.h"])
    assert.ok(!files.has("/seed/usr/include/" + port), `SDK cache port leaked into the compiler seed: ${port}`);
});

test("the process gate can only copy between one process and kernel memory", async () => {
  const gate = await readWasmInterface(artifact("dolly-process-gate-0.wasm"));
  assert.deepEqual(
    gate.imports.map((entry) => `${entry.module}.${entry.name}`),
    ["process.memory", "kernel.memory"],
  );
  assert.deepEqual(
    gate.exports.map((entry) => `${entry.name}:${formatWasmType(entry.type)}`),
    [
      "request:func(i64,i64,i64)->()",
      "response:func(i64,i64,i64)->()",
    ],
  );
});

test("the kernel exports exactly the functions its contracts declare", async () => {
  const kernelContracts = await Promise.all(hostFiles("contracts").map(({ file }) => readWasmInterface(contractArtifact(file))));
  const expected = emscriptenExports(await readWasmInterface(kernelPluginContractPath), kernelContracts);
  assert.deepEqual(
    JSON.parse(await readFile(new URL("../build/runtime-exports.json", import.meta.url), "utf8")),
    expected,
  );
  const runtime = await readWasmInterface(artifact("dolly.wasm"));
  assert.deepEqual(
    runtime.exports.filter(entry => entry.type.kind === "func" && entry.name.startsWith("dolly_"))
      .map(entry => `_${entry.name}`).sort(),
    expected.filter(name => name.startsWith("_dolly_")),
  );
});

test("the runtime implements the resident kernel plugin contract", async () => {
  await validateRuntime(kernelPluginContractPath, artifact("dolly.wasm"));
});

test("the runtime exposes typed bootstrap and process-supervisor boundaries", async () => {
  const runtime = await readWasmInterface(artifact("dolly.wasm"));
  const supervisor = await readWasmInterface(artifact("dolly-supervisor-0.wasm"));
  const threads = await readWasmInterface(artifact("dolly-threads-supervisor-0.wasm"));
  // Exported globals are contract constants (mailbox word layouts), not kernel exports.
  for (const required of [...supervisor.exports, ...threads.exports].filter(entry => entry.type.kind === "func")) {
    const actual = runtime.exports.find(entry => entry.name === required.name);
    assert.ok(actual, `runtime is missing ${required.name}`);
    assert.equal(sameWasmType(actual.type, required.type), true);
  }
  const bootstrap = runtime.exports.find((entry) => entry.name === "dolly_bootstrap_finish");
  const spawn = runtime.exports.find((entry) => entry.name === "dolly_process_spawn_serialized");
  const mailbox = runtime.exports.find(
    (entry) => entry.name === "dolly_display_mailbox_address",
  );

  assert.equal(formatWasmType(bootstrap.type), "func()->(i32)");
  assert.equal(formatWasmType(spawn.type), "func(i64)->(i32)");
  assert.equal(formatWasmType(mailbox.type), "func()->(i64)");
  for (const removed of [
    "dolly_bootstrap",
    "dolly_bootstrap_resume",
    "dolly_shell_run",
    "dolly_toolchain_main",
  ]) {
    assert.equal(runtime.exports.some((entry) => entry.name === removed), false);
  }
});

test("the runtime implements every host module contract its manifest names", async () => {
  const runtime = await readWasmInterface(artifact("dolly.wasm"));
  for (const { name, file } of hostFiles("contracts")) {
    const contract = await readWasmInterface(contractArtifact(file));
    const owned = hostContracts.find(manifest => manifest.name === name).imports;
    for (const required of contract.imports.filter(entry => `${entry.module}.${entry.name}` !== "env.memory")) {
      assert.ok(owned.includes(`${required.module}.${required.name}`), `${name} does not own ${required.name}`);
      const actual = runtime.imports.find(entry => entry.module === required.module && entry.name === required.name);
      assert.ok(actual && sameWasmType(actual.type, required.type), `${file}: runtime import ${required.name}`);
    }
    // Exported globals are contract constants for generated headers, not kernel exports.
    for (const required of contract.exports.filter(entry => entry.type.kind === "func")) {
      const actual = runtime.exports.find(entry => entry.name === required.name);
      assert.ok(actual && sameWasmType(actual.type, required.type), `${file}: runtime export ${required.name}`);
    }
  }
});

test("the generated loader has no native host or implicit browser fallbacks", async () => {
  const loader = await readFile(artifact("dolly.mjs"), "utf8");
  assert.doesNotMatch(loader, /node:fs|readFileSync|NODEFS|NODERAWFS|child_process|spawnSync/);
  assert.doesNotMatch(loader, /PThread|em-pthread|emscripten_thread/);
  assert.doesNotMatch(loader, /window\.prompt|FS_stdin_getChar|_wasmfs_stdin_get_char/);
  assert.doesNotMatch(loader, /__emscripten_system/);
});

test("the kernel contains no general dynamic loader or dynamic JavaScript execution", async () => {
  const loader = await readFile(artifact("dolly.mjs"), "utf8");
  const kernel = await readWasmInterface(artifact("dolly.wasm"));
  assert.equal(kernel.customSections.includes("dylink.0"), false);
  assert.doesNotMatch(loader, /\b(?:eval|Function)\s*\(|loadDynamicLibrary|_dlopen_js|_dlsym_js/);
  const plugin = await readFile(new URL("../src/kernel-plugin.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(plugin, /\bfetch\s*\(|XMLHttpRequest|\b(?:eval|Function)\s*\(/);
});

test("system snapshots are sealed to their visible recipe chain", async () => {
  const { decodeSystemSnapshot } = await import("../scripts/system-snapshot-format.mjs");
  const { verifySnapshotIdentity } = await import("../scripts/snapshot-identity.mjs");
  const { DOLLY_PROCESS_ABI_DIGEST } = await import(artifact("dolly-process-abi.mjs"));
  const processContract = await readWasmInterface(processContractPath);
  const { DOLLY_IMAGE_BUILD_ID } = await import(artifact("dolly-image-build-id.mjs"));
  const { DOLLY_IMAGES } = await import(artifact("dolly-images.mjs"));
  const projectDir = new URL("..", import.meta.url).pathname;
  const definitions = await discoverImageDefinitions(projectDir);
  // Demo images prove their programs in their own browser tests.
  const corePrograms = new Map([
    ["default", "/bin/slop"],
    ["amy", "/bin/amy"],
    ["audio-sdk", "/usr/lib/dolly/process/libdolly-audio.a"],
    ["cc", "/bin/cc"],
    ["core", "/bin/slop"],
    ["curl", "/usr/bin/curl"],
    ["display", "/usr/lib/libdisplay.so"],
    ["ghostty-build", "/usr/bin/zig"],
    ["gzip", "/bin/gzip"],
    ["gpu-sdk", "/usr/lib/dolly/process/libdolly-gpu.a"],
    ["minimal", "/usr/lib/libdisplay.so"],
    ["system", "/usr/lib/libdisplay.so"],
    ["system-build", "/bin/slop"],
    ["system-tools", "/usr/bin/git"],
    ["zig-build", "/usr/bin/zig"],
    ["zlib", "/usr/lib/libz.a"],
  ]);
  assert.deepEqual([...corePrograms.keys()].sort(), definitions
    .filter(definition => !definition.filename.startsWith("demos/")).map(definition => definition.image).sort());
  for (const image of DOLLY_IMAGES.map(({ image }) => image)) {
    const snapshot = await readFile(artifact(`dolly-${image}-system.snapshot`));
    const { DOLLY_SYSTEM_SNAPSHOT: metadata } = await import(
      artifact(`dolly-${image}-system-snapshot.mjs`)
    );
    const graph = await loadDollyfileGraph(
      projectDir,
      definitions.find((definition) => definition.image === image).filename,
    );
    const recipes = recipeRecords(graph);
    assert.equal(metadata.image, image);
    assert.equal(metadata.buildId, DOLLY_IMAGE_BUILD_ID);
    assert.equal(metadata.identityVersion, 2);
    assert.deepEqual(metadata.recipes, recipes);
    assert.deepEqual(metadata.manifest, [...metadata.manifest].sort());
    if (corePrograms.has(image)) {
      assert.ok(metadata.manifest.includes(corePrograms.get(image)), `${image}: primary program`);
    }
    assert.ok(metadata.manifest.includes("/etc/dolly/recipes.lock"));
    // An application or toolchain built on a base carries the seed its base
    // retained. A package, or an image composed from packages, keeps only what
    // it declares: the engine is in amy, the toolchain in cc, the shell in core.
    const toolchain = ["/usr/libexec/dolly/process-bin/compiler", "/usr/lib/dolly/process/libc-ww.a",
      "/usr/lib/clang/24/include/stddef.h", "/usr/lib/dolly/dolly-kernel-plugin-0.wasm"];
    const based = graph.root.role !== "package" && (graph.root.from !== null || image === "system-build");
    const declared = { amy: ["/bin/dollyfile"], cc: toolchain, core: ["/bin/foreground"], minimal: ["/bin/foreground"] }[image] ?? [];
    for (const path of ["/bin/dollyfile", "/bin/foreground", ...toolchain]) {
      assert.equal(metadata.manifest.includes(path), based || declared.includes(path), `${image}: ${path}`);
    }
    assert.equal(metadata.manifest.some((path) => /\/usr\/src\/dolly\/(?:dollyfile\.c|dso-)/.test(path) ||
      /\/process-bin\/(?!compiler$)/.test(path)), false, `${image} must not retain bootstrap probes`);
    for (const recipe of recipes) assert.ok(metadata.manifest.includes(recipe.retainedPath));
    assert.equal(metadata.manifest.some((path) => path.startsWith("/workspace")), false);
    assert.equal(metadata.byteLength, snapshot.byteLength);
    assert.equal(metadata.sha256, createHash("sha256").update(snapshot).digest("hex"));
    for (const path of (graph.root.entry ?? []).filter(argument => argument.startsWith("/"))) {
      assert.ok(metadata.manifest.includes(path), `${image}: ENTRY names ${path}`);
    }
    assert.deepEqual(metadata.entry, graph.root.entry);
    if (image === "default") {
      graph.exporters.set("ENV:PATH", { exported: { type: "ENV", name: "PATH", details: ["advisory-only"] } });
      const parsed = decodeSystemSnapshot(snapshot);
      const verify = value => verifySnapshotIdentity(definitions.find(item => item.image === image), graph,
        value, processContract, DOLLY_PROCESS_ABI_DIGEST);
      assert.deepEqual(verify(parsed), metadata.entry,
      "source inspection must not override the runtime's final environment");
      for (const path of ["/etc/dolly/image", "/etc/dolly/recipes.lock", "/etc/dolly/Dollyfile"]) {
        const modified = { ...parsed, files: new Map(parsed.files) };
        modified.files.set(path, Buffer.concat([Buffer.from("\uFEFF"), parsed.files.get(path)]));
        assert.throws(() => verify(modified), /snapshot/, `${path}: modified metadata must not compare equal`);
      }
    }
  }
});

test("published inputs are independent exact pinned files", async () => {
  const projectDir = new URL("..", import.meta.url).pathname;
  const { DOLLY_IMAGES, DOLLY_STATIC_SOURCES } = await import(artifact("dolly-images.mjs"));
  const selected = new Set(DOLLY_IMAGES.map(({ image }) => image));
  const definitions = (await discoverImageDefinitions(projectDir))
    .filter(({ image }) => selected.has(image));
  const sources = await inspectStaticSources(projectDir, definitions);
  assert.deepEqual(DOLLY_STATIC_SOURCES, sources);
  assert.ok(sources.every((item) =>
    ["/Dollyfile", "/modules/", "/demos/", "/include/dolly/", "/host/", "/dist/static/"].some((prefix) =>
      item.path.startsWith(prefix)) &&
    /^[0-9a-f]{64}$/.test(item.sha256) && item.byteLength > 0));
  assert.equal(sources.some((item) => item.path.endsWith(".assets")), false);
});

test("registry, routes, and source viewer derive from Dollyfiles", async () => {
  const projectDir = new URL("..", import.meta.url).pathname;
  const { DOLLY_IMAGES } = await import(artifact("dolly-images.mjs"));
  const knownImages = (await discoverImageDefinitions(projectDir))
    .map(({ image, filename }) => ({ image, dollyfile: filename }));
  const selected = new Set(DOLLY_IMAGES.map(({ image }) => image));
  assert.ok(DOLLY_IMAGES.length > 0);
  assert.deepEqual(
    DOLLY_IMAGES.map(({ image, dollyfile }) => ({ image, dollyfile })),
    knownImages.filter(({ image }) => selected.has(image)),
  );
  for (const image of DOLLY_IMAGES) {
    // Images without ENTRY or display only build: no boot route.
    const bootRoute = access(new URL(`../${image.image}/index.html`, import.meta.url)).then(() => true, () => false);
    assert.equal(await bootRoute, image.entry !== null && image.hostRequirements.includes("display@0"), `${image.image}: boot route`);
    await readFile(new URL(`../${image.image}/rebuild/index.html`, import.meta.url));
    await readFile(new URL(`../view/${image.image}/index.html`, import.meta.url));
    assert.ok(image.byteLength > 0);
    assert.match(image.sha256, /^[0-9a-f]{64}$/);
  }
  // The package index names every package of the registry by its pinned recipe, then describes it.
  const index = (await readFile(new URL("../amy-index.txt", import.meta.url), "utf8")).trimEnd().split("\n").filter(Boolean);
  assert.deepEqual(index.map(row => row.split(" ").slice(0, 3).join(" ")), DOLLY_IMAGES.filter(({ role }) => role === "package")
    .map(({ image, dollyfile, sha256 }) => `${image} https://daugasauron.com/${dollyfile} ${sha256}`));
  assert.ok(index.every(row => row.split(" ").length > 3), "a package without a description");
});

test("the kernel module owns its wasm64 WasmFS memory and table", async () => {
  const runtime = await readWasmInterface(artifact("dolly.wasm"));
  const memory = runtime.imports.find(
    (entry) => entry.module === "env" && entry.name === "memory",
  );
  const table = runtime.exports.find((entry) => entry.name === "__indirect_function_table");
  assert.equal(formatWasmType(memory.type), "memory64(min=1024,max=131072,shared)");
  assert.match(formatWasmType(table.type), /^table64\(min=/);
  assert.ok(runtime.exports.some((entry) => entry.name === "wasmfs_create_memory_backend"));

  for (const operation of [
    "_wasmfs_read_file",
    "_wasmfs_write_file",
    "_wasmfs_mknod",
    "_wasmfs_identify",
    "_wasmfs_get_cwd",
  ]) {
    assert.equal(
      runtime.imports.some((entry) => entry.name === operation),
      false,
      `${operation} escaped to the browser host`,
    );
    assert.ok(runtime.exports.some((entry) => entry.name === operation));
  }

  assert.equal(
    runtime.imports.some((entry) => entry.name === "_wasmfs_stdin_get_char"),
    false,
    "stdin escaped to Emscripten's browser fallback",
  );
});

test("the main Wasm has an explicit, minimal browser boundary", async () => {
  const runtime = await readWasmInterface(artifact("dolly.wasm"));
  const contract = await readWasmInterface(artifact("dolly-browser-0.wasm"));
  validateBrowserImports(contract.imports, runtime.imports);
  const policy = Object.fromEntries(hostContracts.map(contract => [contract.name, contract.imports]));
  const actual = runtime.imports
    .map((entry) => `${entry.module}.${entry.name}`)
    .sort();
  const expected = Object.values(policy).flat().sort();

  assert.deepEqual(actual, expected);
  assert.deepEqual(policy.http, ["env.dolly_http_dispatch"]);
  assert.deepEqual(policy.download, ["env.dolly_download_dispatch"]);
  assert.deepEqual(policy.gpu, ["env.dolly_gpu_dispatch"]);
  assert.deepEqual(policy.audio, ["env.dolly_audio_dispatch"]);
  assert.equal(
    actual.some((name) => /nodefs|opfs|fetch|socket|spawn|process|pthread|thread_/.test(name)),
    false,
  );
});

test("the outer import validator rejects name, type, count, and duplicate drift", async () => {
  const { imports } = await readWasmInterface(artifact("dolly-browser-0.wasm"));
  const wrongName = structuredClone(imports);
  wrongName[0].name = "different_memory";
  assert.throws(() => validateBrowserImports(imports, wrongName), /missing or changed type/);
  const wrongType = structuredClone(imports);
  wrongType.find(x => x.name === "dolly_http_dispatch").type.params.push("i32");
  assert.throws(() => validateBrowserImports(imports, wrongType), /missing or changed type/);
  assert.throws(() => validateBrowserImports(imports, imports.slice(1)), /count changed/);
  assert.throws(() => validateBrowserImports(imports, [...imports, imports[0]]), /duplicate/);
});
