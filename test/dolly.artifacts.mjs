import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
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

test("unknown browser modes fail before launching Chrome", () => {
  const result = spawnSync(process.execPath, [
    new URL("../scripts/browser-harness.mjs", import.meta.url).pathname,
    "dolly-browser-must-not-launch",
  ], { encoding: "utf8", env: { ...process.env, DOLLY_BROWSER_MODE: "misspelled-mode" } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unknown DOLLY_BROWSER_MODE: misspelled-mode/);
  assert.doesNotMatch(result.stderr, /spawn.*ENOENT/);
});

const artifact = (name) => new URL(`../dist/${name}`, import.meta.url);
const kernelPluginContractPath = new URL(
  "../dist/dolly-kernel-plugin-0.wasm",
  import.meta.url,
);
const processContractPath = new URL("../dist/dolly-process-0.wasm", import.meta.url);
const moduleInfrastructure = new Set([
  "memory",
  "__indirect_function_table",
  "__memory_base",
  "__stack_pointer",
  "__table_base",
  "__table_base32",
]);
const loaderBackedFunctions = new Set([
  "invoke_v",
  "invoke_ijj",
  "invoke_ijji",
  "invoke_jj",
  "invoke_vjj",
]);

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
  assert.equal(contract.hasStart, false);
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
  assert.equal(executable.hasStart, true, "Emscripten initializes private memory at instantiation");
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

test("Emscripten's JSON export list is derived from the Wasm contract", async () => {
  const actual = JSON.parse(
    await readFile(new URL("../build/runtime-exports.json", import.meta.url), "utf8"),
  );
  const expected = new Set(["_main"]);
  const contract = await readWasmInterface(kernelPluginContractPath);
  const displayContract = await readWasmInterface(artifact("dolly-display-0.wasm"));
  const uploadContract = await readWasmInterface(artifact("dolly-upload-0.wasm"));
  const httpContract = await readWasmInterface(artifact("dolly-http-0.wasm"));
  const snapshotContract = await readWasmInterface(artifact("dolly-snapshot-0.wasm"));
  const supervisorContract = await readWasmInterface(
    artifact("dolly-supervisor-0.wasm"),
  );

  for (const entry of contract.imports) {
    if (!moduleInfrastructure.has(entry.name) && !loaderBackedFunctions.has(entry.name)) {
      expected.add(`_${entry.name}`);
    }
  }
  for (const entry of displayContract.exports) expected.add(`_${entry.name}`);
  for (const entry of uploadContract.exports) expected.add(`_${entry.name}`);
  for (const entry of httpContract.exports) expected.add(`_${entry.name}`);
  for (const entry of snapshotContract.exports) expected.add(`_${entry.name}`);
  for (const entry of supervisorContract.exports) expected.add(`_${entry.name}`);

  assert.deepEqual(actual, [...expected].sort());
});

test("the runtime implements the resident kernel plugin contract", async () => {
  await validateRuntime(kernelPluginContractPath, artifact("dolly.wasm"));
});

test("the runtime exposes typed bootstrap and process-supervisor boundaries", async () => {
  const runtime = await readWasmInterface(artifact("dolly.wasm"));
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

test("the runtime implements the canonical framebuffer and input contract", async () => {
  const contract = await readWasmInterface(artifact("dolly-display-0.wasm"));
  const runtime = await readWasmInterface(artifact("dolly.wasm"));

  for (const required of contract.imports) {
    const actual = runtime.imports.find(
      (entry) => entry.module === required.module && entry.name === required.name,
    );
    assert.ok(actual, `runtime is missing ${required.module}.${required.name}`);
    assert.equal(sameWasmType(actual.type, required.type), true);
  }
  for (const required of contract.exports) {
    const actual = runtime.exports.find((entry) => entry.name === required.name);
    assert.ok(actual, `runtime is missing ${required.name}`);
    assert.equal(sameWasmType(actual.type, required.type), true);
  }
});

test("the runtime implements the canonical streaming HTTP mailbox contract", async () => {
  const contract = await readWasmInterface(artifact("dolly-http-0.wasm"));
  const runtime = await readWasmInterface(artifact("dolly.wasm"));
  const dispatch = contract.imports.find(
    (entry) => entry.module === "env" && entry.name === "dolly_http_dispatch",
  );

  assert.equal(
    formatWasmType(dispatch.type),
    "func(i64,i64,i64,i64,i64,i64,i64,i64,i32,i32)->(i32)",
  );

  for (const required of contract.imports) {
    const actual = runtime.imports.find(
      (entry) => entry.module === required.module && entry.name === required.name,
    );
    assert.ok(actual, `runtime is missing ${required.module}.${required.name}`);
    assert.equal(sameWasmType(actual.type, required.type), true);
  }
  for (const required of contract.exports) {
    const actual = runtime.exports.find((entry) => entry.name === required.name);
    assert.ok(actual, `runtime is missing ${required.name}`);
    assert.equal(sameWasmType(actual.type, required.type), true);
  }
});

test("the runtime implements the bounded browser download contract", async () => {
  const contract = await readWasmInterface(artifact("dolly-download-0.wasm"));
  const runtime = await readWasmInterface(artifact("dolly.wasm"));
  const dispatch = contract.imports.find(
    (entry) => entry.module === "env" && entry.name === "dolly_download_dispatch",
  );
  assert.equal(formatWasmType(dispatch.type), "func(i64,i64,i64,i64)->(i32)");
  for (const required of contract.imports) {
    const actual = runtime.imports.find(
      (entry) => entry.module === required.module && entry.name === required.name,
    );
    assert.ok(actual, `runtime is missing ${required.module}.${required.name}`);
    assert.equal(sameWasmType(actual.type, required.type), true);
  }
});

test("user-approved upload has typed mailbox exports and no new browser import", async () => {
  const contract = await readWasmInterface(artifact("dolly-upload-0.wasm"));
  const runtime = await readWasmInterface(artifact("dolly.wasm"));
  assert.deepEqual(contract.imports.map(entry => entry.name), ["memory"]);
  for (const required of contract.exports) {
    const actual = runtime.exports.find(entry => entry.name === required.name);
    assert.ok(actual, required.name);
    assert.equal(sameWasmType(actual.type, required.type), true);
  }
});

test("the runtime implements the opaque system snapshot contract", async () => {
  const contract = await readWasmInterface(artifact("dolly-snapshot-0.wasm"));
  const runtime = await readWasmInterface(artifact("dolly.wasm"));

  assert.deepEqual(
    contract.imports.map((entry) => `${entry.module}.${entry.name}`),
    ["env.memory"],
  );
  for (const required of contract.exports) {
    const actual = runtime.exports.find((entry) => entry.name === required.name);
    assert.ok(actual, `runtime is missing ${required.name}`);
    assert.equal(sameWasmType(actual.type, required.type), true);
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

test("the main-module provider exports Emscripten side-module stack bounds", async () => {
  const runtime = await readWasmInterface(artifact("dolly.wasm"));
  for (const name of ["__stack_pointer", "__stack_high", "__stack_low"]) {
    const entry = runtime.exports.find(entry => entry.name === name);
    assert.ok(entry, name);
    assert.equal(entry.type.kind, "global");
    assert.equal(entry.type.value, "i64");
  }
});

test("system snapshots are sealed to their visible recipe chain", async () => {
  const { decodeSystemSnapshot } = await import("../scripts/system-snapshot-format.mjs");
  const { verifySnapshotIdentity } = await import("../scripts/snapshot-identity.mjs");
  const { DOLLY_PROCESS_ABI_DIGEST } = await import(artifact("dolly-process-abi.mjs"));
  const processContract = await readWasmInterface(processContractPath);
  const { DOLLY_BUILD_ID } = await import(artifact("dolly-build-id.mjs"));
  const { DOLLY_IMAGES } = await import(artifact("dolly-images.mjs"));
  const projectDir = new URL("..", import.meta.url).pathname;
  const definitions = await discoverImageDefinitions(projectDir);
  const expectedPrograms = new Map([
    ["bhop", "/usr/bin/bhop"],
    ["classicube", "/usr/bin/classicube-agent"],
    ["classicube-build", "/usr/bin/classicube"],
    ["codex", "/usr/bin/codex"],
    ["codex-build", "/usr/bin/codex"],
    ["default", "/bin/slop"],
    ["dollyfile-studio", "/usr/bin/dollyfile-lint"],
    ["external-source", "/usr/bin/xxd"],
    ["fd-build", "/usr/bin/fd"],
    ["pi", "/usr/bin/pi"],
    ["pi-local", "/usr/bin/pi"],
    ["python", "/bin/slop"],
    ["python-pi", "/usr/bin/pi"],
    ["gamedev", "/usr/bin/graphics-demo"],
    ["gamedev-phone", "/usr/bin/graphics-demo"],
    ["system", "/usr/bin/rg"],
    ["system-build", "/bin/slop"],
    ["ripgrep", "/usr/bin/rg"],
    ["rust-sdk", "/opt/rust-sdk/bin/rustc"],
    ["rust-build", "/usr/bin/patti"],
    ["rust-tools", "/usr/bin/patti"],
    ["protox-build", "/usr/bin/protox"],
    ["javascript", "/usr/bin/tsc"],
    ["pi-runtime", "/usr/bin/pi"],
    ["python-runtime", "/usr/bin/python"],
    ["gamedev-sdk", "/usr/lib/libbox3d.a"],
    ["ghostty-build", "/usr/bin/zig"],
    ["cmake-build", "/usr/bin/cmake"],
    ["neovim-build", "/usr/bin/nvim"],
    ["neovim", "/usr/bin/nvim"],
    ["sdl2-build", "/usr/lib/libSDL2.a"],
    ["rts-build", "/usr/bin/seven-kingdoms"],
    ["rts-arena", "/usr/bin/rts-arena"],
  ]);
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
    assert.equal(metadata.buildId, DOLLY_BUILD_ID);
    assert.equal(metadata.identityVersion, 2);
    assert.deepEqual(metadata.recipes, recipes);
    assert.deepEqual(metadata.modules, graph.root.uses.map(
      ({ location, sha256 }) => ({ location, sha256 }),
    ));
    assert.deepEqual(metadata.manifest, [...metadata.manifest].sort());
    assert.ok(metadata.manifest.includes(expectedPrograms.get(image)), `${image}: primary program`);
    for (const path of ["/usr/bin/rg", "/usr/share/dolly/builds/ripgrep.json",
      "/usr/share/licenses/ripgrep/LICENSE-MIT"]) {
      assert.equal(metadata.manifest.includes(path),
        !["system-build", "ghostty-build", "rust-sdk", "rust-build", "protox-build", "codex-build", "fd-build"].includes(image),
        `${image}: ${path}`);
    }
    for (const path of ["/usr/bin/fd", "/usr/share/dolly/builds/fd.json",
      "/usr/share/licenses/fd/LICENSE-MIT", "/usr/share/licenses/fd/LICENSE-APACHE"]) {
      assert.equal(metadata.manifest.includes(path),
        !["system-build", "ghostty-build", "rust-sdk", "rust-build", "protox-build", "codex-build", "ripgrep"].includes(image),
        `${image}: ${path}`);
    }
    assert.equal(
      metadata.manifest.includes("/usr/bin/pi"),
      ["pi", "pi-local", "pi-runtime", "python-pi", "gamedev", "gamedev-phone", "bhop", "classicube", "dollyfile-studio", "rts-arena"].includes(image),
    );
    assert.ok(metadata.manifest.includes("/etc/dolly/recipes.lock"));
    for (const required of ["/bin/dollyfile", "/usr/libexec/dolly/process-bin/compiler",
      "/usr/lib/dolly/process/libc-ww.a", "/usr/lib/clang/24/include/stddef.h",
      "/usr/lib/dolly/dolly-kernel-plugin-0.wasm"]) {
      assert.ok(metadata.manifest.includes(required), `${image} must explicitly retain ${required}`);
    }
    assert.equal(metadata.manifest.some((path) => /\/usr\/src\/dolly\/(?:slop\.c|dollyfile\.c|process-tools\/|dso-)/.test(path) ||
      /\/process-bin\/(?!compiler$)/.test(path)), false, `${image} must not retain bootstrap probes`);
    for (const recipe of recipes) assert.ok(metadata.manifest.includes(recipe.retainedPath));
    assert.equal(metadata.manifest.some((path) => path.startsWith("/workspace")), false);
    assert.equal(metadata.manifest.some(path => path.startsWith("/usr/lib/python3.14/") &&
      /\/__pycache__(?:\/|$)|\.pyc$/.test(path)), false, `${image} must not retain build-time Python bytecode`);
    assert.equal(metadata.byteLength, snapshot.byteLength);
    assert.equal(metadata.sha256, createHash("sha256").update(snapshot).digest("hex"));
    assert.ok(metadata.manifest.includes("/bin/foreground"));
    const shellStartup = ["default", "codex", "rts-arena", "pi", "pi-local", "python", "python-pi", "gamedev", "gamedev-phone", "bhop", "classicube", "neovim", "dollyfile-studio"].includes(image);
    assert.equal(metadata.manifest.includes("/etc/dolly/init.slop"), shellStartup, `${image}: shell startup`);
    assert.deepEqual(metadata.entry, graph.root.entry);
    assert.equal(metadata.manifest.some(path => path.startsWith("/usr/lib/python3.14/test/")), false);
    assert.equal(metadata.manifest.some(path => /^\/usr\/src\/(raylib|box3d|dolly\/gamedev)\/build\//.test(path)), false);
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

test("HOST inputs are independent exact pinned files", async () => {
  const projectDir = new URL("..", import.meta.url).pathname;
  const { DOLLY_IMAGES, DOLLY_STATIC_SOURCES } = await import(artifact("dolly-images.mjs"));
  const selected = new Set(DOLLY_IMAGES.map(({ image }) => image));
  const definitions = (await discoverImageDefinitions(projectDir))
    .filter(({ image }) => selected.has(image));
  const sources = await inspectStaticSources(projectDir, definitions);
  assert.deepEqual(DOLLY_STATIC_SOURCES, sources);
  assert.ok(sources.every((item) =>
    ["/static/", "/modules/", "/include/dolly/", "/Dollyfile"].some((prefix) =>
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
    await readFile(new URL(`../build/routes/${image.image}/index.html`, import.meta.url));
    await readFile(new URL(`../build/routes/${image.image}/rebuild/index.html`, import.meta.url));
    await readFile(new URL(`../build/routes/view/${image.image}/index.html`, import.meta.url));
    assert.ok(image.byteLength > 0);
    assert.match(image.sha256, /^[0-9a-f]{64}$/);
  }
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
  const policy = JSON.parse(
    await readFile(new URL("../config/browser-imports.json", import.meta.url), "utf8"),
  );
  const actual = runtime.imports
    .map((entry) => `${entry.module}.${entry.name}`)
    .sort();
  const expected = Object.values(policy).flat().sort();

  assert.deepEqual(actual, expected);
  assert.deepEqual(policy.network, ["env.dolly_http_dispatch"]);
  assert.deepEqual(policy.download, ["env.dolly_download_dispatch"]);
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
