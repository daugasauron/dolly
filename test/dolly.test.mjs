import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validateProcess,
  validateRuntime,
} from "../scripts/dolly-abi.mjs";
import {
  formatWasmType,
  readWasmInterface,
  sameWasmType,
} from "../scripts/wasm-interface.mjs";
import {
  consumeDollyHttpPolicy,
  DollyHttpPolicy,
  isDollyCredentialHeader,
} from "../src/http-policy.mjs";
import { inspectDollyfile } from "../src/dollyfile-view.mjs";
import {
  decodeSessionSnapshot,
  encodeSessionSnapshot,
  sessionImageIdentity,
  validSessionName,
} from "../src/session-store.mjs";
import {
  discoverImageDefinitions,
  inspectStaticSources,
} from "../scripts/image-definitions.mjs";
import { loadDollyfileGraph, recipeRecords } from "../scripts/dollyfile-graph.mjs";

const artifact = (name) => new URL(`../dist/${name}`, import.meta.url);
const kernelPluginContractPath = new URL(
  "../dist/dolly-kernel-plugin-0.wasm",
  import.meta.url,
);
const processContractPath = new URL("../dist/dolly-process-0.wasm", import.meta.url);
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function readImagePlan(image) {
  const definitions = await discoverImageDefinitions(new URL("..", import.meta.url).pathname);
  const definition = definitions.find((item) => item.image === image);
  if (!definition) throw new Error(`unknown image ${image}`);
  const graph = await loadDollyfileGraph(
    new URL("..", import.meta.url).pathname,
    definition.filename,
  );
  return { graph, startup: graph.records.map((record) => record.source).join("\n") };
}

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
  const executablePath = artifact("process-check.wasm");
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
    "func(i64,i64,i64,i64,i64,i32,i32)->()",
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
  const runtimeSource = await readFile(new URL("../src/dolly.c", import.meta.url), "utf8");
  const worker = await readFile(new URL("../src/runtime-worker.mjs", import.meta.url), "utf8");
  const browser = await readFile(new URL("../src/browser.mjs", import.meta.url), "utf8");
  assert.match(runtimeSource, /DOLLY_DOWNLOAD_MAX_BYTES = 64 \* 1024 \* 1024/);
  assert.match(worker, /bytes\.byteLength > 64 \* 1024 \* 1024/);
  assert.match(browser, /maximumDownloadBytes = 64 \* 1024 \* 1024/);
  assert.match(browser, /URL\.createObjectURL\(new Blob/);
  assert.match(browser, /link\.download = message\.name/);
});

test("the runtime implements the opaque system snapshot contract", async () => {
  const contract = await readWasmInterface(artifact("dolly-snapshot-0.wasm"));
  const runtime = await readWasmInterface(artifact("dolly.wasm"));
  const source = await readFile(
    new URL("../src/system-snapshot.c", import.meta.url),
    "utf8",
  );

  assert.deepEqual(
    contract.imports.map((entry) => `${entry.module}.${entry.name}`),
    ["env.memory"],
  );
  for (const required of contract.exports) {
    const actual = runtime.exports.find((entry) => entry.name === required.name);
    assert.ok(actual, `runtime is missing ${required.name}`);
    assert.equal(sameWasmType(actual.type, required.type), true);
  }
  assert.match(source, /DOLLY_SNAPSHOT_MAX_SIZE = \(uintptr_t\)512 \* 1024 \* 1024/);
  assert.match(source, /open\("\/etc\/dolly\/image\.manifest", O_RDONLY\)/);
  assert.match(source, /DOLLY_SNAPSHOT_MAX_FILES = 100000/);
  assert.match(source, /O_WRONLY \| O_CREAT \| O_TRUNC, 0777/);
  assert.match(source, /forbidden_manifest_path/);
  assert.match(source, /"\/tmp", "\/workspace"/);
  assert.match(source, /"\/home\/dolly\/\.pi\/agent\/auth\.json"/);
  assert.match(source, /memcmp\(manifest\.paths\[record\], path, path_length\)/);
  assert.doesNotMatch(source, /static const char \*const system_files/);
});

test("named sessions persist opaque in-Wasm filesystem snapshots", async () => {
  const contract = await readWasmInterface(artifact("dolly-snapshot-0.wasm"));
  const runtime = await readWasmInterface(artifact("dolly.wasm"));
  const source = await readFile(new URL("../src/session-snapshot.c", import.meta.url), "utf8");
  const browser = await readFile(new URL("../src/browser.mjs", import.meta.url), "utf8");
  const worker = await readFile(new URL("../src/runtime-worker.mjs", import.meta.url), "utf8");
  const store = await readFile(new URL("../src/session-store.mjs", import.meta.url), "utf8");
  const loadRoute = await readFile(
    new URL("../build/routes/load/index.html", import.meta.url), "utf8",
  );

  for (const name of [
    "dolly_session_mailbox_address",
    "dolly_session_mailbox_version",
    "dolly_session_name_address",
    "dolly_session_name_capacity",
    "dolly_session_restore_address",
    "dolly_session_restore",
  ]) {
    const required = contract.exports.find((entry) => entry.name === name);
    const actual = runtime.exports.find((entry) => entry.name === name);
    assert.ok(required && actual, `runtime is missing ${name}`);
    assert.equal(sameWasmType(actual.type, required.type), true);
  }
  assert.match(source, /capture_filesystem\(\)/);
  assert.match(source, /clear_mutable_filesystem\(\)/);
  assert.match(source, /"\/home\/dolly\/\.dolly-session-name"/);
  assert.match(source, /strcmp\(path, "\/dev"\)/);
  assert.match(source, /strcmp\(path, "\/seed"\)/);
  assert.match(source, /O_WRONLY \| O_CREAT \| O_TRUNC, 0777/);
  assert.match(browser, /event\.code === "KeyS"/);
  assert.match(browser, /saveStoredSession/);
  assert.match(store, /indexedDB\.open/);
  assert.match(store, /CompressionStream\("gzip"\)/);
  assert.match(worker, /_dolly_session_restore\(BigInt\(sessionRange\.size\)\)/);
  assert.doesNotMatch(browser, /FS\.(?:readdir|readFile|writeFile)/);
  assert.match(loadRoute, /loadSession: true/);

  assert.equal(validSessionName("my-session_1.2"), true);
  for (const invalid of ["", ".", "..", "with space", "slash/name", "x".repeat(65)]) {
    assert.equal(validSessionName(invalid), false);
  }
  const { DOLLY_IMAGES } = await import(artifact("dolly-images.mjs"));
  assert.match(sessionImageIdentity(DOLLY_IMAGES, DOLLY_IMAGES[0].image),
    new RegExp(`^${escapeRegex(DOLLY_IMAGES[0].image)}:[0-9a-f]{64}$`));
  const input = new TextEncoder().encode("DOLLYSES" + " session data ".repeat(128)).buffer;
  const encoded = await encodeSessionSnapshot(input);
  assert.deepEqual(
    new Uint8Array(await decodeSessionSnapshot(encoded)),
    new Uint8Array(input),
  );
});

test("the main artifact is a WebAssembly binary", async () => {
  const bytes = await readFile(artifact("dolly.wasm"));
  assert.deepEqual([...bytes.subarray(0, 8)], [0, 97, 115, 109, 1, 0, 0, 0]);
});

test("the loader is browser-only and process-shaped shell APIs stay in Wasm", async () => {
  const loader = await readFile(artifact("dolly.mjs"), "utf8");
  const processRuntime = await readFile(
    new URL("../src/process/runtime-adapter.c", import.meta.url), "utf8");
  assert.doesNotMatch(loader, /node:fs|readFileSync|NODEFS|NODERAWFS|child_process|spawnSync/);
  assert.doesNotMatch(loader, /PThread|em-pthread|emscripten_thread/);
  assert.doesNotMatch(loader, /window\.prompt|FS_stdin_getChar|_wasmfs_stdin_get_char/);
  assert.doesNotMatch(loader, /__emscripten_system/);
  assert.match(processRuntime, /int system\(const char \*command\)[\s\S]*?dolly_spawn\(\s*"\/bin\/slop"/);
  assert.match(processRuntime, /FILE \*popen\(const char \*command[\s\S]*?pipe\(descriptors\)/);
  assert.match(processRuntime, /int pclose\(FILE \*stream\)[\s\S]*?dolly_wait\(pid, &status\)/);
});

test("the pinned Emscripten dynamic loader reports missing symbols safely", async () => {
  const patcher = await readFile(
    new URL("../scripts/patch-emscripten-loader.mjs", import.meta.url), "utf8",
  );
  assert.match(patcher, /value!=null&&typeof value\.value/);
  assert.match(patcher, /expected exactly one Emscripten undefined-symbol diagnostic/);
});

test("the main-module provider exports Emscripten side-module stack bounds", async () => {
  const packaging = await readFile(
    new URL("../toolchain/CMakeLists.txt", import.meta.url), "utf8",
  );
  assert.match(packaging, /--export=__stack_pointer/);
  assert.match(packaging, /--export=__stack_high/);
  assert.match(packaging, /--export=__stack_low/);
});

test("browser acceptance preserves compiler lifecycle probes on the private process model", async () => {
  const [harness, launcher, roadmap, compiler, browser] = await Promise.all([
    readFile(new URL("../scripts/browser-harness.mjs", import.meta.url), "utf8"),
    readFile(new URL("../scripts/test-browser.sh", import.meta.url), "utf8"),
    readFile(new URL("../docs/roadmap.md", import.meta.url), "utf8"),
    readFile(new URL("../src/compiler.cpp", import.meta.url), "utf8"),
    readFile(new URL("../src/browser.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(harness, /DOLLY_BROWSER_MODE === "zig-single-provider"/);
  assert.match(harness, /DOLLY_BROWSER_MODE === "lifecycle-probe"/);
  assert.match(harness, /DOLLY_BROWSER_MODE === "optimized-lifecycle-probe"/);
  assert.match(harness, /DOLLY_BROWSER_MODE === "make"/);
  assert.match(launcher, /DOLLY_BROWSER_MODE=cpp/);
  assert.match(launcher, /DOLLY_BROWSER_MODE=zig-single-provider/);
  assert.match(roadmap, /every ordinary executable a fresh Worker/);
  assert.match(roadmap, /run mixed Zig and[\s\S]*Clang sequences/);
  assert.match(roadmap, /pure CPU loop exits 124/);
  assert.match(compiler, /"-vectorize-loops"/);
  assert.match(compiler, /"-vectorize-slp"/);
  assert.match(browser, /cc -O0 interrupt-loop\.c -o interrupt-loop/);
});

test("Janis owns and cleans its generated module-adapter scratch tree", async () => {
  const [runtime, runner] = await Promise.all([
    readFile(new URL("../src/runtimes/janis.js", import.meta.url), "utf8"),
    readFile(new URL("../src/runtimes/quickjs-main.c", import.meta.url), "utf8"),
  ]);
  assert.match(runtime, /const janisTemporaryRoot = `\/tmp\/janis-/);
  assert.match(runtime, /globalThis\.__janisCleanup = \(\) =>/);
  assert.match(runtime, /fsRemove\(janisTemporaryRoot, \{ recursive: true, force: true \}\)/);
  assert.match(runner, /cleanup_janis\(context\)/);
});

test("development servers expose application assets rather than the host checkout", async () => {
  for (const relative of ["../scripts/serve.mjs", "../scripts/browser-harness.mjs"]) {
    const source = await readFile(new URL(relative, import.meta.url), "utf8");
    assert.match(source, /const publicSources = new Set/);
    assert.match(source, /const distDirectory = resolve\(projectDir, "dist"\)/);
    assert.match(source, /path\.startsWith\(`\$\{distDirectory\}\$\{sep\}`\)/);
    assert.match(source, /publicSources\.has\(relative\).*distAsset/s);
  }
});

test("the frontend only blits sandbox RGBA and forwards bounded input events", async () => {
  const frontend = await readFile(new URL("../src/browser.mjs", import.meta.url), "utf8");
  const page = await readFile(new URL("../terminal.html", import.meta.url), "utf8");
  const menu = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const worker = await readFile(new URL("../src/runtime-worker.mjs", import.meta.url), "utf8");
  const isolation = await readFile(new URL("../coi-serviceworker.js", import.meta.url), "utf8");

  assert.doesNotMatch(frontend, /ghostty-web|terminal\.write|onData/);
  assert.match(frontend, /const workerUrl = new URL\("\.\/runtime-worker\.mjs"/);
  assert.match(frontend, /runtimeWorker\.postMessage\(\{/);
  assert.match(frontend, /type: "configure"/);
  assert.match(frontend, /new Worker\(workerUrl/);
  assert.match(frontend, /Atomics\.waitAsync/);
  assert.match(
    frontend,
    /for \(;;\) \{\s*if \(this\.activeToken !== token \|\|.*?NetworkTransport\.sequence\).*?!== sequence\).*?const current = Atomics\.load\(this\.words, index\);\s*if \(current === 1\) return;\s*const waiting = Atomics\.waitAsync/s,
  );
  assert.match(frontend, /interruptForeground\(\)/);
  assert.match(frontend, /event\.code === "KeyC"/);
  assert.match(frontend, /networkTransport\?\.interrupt\(\)/);
  assert.match(frontend, /const recipes = new Set\(imageDefinition\?\.recipes/);
  assert.match(frontend, /hasRecipe\("quickjs"\)/);
  assert.match(frontend, /class FramebufferPresenter/);
  assert.match(frontend, /putImageData\(new ImageData/);
  assert.match(frontend, /pushKey\(event\)/);
  assert.match(frontend, /pushRecord/);
  assert.match(frontend, /eventSize !== 128/);
  assert.doesNotMatch(frontend, /dolly_shell_submit|ccall\(/);
  assert.match(worker, /shared: true/);
  assert.match(worker, /_dolly_process_bootstrap_prepare\(\)/);
  assert.match(worker, /_dolly_process_bootstrap_resume_prepare\(/);
  assert.match(worker, /DollyProcessSupervisor\.create\(/);
  assert.match(worker, /httpCheckImage\.dollyfile/);
  assert.doesNotMatch(worker, /new URL\("Dollyfile", applicationBase\)/);
  assert.match(worker, /_dolly_bootstrap_snapshot\(BigInt\(range\.size\)\)/);
  assert.match(worker, /_dolly_snapshot_capture\(\)/);
  assert.match(worker, /dolly-\$\{image\}-system\.snapshot/);
  assert.match(worker, /dolly-\$\{image\}-system-snapshot\.mjs/);
  assert.match(worker, /crypto\.subtle\.digest\("SHA-256", bytes\)/);
  assert.match(worker, /metadata\.buildId !== DOLLY_BUILD_ID/);
  assert.match(worker, /type: "system-snapshot"/);
  assert.doesNotMatch(worker, /indexedDB|localStorage|sessionStorage/);
  assert.match(frontend, /get systemSnapshot\(\)/);
  assert.match(worker, /buildId: DOLLY_BUILD_ID/);
  assert.doesNotMatch(worker, /FS\.(?:readdir|readFile|writeFile).*snapshot/);
  assert.match(worker, /replaceFile\("\/etc\/dolly\/recipe\.locator"/);
  assert.match(worker, /replaceFile\("\/etc\/dolly\/host\.base"/);
  assert.match(worker, /_dolly_write_file\(/);
  assert.match(worker, /replaceFile\("\/etc\/dolly\/image\.manifest"/);
  assert.match(worker, /configuredImage !== "custom"[\s\S]*?findModuleCache\(\)/);
  assert.match(worker, /function runImageEntry\(/);
  assert.match(worker, /readImageEntry\(dolly\)/);
  assert.match(worker, /supervisor\.spawn\(path, arguments_/);
  assert.doesNotMatch(worker, /_dolly_shell_run\(\)/);
  assert.match(worker, /function createDollyMemory\(\)/);
  assert.match(worker, /Dolly requires shared WebAssembly memory64/);
  assert.match(worker, /intentionally has no.*wasm32 fallback/s);
  assert.match(worker, /initial: 1024n/);
  assert.match(worker, /maximum: 131072n/);
  assert.match(worker, /address: "i64"/);
  assert.match(worker, /installOutputDevice\(dolly, "\/dev\/dolly-stdout", 1\)/);
  assert.match(worker, /installOutputDevice\(dolly, "\/dev\/dolly-stderr", 2\)/);
  assert.match(worker, /FS\.registerDevice/);
  assert.match(worker, /_dolly_terminal_write_bytes\(BigInt\(buffer\.byteOffset \+ offset\), BigInt\(length\)\)/);
  assert.match(worker, /type: "broker-ready"/);
  assert.match(frontend, /type: "broker-ready-ack"/);
  assert.match(worker, /waitForBrowserAcknowledgement\(\s*"display-ready-ack"/);
  assert.match(frontend, /type: "display-ready-ack"/);
  assert.match(worker, /_dolly_display_framebuffer_address\(0\)/);
  assert.match(frontend, /requestFullscreen\(\{ navigationUI: "hide" \}\)/);
  assert.match(frontend, /fullscreenchange/);
  assert.match(frontend, /window\.addEventListener\("keydown", handleKeyboardEvent/);
  assert.match(frontend, /const bootstrapMaximumLines = 40/);
  assert.match(frontend, /const bootstrapLines = \[\]/);
  assert.match(frontend, /let bootstrapCharacters = 0/);
  assert.match(frontend, /let bootstrapFragment = ""/);
  assert.match(frontend, /normalized\.lastIndexOf\("\\n"\)/);
  assert.match(frontend, /normalized\.slice\(0, lastNewline \+ 1\)/);
  assert.match(frontend, /appendBootstrap\(bootstrapDecoder\.decode\(\), true\)/);
  assert.match(frontend, /document\.createTextNode\(record\)/);
  assert.match(frontend, /bootstrapLog\.append\(node\)/);
  assert.match(frontend, /const expired = bootstrapLines\.shift\(\)/);
  assert.match(frontend, /expired\.remove\(\)/);
  assert.doesNotMatch(frontend, /bootstrapLog\.textContent = bounded/);
  assert.doesNotMatch(frontend, /fontSize\s*[+\-]=|terminal\.options/);
  assert.doesNotMatch(frontend, /CanvasRenderingContext2D.*fillText|\.fillText\(/);
  assert.doesNotMatch(frontend, /\x1b\[31m|\x1b\[33m\$\{text\}/);
  assert.match(page, /IosevkaTerm-SemiBold\.woff2/);
  assert.doesNotMatch(page, /#bootstrap-log::first-line/);
  assert.match(page, /<canvas id="display"/);
  assert.match(page, /<textarea id="keyboard"/);
  assert.match(page, /id="bootstrap-log"/);
  assert.match(page, /crossOriginIsolated/);
  assert.match(page, /serviceWorker\.register\("\{\{DOLLY_BASE\}\}coi-serviceworker\.js"/);
  assert.doesNotMatch(page, /DOLLY_HTTP_POLICY/);
  assert.doesNotMatch(page, /api\/v1\/chat\/completions/);
  assert.match(isolation, /target\.origin !== self\.location\.origin/);
  assert.match(isolation, /Cross-Origin-Opener-Policy/);
  assert.match(isolation, /Cross-Origin-Embedder-Policy/);
  assert.match(isolation, /headers\.delete\("Content-Encoding"\)/);
  assert.match(isolation, /headers\.delete\("Content-Length"\)/);
  assert.doesNotMatch(isolation, /caches\.|indexedDB|postMessage/);
  assert.match(page, /caret-color: transparent/);
  assert.doesNotMatch(page, /<header|<footer|id="status"/);
  assert.match(menu, /href="\.\/default\/"/);
  assert.match(menu, /href="\.\/default\/rebuild\/"/);
  assert.match(menu, /href="\.\/view\/default\/"/);
  assert.match(menu, /href="\.\/pi\/"/);
  assert.match(menu, /href="\.\/pi\/rebuild\/"/);
  assert.match(menu, /href="\.\/view\/python-pi\/"/);
  assert.doesNotMatch(menu, /<script|URLSearchParams|sessionStorage|dollyfile-upload/);
  assert.doesNotMatch(menu, /voice input/i);
});

test("system snapshots are sealed to their visible recipe chain", async () => {
  const { DOLLY_BUILD_ID } = await import(artifact("dolly-build-id.mjs"));
  const { DOLLY_IMAGES } = await import(artifact("dolly-images.mjs"));
  const projectDir = new URL("..", import.meta.url).pathname;
  const definitions = await discoverImageDefinitions(projectDir);
  const expectedEntries = new Map([
    ["default", "/bin/slop"],
    ["pi", "/usr/bin/pi"],
    ["python", "/bin/slop"],
    ["python-pi", "/usr/bin/pi"],
    ["gamedev", "/usr/bin/graphics-demo"],
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
    assert.ok(metadata.manifest.includes(expectedEntries.get(image)));
    assert.equal(
      metadata.manifest.includes("/usr/bin/pi"),
      ["pi", "python-pi", "gamedev"].includes(image),
    );
    assert.ok(metadata.manifest.includes("/etc/dolly/recipes.lock"));
    for (const recipe of recipes) assert.ok(metadata.manifest.includes(recipe.retainedPath));
    assert.equal(metadata.manifest.some((path) => path.startsWith("/workspace")), false);
    assert.equal(metadata.byteLength, snapshot.byteLength);
    assert.equal(metadata.sha256, createHash("sha256").update(snapshot).digest("hex"));
    assert.deepEqual(metadata.entry, [expectedEntries.get(image)]);
  }
});

test("Dollyfiles compose pinned modules through the sequential C engine", async () => {
  const projectDir = new URL("..", import.meta.url).pathname;
  const definitions = await discoverImageDefinitions(projectDir);
  const graphs = await Promise.all(definitions.map((definition) =>
    loadDollyfileGraph(projectDir, definition.filename)));
  const byImage = new Map(graphs.map((graph) => [graph.root.image, graph]));
  const engine = await readFile(new URL("../src/dollyfile.c", import.meta.url), "utf8");
  const worker = await readFile(new URL("../src/runtime-worker.mjs", import.meta.url), "utf8");
  assert.deepEqual(byImage.get("default").root.children.map(({ name }) => name),
    ["default", "startup-default"]);
  assert.deepEqual(byImage.get("pi").root.children.map(({ name }) => name),
    ["default", "quickjs", "typescript", "pi", "startup-pi"]);
  assert.deepEqual(byImage.get("python").root.children.map(({ name }) => name),
    ["default", "python", "startup-python"]);
  assert.deepEqual(byImage.get("python-pi").root.children.map(({ name }) => name),
    ["default", "python", "quickjs", "typescript", "pi", "python-pi-integration"]);
  assert.deepEqual(byImage.get("gamedev").root.children.map(({ name }) => name),
    ["default", "quickjs", "typescript", "pi", "gamedev", "startup-gamedev"]);
  assert.equal(byImage.get("default").modules.some(({ name }) =>
    ["quickjs", "pi", "python", "gamedev"].includes(name)), false);
  const source = graphs.flatMap(({ records }) => records.map((record) => record.source)).join("\n");
  assert.match(source, /SOURCE HOST \/static\/default\/git\.tar \/tmp\/git\.tar [0-9a-f]{64}/);
  assert.match(source, /SLOP CWD \/usr\/src\/git make/);
  assert.doesNotMatch(source, /DECLARE HTTP|SAMEHOST|\.assets|\bEXTENDS\b|^RUN\b|^CHECK\b/m);
  assert.match(engine, /result = fetch_recipe\(engine, locator, &recipe, digest\)/);
  assert.match(engine, /execute_recipe\(engine, words\[1\], words\[2\], depth \+ 1,[\s\S]*?children/);
  assert.match(engine, /scope_find\(available, words\[0\], words\[1\]\)/);
  assert.match(engine, /permit_tool\(permitted_tools, provider->name\)/);
  assert.match(engine, /depth == 0 && \*uses < engine->resume_uses/);
  assert.match(engine, /if \(!execute\) return 0/);
  assert.match(worker, /isStrictModulePrefix/);
  assert.match(worker, /using \$\{moduleCache\.uses\}-module/);
  assert.doesNotMatch(engine, /DOLLY_SLOP_TOOLS|DOLLY_SLOP_TOOL_RULES/);
  assert.doesNotMatch(await readFile(new URL("../src/slop.c", import.meta.url), "utf8"),
    /DOLLY_SLOP_TOOLS|DOLLY_SLOP_TOOL_RULES/);
  assert.match(engine, /strcmp\(text, "SOURCE"\)[\s\S]*?fetch_source/);
  assert.match(engine, /strcmp\(text, "SLOP"\)[\s\S]*?execute_slop/);
  assert.doesNotMatch(worker, /compileDollyfiles|parseDollyfile|sameHostAssets|\.assets/);
});

test("HOST inputs are independent exact pinned files", async () => {
  const projectDir = new URL("..", import.meta.url).pathname;
  const { DOLLY_IMAGES } = await import(artifact("dolly-images.mjs"));
  const selected = new Set(DOLLY_IMAGES.map(({ image }) => image));
  const definitions = (await discoverImageDefinitions(projectDir))
    .filter(({ image }) => selected.has(image));
  const sources = await inspectStaticSources(projectDir, definitions);
  assert.ok(sources.length >= 50);
  assert.ok(sources.every((item) =>
    ["/static/", "/modules/", "/include/dolly/"].some((prefix) =>
      item.path.startsWith(prefix)) &&
    /^[0-9a-f]{64}$/.test(item.sha256) && item.byteLength > 0));
  assert.equal(sources.some((item) => item.path.endsWith(".assets")), false);
  assert.ok(sources.some((item) => item.path === "/modules/default.dm"));
  assert.ok(sources.some((item) => item.path === "/include/dolly/runtime.h"));
  assert.ok(sources.find((item) => item.path.endsWith("/zig-lib.tar")).byteLength > 200e6);
});

test("registry, routes, and source viewer derive from Dollyfiles", async () => {
  const { DOLLY_IMAGES, DOLLY_STATIC_SOURCES } = await import(artifact("dolly-images.mjs"));
  const knownImages = [
    { image: "default", dollyfile: "Dollyfile" },
    { image: "gamedev", dollyfile: "Dollyfile-gamedev" },
    { image: "pi", dollyfile: "Dollyfile-pi" },
    { image: "python", dollyfile: "Dollyfile-python" },
    { image: "python-pi", dollyfile: "Dollyfile-python-pi" },
  ];
  const selected = new Set(DOLLY_IMAGES.map(({ image }) => image));
  assert.ok(DOLLY_IMAGES.length > 0);
  assert.deepEqual(
    DOLLY_IMAGES.map(({ image, dollyfile }) => ({ image, dollyfile })),
    knownImages.filter(({ image }) => selected.has(image)),
  );
  assert.ok(DOLLY_STATIC_SOURCES.length >= 50);
  for (const image of DOLLY_IMAGES) {
    await readFile(new URL(`../build/routes/${image.image}/index.html`, import.meta.url));
    await readFile(new URL(`../build/routes/${image.image}/rebuild/index.html`, import.meta.url));
    await readFile(new URL(`../build/routes/view/${image.image}/index.html`, import.meta.url));
    assert.ok(image.byteLength > 0);
    assert.match(image.sha256, /^[0-9a-f]{64}$/);
  }
  const viewer = await readFile(new URL("../scripts/render-dollyfile-view.mjs", import.meta.url), "utf8");
  assert.match(viewer, /<a.*href=/);
  assert.match(viewer, /renderUse/);
  assert.match(viewer, /renderRequirement/);
  assert.doesNotMatch(viewer, /URLSearchParams|sessionStorage|location\.search/);
});

test("the common seed builds Dollyfile and only essential command wrappers", async () => {
  const loader = await readFile(artifact("dolly.mjs"), "utf8");
  const bootstrap = await readFile(
    new URL("../src/process/bootstrap.c", import.meta.url), "utf8",
  );
  const worker = await readFile(
    new URL("../src/runtime-worker.mjs", import.meta.url), "utf8",
  );
  const recipe = await readFile(new URL("../Dollyfile", import.meta.url), "utf8");
  for (const output of ["slop", "dollyfile", "mkdir", "rm", "cc", "c++", "ld", "ar"]) {
    assert.match(bootstrap, new RegExp(`"/bin/${escapeRegex(output)}"`));
  }
  assert.doesNotMatch(loader, /\/usr\/bin\/(?:git|make|zig|pi|qjs)/);
  assert.match(bootstrap, /run_child\(\s*"\/bin\/dollyfile"/);
  assert.match(bootstrap, /"\/etc\/dolly\/recipe\.locator"/);
  assert.match(bootstrap, /"\/etc\/dolly\/host\.base"/);
  assert.match(worker, /processSupervisor\.spawn\(\s*"\/usr\/libexec\/dolly\/process-bin\/bootstrap"/);
  assert.doesNotMatch(bootstrap, /startup\.slop/);
  assert.match(recipe, /^DOLLY 2$/m);
  assert.match(recipe, /^USE HOST \/modules\/default\.dm\s+[0-9a-f]{64}$/m);
  assert.match(recipe, /^USE HOST \/modules\/startup-default\.dm\s+[0-9a-f]{64}$/m);
  assert.doesNotMatch(recipe, /BANNER|GREETING/);
  assert.doesNotMatch(recipe, /startup\.mk/);
});

test("external source pins have one shell-native manifest consumed by build scripts", async () => {
  const pins = await readFile(new URL("../config/source-pins.sh", import.meta.url), "utf8");
  const inventory = await readFile(new URL("../docs/sources.md", import.meta.url), "utf8");
  for (const name of [
    "DOLLY_EMSDK_IMAGE",
    "DOLLY_EMSCRIPTEN_COMMIT",
    "DOLLY_LLVM_COMMIT",
    "DOLLY_SBASE_COMMIT",
    "DOLLY_AWK_COMMIT",
    "DOLLY_QUICKJS_COMMIT",
    "DOLLY_PI_SHA256",
    "DOLLY_CURL_COMMIT",
    "DOLLY_ZLIB_COMMIT",
    "DOLLY_GIT_COMMIT",
    "DOLLY_MAKE_SHA256",
    "DOLLY_ZIG_SHA256",
    "DOLLY_ZIG_HOST_X86_64_LINUX_SHA256",
    "DOLLY_ZIG_HOST_AARCH64_LINUX_SHA256",
    "DOLLY_GHOSTTY_COMMIT",
    "DOLLY_UUCODE_SHA256",
    "DOLLY_BISON_SHA256",
    "DOLLY_IOSEVKA_SHA256",
  ]) {
    assert.match(pins, new RegExp(`^${name}=`, "m"));
  }
  for (const path of [
    "../scripts/build.sh",
    "../scripts/build-toolchain.sh",
    "../scripts/build-bison.sh",
    "../scripts/fetch-awk.sh",
    "../scripts/fetch-box3d.sh",
    "../scripts/fetch-cpython.sh",
    "../scripts/fetch-curl.sh",
    "../scripts/fetch-emscripten-system-libs.sh",
    "../scripts/fetch-git.sh",
    "../scripts/fetch-iosevka.sh",
    "../scripts/fetch-libffi.sh",
    "../scripts/fetch-make.sh",
    "../scripts/fetch-zig.sh",
    "../scripts/fetch-zig-host.sh",
    "../scripts/fetch-ghostty.sh",
    "../scripts/fetch-uucode.sh",
    "../scripts/fetch-quickjs.sh",
    "../scripts/fetch-raylib.sh",
    "../scripts/fetch-samurai.sh",
    "../scripts/fetch-sbase.sh",
    "../scripts/fetch-zlib.sh",
    "../scripts/prepare-git.sh",
    "../scripts/prepare-make.sh",
    "../scripts/prepare-samurai.sh",
    "../scripts/prepare-zig-native.sh",
    "../scripts/prepare-ghostty-source.sh",
  ]) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(source, /source "\$\{project_dir\}\/config\/source-pins\.sh"/);
    assert.doesNotMatch(source, /\b[0-9a-f]{40}\b/);
  }
  assert.match(inventory, /Outside-browser preparation/);
  assert.match(inventory, /Inside-Dolly result/);
  assert.match(inventory, /\| Pi \|/);
  assert.match(inventory, /\/home\/dolly\/.*global Git configuration/);
});

test("the wasm64 Clang/LLD cache is bound to its pinned inputs", async () => {
  const build = await readFile(new URL("../scripts/build.sh", import.meta.url), "utf8");
  const toolchain = await readFile(
    new URL("../scripts/build-toolchain.sh", import.meta.url), "utf8",
  );
  const key = await readFile(
    new URL("../scripts/toolchain-cache-key.sh", import.meta.url), "utf8",
  );
  assert.match(build, /installed_toolchain_key/);
  assert.match(build, /cached wasm64 Clang\/LLD provider is stale/);
  assert.match(toolchain, /\.dolly-toolchain-key/);
  assert.match(toolchain, /mv -T -- "\$\{temporary_stamp\}"/);
  assert.match(key, /DOLLY_LLVM_COMMIT/);
  assert.match(key, /DOLLY_EMSDK_IMAGE/);
  assert.match(key, /config\/lld-dolly\.patch/);
  assert.match(key, /scripts\/build-toolchain\.sh/);
});

test("bootstrap creates a writable HOME with a default global Git identity", async () => {
  const runtime = await readFile(new URL("../src/dolly.c", import.meta.url), "utf8");
  const { startup } = await readImagePlan("default");
  assert.match(runtime, /setenv\("HOME", "\/home\/dolly", 1\)/);
  assert.match(startup, /FILE \/home\/dolly\/\.gitconfig/);
  assert.match(startup, /\[user\]/);
  assert.match(startup, /name = Dolly/);
  assert.match(startup, /email = dolly@example\.invalid/);
});

test("slop reserves only stateful shell operations and resolves utilities through PATH", async () => {
  const shell = await readFile(new URL("../src/slop.c", import.meta.url), "utf8");
  const runtime = await readFile(new URL("../src/dolly.c", import.meta.url), "utf8");
  const { graph, startup } = await readImagePlan("default");
  const copy = graph.modules.find(({ name }) => name === "core-tools").files
    .find(({ path }) => path === "/tmp/core-tools/cp.c").body;
  for (const builtin of [":", "exit", "cd", "export", "unset", "set"]) {
    assert.match(shell, new RegExp(`strcmp\\(argv\\[0\\], "${escapeRegex(builtin)}"\\)`));
  }
  for (const command of ["help", "pwd", "cat", "echo", "mkdir", "touch", "rm", "clear", "ls", "mv", "cp", "cc", "c++", "ld", "ar", "make", "demo"] ) {
    assert.doesNotMatch(shell, new RegExp(`strcmp\\(argv\\[0\\], "${escapeRegex(command)}"\\)`));
  }
  assert.match(shell, /resolve_command\(argv\[0\]/);
  assert.match(shell, /resolved_command_at[\s\S]*?realpath\(candidate, absolute\)/);
  assert.match(runtime, /setenv\("PATH", "\/bin:\/usr\/bin", 1\)/);
  assert.match(shell, /int xtrace;/);
  assert.match(shell, /option\[index\] == 'x'/);
  assert.match(shell, /setenv\("HISTFILE", "\/home\/dolly\/\.slop_history"/);
  assert.match(shell, /SLOP_MAX_HISTORY 1000/);
  assert.match(shell, /history_add\(&history, line\)/);
  assert.match(shell, /complete_line\(line, &length, &cursor\)/);
  assert.match(shell, /dolly_terminal_read_raw_timeout\(-1\)/);
  assert.match(shell, /case 'A': return 1;/);
  assert.match(shell, /case 'B': return 2;/);
  assert.match(shell, /SLOP_DEFERRED_STATUS/);
  assert.match(shell, /expand_deferred_status\(shell, tokens, start, end\)/);
  assert.match(shell, /kind == TOKEN_NOT && tokens->count != 0/);
  assert.doesNotMatch(shell, /readline|linenoise|editline/);
  assert.match(startup, /SLOP cc \\\n[\s\S]*?-o \/bin\/tar/);
  assert.match(startup, /SLOP git \\\n\s+--version/);
  assert.doesNotMatch(shell, /chmod|X_OK|S_IXUSR|S_IXGRP|S_IXOTH/);
  assert.match(startup, /SLOP cc \\\n\s+\/tmp\/core-tools\/cp\.c \\\n\s+-o \/bin\/cp/);
  assert.match(copy, /copy_directory/);
  assert.doesNotMatch(copy, /chmod|chown|st_mode\s*&/);
});

test("GNU Make is source-pinned and executes every job synchronously through Slop", async () => {
  const manifest = await readFile(new URL("../config/make-sources.txt", import.meta.url), "utf8");
  const patch = await readFile(new URL("../config/make-dolly.patch", import.meta.url), "utf8");
  const adapter = await readFile(new URL("../src/runtimes/make-dolly.c", import.meta.url), "utf8");
  const prepare = await readFile(new URL("../scripts/prepare-make.sh", import.meta.url), "utf8");
  const fetch = await readFile(new URL("../scripts/fetch-make.sh", import.meta.url), "utf8");

  assert.match(manifest, /^src\/main\.c$/m);
  assert.match(manifest, /^src\/remote-stub\.c$/m);
  assert.match(fetch, /DOLLY_MAKE_SHA256/);
  assert.match(prepare, /make-dolly\.patch/);
  assert.match(patch, /default_shell = "\/bin\/slop"/);
  assert.match(patch, /arg_job_slots = 1/);
  assert.match(patch, /dolly_make_shell_capture/);
  assert.match(adapter, /start_remote_job_p/);
  assert.match(adapter, /dolly_spawn_env/);
  assert.match(adapter, /argv\[1\] = "-c"/);
  assert.match(adapter, /mkstemp \(path\)/);
  assert.match(adapter, /unlink \(path\)/);
  assert.doesNotMatch(adapter, /\bfork\s*\(|\bexec[a-z]*\s*\(/);
});

test("the private compiler validates and stamps staged outputs before publication", async () => {
  const compiler = await readFile(new URL("../src/compiler.cpp", import.meta.url), "utf8");
  const packaging = await readFile(
    new URL("../toolchain/CMakeLists.txt", import.meta.url), "utf8",
  );
  assert.match(compiler, /temporary_path\(job, options\.inputs\.size\(\) \+ 1, "\.wasm"\)/);
  assert.match(compiler, /options\.kernel_plugin \? "-fvisibility=hidden" : "-fvisibility=default"/);
  assert.match(compiler, /link_process_executable\(linked, link_inputs/);
  assert.match(compiler, /if \(strip_debug\) arguments\.push_back\("--strip-debug"\)/);
  assert.match(compiler, /options\.debug_info == DebugInfoKind::None/);
  assert.match(compiler, /validate_process_executable\(linked, false\)/);
  assert.match(compiler, /stamp_process_executable\(linked\)/);
  assert.match(compiler, /validate_process_executable\(linked, true\)/);
  assert.match(compiler, /--dolly-kernel-plugin requires the process compiler and -shared/);
  assert.match(compiler, /validate_shared_object\(linked, kKernelContractPath\)/);
  assert.match(compiler, /stamp_kernel_plugin\(linked\)/);
  assert.match(compiler, /std::rename\(source\.c_str\(\), output\.c_str\(\)\)/);
  assert.match(compiler, /WasmFS cannot rename across every backend boundary/);
  assert.match(compiler, /std::fopen\(output\.c_str\(\), "wb"\)/);
  assert.match(packaging, /add_executable\(dolly-process-compiler/);
  assert.match(packaging, /add_executable\(dolly\s+[\s\S]*?\.\.\/src\/process-kernel\.c/);
  const kernelTarget = packaging.slice(
    packaging.indexOf("add_executable(dolly\n"),
    packaging.indexOf("add_executable(dolly-process-compiler"),
  );
  assert.doesNotMatch(kernelTarget, /compiler\.cpp|zig_llvm|target_link_libraries\(dolly/);
});

test("foreground SIGINT is PID-targeted and always has a forced Worker termination path", async () => {
  const display = await readFile(new URL("../include/dolly/display.h", import.meta.url), "utf8");
  const runtime = await readFile(new URL("../src/dolly.c", import.meta.url), "utf8");
  const compiler = await readFile(new URL("../src/compiler.cpp", import.meta.url), "utf8");
  const supervisor = await readFile(
    new URL("../src/process-supervisor.mjs", import.meta.url), "utf8",
  );
  const processRuntime = await readFile(
    new URL("../src/process/runtime-adapter.c", import.meta.url), "utf8",
  );
  const processKernel = await readFile(
    new URL("../src/process-kernel.c", import.meta.url), "utf8",
  );
  const quickjs = await readFile(new URL("../src/runtimes/quickjs-main.c", import.meta.url), "utf8");

  assert.match(display, /interrupt_sequence/);
  assert.match(display, /interrupt_target_pid/);
  assert.match(runtime, /target != 0 && target == foreground/);
  assert.match(supervisor, /#interruptForeground\(pid\)/);
  assert.match(supervisor, /#disposeWorker\(process\)/);
  assert.match(supervisor, /worker\.terminate\(\)/);
  assert.match(supervisor, /process\.memory = null/);
  assert.match(supervisor, /addEventListener\("messageerror"/);
  assert.match(supervisor, /Worker failed \$\{stage\}/);
  assert.match(supervisor, /interrupt\(pid\)[\s\S]*?#forceExit\(pid, 130\)/);
  assert.match(supervisor, /_dolly_process_worker_failed\(pid, status\)/);
  assert.match(supervisor, /#terminateDescendantWorkers\(pid, status\)/);
  assert.match(supervisor,
               /#terminateDescendantWorkers\(parentPid, status\)[\s\S]*?_dolly_process_collect\(process\.pid\)/);
  assert.match(supervisor, /_dolly_process_signal\(process\.pid, sigint\)/);
  assert.match(supervisor, /interruptGraceMilliseconds = 500/);
  assert.match(supervisor, /#armDeadline\(process\)/);
  assert.match(supervisor, /#forceExit\(process\.pid, 124\)/);
  assert.match(supervisor, /crypto\.subtle\.digest\("SHA-256", bytes\)/);
  assert.match(supervisor, /compiledModuleCacheEntries = 64/);
  assert.match(supervisor, /compiledModuleCacheBytes = 256 \* 1024 \* 1024/);
  assert.match(supervisor, /createProcessMemory\(memoryRequirements\)/);
  assert.match(processKernel, /dolly_process_deadline_remaining\(int pid\)/);
  assert.match(processKernel,
               /process->pending_signal == SIGINT[\s\S]*?128 \+ SIGINT/);
  const timeoutCommand = await readFile(
    new URL("../src/commands/timeout.c", import.meta.url), "utf8",
  );
  assert.match(timeoutCommand, /realpath\(name, absolute\).*strdup\(absolute\)/s);
  assert.match(quickjs, /dolly_spawn_timeout\("\/bin\/slop"/);
  assert.match(compiler, /argument == "-fdolly-runtime-interrupt-handler"/);
  assert.match(quickjs, /JS_SetInterruptHandler\(runtime, quickjs_interrupt_handler/);
  assert.match(quickjs, /dolly_isatty\(descriptor\)/);
  assert.match(processRuntime,
               /int dolly_isatty\(int descriptor\)[\s\S]*?DOLLY_PROCESS_TERMINAL_ISATTY/);
  assert.match(processKernel,
               /DOLLY_PROCESS_TERMINAL_ISATTY:[\s\S]*?terminal_descriptors\[request\.descriptor\]/);
  const { graph } = await readImagePlan("pi");
  const quickjsRecipe = graph.modules.find(({ name }) => name === "quickjs").source;
  assert.match(quickjsRecipe, /CPPFLAGS :=[\s\S]*?-fdolly-runtime-interrupt-handler/);
  assert.match(processRuntime, /dolly_interrupt_poll[\s\S]*?DOLLY_PROCESS_INTERRUPT_POLL/);
});

test("POSIX poll uses typed in-Wasm descriptor readiness and exposes slow compile feedback", async () => {
  const processAbi = await readFile(
    new URL("../include/dolly/process.h", import.meta.url), "utf8",
  );
  const processKernel = await readFile(
    new URL("../src/process-kernel.c", import.meta.url), "utf8",
  );
  const runtime = await readFile(new URL("../src/dolly.c", import.meta.url), "utf8");
  const adapter = await readFile(new URL("../src/process/poll.c", import.meta.url), "utf8");
  const supervisor = await readFile(
    new URL("../src/process-supervisor.mjs", import.meta.url), "utf8",
  );

  assert.match(processAbi, /DOLLY_PROCESS_FD_POLL = 54/);
  assert.match(processAbi, /dolly_process_poll_request/);
  assert.match(processKernel, /fd_poll_packet[\s\S]*?DOLLY_PROCESS_DISPATCH_DEFERRED/);
  assert.match(processKernel, /dolly_terminal_raw_ready_timeout\(0\)/);
  assert.match(runtime, /dolly_terminal_raw_ready_timeout[\s\S]*?dolly_terminal_fill_raw_timeout/);
  assert.match(adapter, /int poll\(struct pollfd \*descriptors/);
  assert.match(adapter, /DOLLY_PROCESS_FD_POLL/);
  assert.doesNotMatch(adapter, /\bfetch\s*\(|\bWebSocket\b|\bnode:/);
  assert.match(supervisor, /preparing .*WebAssembly executable for this session/);
  assert.match(supervisor, /executable ready in/);
  assert.match(supervisor, /#serviceTick\(\)[\s\S]*?_dolly_terminal_present_pending\(\)/);
});

test("the in-Wasm kernel performs bounded shebang dispatch before process launch", async () => {
  const kernel = await readFile(new URL("../src/process-kernel.c", import.meta.url), "utf8");
  assert.match(kernel, /static int redirect_shebang\(/);
  assert.match(kernel, /interpreter\[0\] != '\/'/);
  assert.match(kernel, /DOLLY_KERNEL_SHEBANG_LIMIT/);
  assert.match(kernel, /DOLLY_KERNEL_SHEBANG_DEPTH/);
  assert.match(kernel, /replacement\[populated\+\+\] = strdup\(process->path\)/);
  assert.doesNotMatch(kernel, /system\(.*shebang|execv.*shebang|node.*shebang/i);
});

test("foreground commands can exclusively lease and safely restore the in-Wasm framebuffer", async () => {
  const display = await readFile(new URL("../include/dolly/display.h", import.meta.url), "utf8");
  const processAbi = await readFile(new URL("../include/dolly/process.h", import.meta.url), "utf8");
  const processKernel = await readFile(new URL("../src/process-kernel.c", import.meta.url), "utf8");
  const processAdapter = await readFile(
    new URL("../src/process/runtime-adapter.c", import.meta.url), "utf8",
  );
  const runtime = await readFile(new URL("../src/dolly.c", import.meta.url), "utf8");
  const driver = await readFile(new URL("../src/ghostty/display.c", import.meta.url), "utf8");
  const packaging = await readFile(new URL("../scripts/build.sh", import.meta.url), "utf8");
  const gamedev = await readFile(new URL("../modules/gamedev.dm", import.meta.url), "utf8");
  const browser = await readFile(new URL("../src/browser.mjs", import.meta.url), "utf8");

  assert.match(display, /DOLLY_DISPLAY_PIXEL_RGBA8/);
  assert.match(display, /dolly_display_acquire\(dolly_display_surface \*surface\)/);
  assert.match(display, /dolly_display_begin_frame\(uint64_t generation/);
  assert.match(display, /dolly_display_next_event\(uint64_t generation/);
  assert.match(display, /void \(\*set_suspended\)\(int suspended\)/);
  assert.match(runtime, /buffer_index != \(active \^ 1u\)/);
  assert.match(runtime, /display_lease\.owner_pid != owner_pid/);
  assert.match(runtime, /Events already published while the graphics owner was active/);
  assert.match(runtime, /paste_consumed_sequence[\s\S]*?paste_sequence/);
  assert.match(
    processKernel,
    /mark_process_exited[\s\S]*?dolly_kernel_display_release_owner\(process->pid\)/,
  );
  assert.match(processAdapter, /dolly_display_next_event[\s\S]*?DOLLY_PROCESS_DISPLAY_NEXT_EVENT/);
  assert.match(processAbi, /DOLLY_PROCESS_DISPLAY_BEGIN_FRAME = 98/);
  assert.match(processAbi, /DOLLY_PROCESS_DISPLAY_WRITE_FRAME = 99/);
  assert.match(processAbi, /offset.*must be the next unwritten/s);
  assert.match(processKernel, /dolly_kernel_display_write_frame/);
  assert.match(processKernel, /DOLLY_PROCESS_DISPLAY_NEXT_EVENT/);
  assert.match(processKernel, /dolly_kernel_display_release_owner\(process->pid\)/);
  assert.match(processAdapter, /DOLLY_PROCESS_DISPLAY_WRITE_FRAME/);
  assert.match(processAdapter, /DOLLY_PROCESS_PACKET_LIMIT - header_size/);
  assert.match(processAdapter, /display_pixels \+ offset/);
  assert.doesNotMatch(processAdapter, /display_frames|display_mailbox/);
  assert.match(driver, /DRIVER_ABI_VERSION = 3/);
  assert.match(driver, /if \(suspended \|\| terminal == NULL/);
  assert.match(driver, /if \(was_suspended && !suspended\) render_frame\(\)/);
  assert.match(driver, /static cached_glyph ascii_glyphs\[128\]/);
  assert.match(driver, /if \(event == NULL && frame_dirty\) render_frame\(\)/);
  assert.match(driver, /frame_dirty = true/);
  assert.match(runtime, /int dolly_terminal_present_pending\(void\)/);
  assert.match(runtime, /handle_event\(\s*NULL, &preserved, 0, &output_length\)/);
  assert.match(display, /DOLLY_INPUT_EVENT_SCROLL = 7/);
  assert.match(driver, /ghostty_selection_gesture_new/);
  assert.match(driver, /ghostty_selection_gesture_event\(/);
  assert.match(driver, /ghostty_terminal_scroll_viewport/);
  assert.match(browser, /pushScroll\(deltaRows\)/);
  assert.match(browser, /addEventListener\("wheel"/);
  assert.match(browser, /event\.pointerType === "touch"/);
  assert.match(gamedev, /dolly_display_acquire\(&context->surface\)/);
  assert.match(gamedev, /dolly_display_present\(context->surface\.generation/);
  assert.match(gamedev, /\/usr\/bin\/graphics-demo: \/usr\/src\/dolly\/gamedev\/graphics-demo\.c/);
  assert.match(packaging, /fetch-box3d\.sh/);
  assert.match(gamedev, /FILE \/usr\/src\/dolly\/gamedev\/graphics-demo\.c\n    /);
  assert.match(gamedev, /FILE \/usr\/src\/dolly\/gamedev\/gamedev\.mk\n    /);
  assert.match(gamedev, /EXPORTS TOOL\s+graphics-demo/);
  assert.match(gamedev, /raylib\.tar/);
  assert.match(gamedev, /box3d\.tar/);
  assert.match(gamedev, /skills\/dolly-gamedev\/SKILL\.md/);
  assert.match(gamedev, /-DPLATFORM_MEMORY/);
  assert.match(gamedev, /libbox3d\.a/);
  assert.match(gamedev, /#include <box3d\/box3d\.h>/);
  assert.match(gamedev, /#include <dolly\/raylib\.h>/);
  assert.match(browser, /graphicsActive\(\)/);
  assert.doesNotMatch(gamedev, /EM_JS|fetch\s*\(|window\.|document\./i);
});

test("process executables and DSOs are revalidated at their actual load boundaries", async () => {
  const compiler = await readFile(new URL("../src/compiler.cpp", import.meta.url), "utf8");
  const supervisor = await readFile(
    new URL("../src/process-supervisor.mjs", import.meta.url), "utf8",
  );
  const worker = await readFile(new URL("../src/process-worker.mjs", import.meta.url), "utf8");
  const runtime = await readFile(new URL("../src/dolly.c", import.meta.url), "utf8");

  assert.match(compiler, /bool has_kernel_plugin_stamp\(const std::string &path\)/);
  assert.match(compiler, /matches != 1/);
  assert.match(supervisor, /function validateProcessModule\(module\)/);
  assert.match(supervisor, /customSections\(module, "dolly\.process"\)/);
  assert.match(supervisor, /largeInteractiveProcessBytes/);
  assert.match(supervisor, /workerReclamationMilliseconds/);
  assert.match(supervisor, /imports\.length !== 2/);
  assert.match(worker, /function validateDsoModule\(module\)/);
  assert.match(worker, /customSections\(module, "dolly\.process\.dso"\)/);
  assert.match(worker, /shared-object import is outside the process namespace/);
  assert.match(runtime, /install_display_driver[\s\S]*?dlopen\(driver_path, RTLD_NOW \| RTLD_LOCAL\)/);
  assert.doesNotMatch(runtime, /dolly_run_filesystem_module|dolly_toolchain_validate/);
});

test("Janis implements measured hashes exactly and fails loudly for absent zlib", async () => {
  const source = await readFile(new URL("../src/runtimes/janis.js", import.meta.url), "utf8");
  const cryptoSource = source.slice(
    source.indexOf("function rotateRight"),
    source.indexOf("const janisCrypto"),
  );
  const loadCrypto = new Function(
    "Buffer",
    `${cryptoSource}; return { createHash, createHmac };`,
  );
  const { createHash: janisHash, createHmac: janisHmac } = loadCrypto(Buffer);

  assert.equal(
    janisHash("sha256").update("abc").digest("hex"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  assert.equal(janisHash("md5").update("abc").digest("hex"), "900150983cd24fb0d6963f7d28e17f72");
  assert.equal(
    janisHmac("sha256", "key").update("The quick brown fox jumps over the lazy dog").digest("hex"),
    "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8",
  );
  assert.doesNotMatch(source, /pseudoDigest|gzipSync: \(value\) => Buffer\.from/);
  assert.match(source, /gzipSync: unavailableZlib/);
  assert.doesNotMatch(source, /return \{ \.\.\.spawn\("\/bin\/echo"/);
  assert.match(source, /message\.includes\("No such file or directory"\) \? "ENOENT"/);
  assert.match(source, /message\.includes\("File exists"\) \? "EEXIST"/);
  assert.match(source, /\["rmdir", janisFs\.rmdirSync\]/);
  assert.match(source, /child\.unref = \(\) => child/);
  assert.match(source, /crypto\.subtle \?\?=/);
  assert.match(source, /Janis Web Crypto does not implement digest/);
  assert.match(source, /createServer: \(listener\) =>/);
});

test("the in-Wasm C driver accepts relaxed aliasing mode", async () => {
  const compiler = await readFile(new URL("../src/compiler.cpp", import.meta.url), "utf8");
  assert.match(compiler, /argument == "-fno-strict-aliasing"/);
  assert.match(compiler, /push_back\("-relaxed-aliasing"\)/);
  assert.match(compiler, /options\.frontend_options\.push_back\(argument\)/);
});

test("the in-Wasm C driver exposes Clang-compatible preprocessing", async () => {
  const compiler = await readFile(new URL("../src/compiler.cpp", import.meta.url), "utf8");
  assert.match(compiler, /argument == "-E"/);
  assert.match(compiler, /argument == "-dM"/);
  assert.match(compiler, /argument == "-"/);
  assert.match(compiler, /arguments\.push_back\("-E"\)/);
  assert.match(compiler, /arguments\.push_back\("-dM"\)/);
  assert.match(compiler, /-dM requires -E/);
  assert.match(compiler, /LLD 24\.0\.0 \(Dolly wasm-ld\)/);
  assert.match(compiler, /!starts_with\(argument, "-Wl,"\)/);
  assert.match(compiler, /argument == "-MD" \|\| argument == "-MMD"/);
  assert.match(compiler, /"-dependency-file", options\.dependency_file/);
  assert.match(compiler, /"-MT", options\.dependency_target/);
  assert.match(compiler, /argument == "-fdiagnostics-color=always"/);
});

test("the C++ SDK uses the pinned no-exception libc++ target profile", async () => {
  const compiler = await readFile(new URL("../src/compiler.cpp", import.meta.url), "utf8");
  const cpp = await readFile(new URL("../modules/cpp.dm", import.meta.url), "utf8");
  const packaging = await readFile(
    new URL("../toolchain/CMakeLists.txt", import.meta.url), "utf8",
  );
  const compilerRtPreparation = await readFile(
    new URL("../scripts/prepare-compiler-rt.sh", import.meta.url), "utf8",
  );
  assert.match(compiler, /argument == "-fexceptions"/);
  assert.match(compiler, /argument == "-fno-exceptions"/);
  assert.match(compiler, /option == "--start-group"/);
  assert.match(compiler, /is_implicit_process_runtime_library/);
  assert.match(compiler, /link_process_shared_object[\s\S]*"-Bsymbolic"/);
  assert.match(compiler, /argument == "-fno-rtti"/);
  assert.match(compiler, /"--no-check-features"/);
  assert.match(compiler, /"--threads=1"/);
  assert.ok(
    compiler.indexOf('"/usr/include/compat"') <
      compiler.indexOf('"/usr/include/c++/v1"') &&
    compiler.indexOf('"/usr/include/c++/v1"') <
      compiler.indexOf('"/usr/lib/clang/24/include"'),
    "embedded C++ include order must match the pinned Emscripten driver",
  );
  for (const library of ["libc++.a", "libc++abi.a", "libclang_rt.builtins.a"]) {
    assert.match(compiler, new RegExp(escapeRegex(`/usr/lib/${library}`)));
  }
  assert.ok(
    compiler.indexOf('link_inputs.push_back("/usr/lib/libclang_rt.builtins.a")') >
      compiler.indexOf("if (needs_cxx_runtime)"),
    "compiler-rt must be linked for C commands as well as C++ commands",
  );
  assert.match(cpp, /SLOP ar \\\n+  rcs \\\n+  \/usr\/lib\/libc\+\+abi\.a/);
  assert.match(cpp, /SOURCE HOST \/static\/default\/libcxx-headers\.tar/);
  assert.match(cpp, /SLOP tar \\\n+  -xf \/tmp\/cpp\/libcxx-headers\.tar/);
  assert.match(packaging, /--exclude-file \*\/c\+\+\/v1\/\*/);
  assert.match(packaging, /build\/generated\/libclang_rt\.dolly\.a/);
  assert.match(compilerRtPreparation, /ar d "\$\{staging\}" emscripten_setjmp\.o/);
  assert.match(compilerRtPreparation, /mv -T -- "\$\{staging\}" "\$\{output_archive\}"/);
  assert.match(cpp, /EXPORTS LIB\s+c\+\+abi\s+\/usr\/lib\/libc\+\+abi\.a/);
  assert.match(cpp, /SLOP rm \\\n+  -rf \\\n+  \/tmp\/cpp/);
});

test("the process DSO provider exposes only reviewed reserved libc ABI names", async () => {
  const preparation = await readFile(
    new URL("../scripts/prepare-process-sysroot.sh", import.meta.url), "utf8",
  );
  const reserved = await readFile(
    new URL("../config/process-libc-provider.symbols", import.meta.url), "utf8",
  );
  assert.match(preparation, /process-libc-provider\.symbols/);
  assert.match(preparation, /\^emscripten_/);
  for (const symbol of ["__errno_location", "__fpclassifyl", "__signbitl"]) {
    assert.match(reserved, new RegExp(`^${symbol}$`, "m"));
  }
  assert.doesNotMatch(reserved, /emscripten/);
});

test("the process DSO loader resolves self imports and weak relocations", async () => {
  const loader = await readFile(
    new URL("../src/process-worker.mjs", import.meta.url), "utf8",
  );
  const fixture = await readFile(
    new URL("../src/process/dso-cpp-library.cpp", import.meta.url), "utf8",
  );
  assert.match(loader, /id === 4/);
  assert.match(loader, /weakImports\.add/);
  assert.match(loader, /dsoInstance && symbolFrom\(dsoInstance\.exports/);
  assert.match(loader, /relocation\.weak/);
  assert.match(fixture, /std::unordered_map<int, std::function<int\(int\)>>/);
});

test("wasm64 libffi uses process-local operations without another machine import", async () => {
  const header = await readFile(
    new URL("../include/dolly/process.h", import.meta.url), "utf8",
  );
  const backend = await readFile(
    new URL("../src/runtimes/libffi-dolly.c", import.meta.url), "utf8",
  );
  const dispatcher = await readFile(
    new URL("../src/process-ffi.mjs", import.meta.url), "utf8",
  );
  const worker = await readFile(
    new URL("../src/process-worker.mjs", import.meta.url), "utf8",
  );
  for (const operation of [
    "FFI_CALL",
    "FFI_CLOSURE_ALLOC",
    "FFI_CLOSURE_FREE",
    "FFI_CLOSURE_PREP",
  ]) {
    assert.match(header, new RegExp(`DOLLY_PROCESS_${operation}`));
    assert.match(backend, new RegExp(`DOLLY_PROCESS_${operation}`));
  }
  assert.match(dispatcher, /function typedWasmFunction/);
  assert.match(dispatcher, /getTable\(\)/);
  assert.match(
    backend,
    /size < sizeof\(ffi_closure\) \? sizeof\(ffi_closure\) : size/,
  );
  assert.doesNotMatch(
    dispatcher,
    /\bfetch\b|XMLHttpRequest|importScripts|postMessage/,
  );
  assert.match(worker, /processFfi\.call\(operation, request, response\)/);
  const contract = await readWasmInterface(processContractPath);
  assert.deepEqual(
    contract.imports.map((entry) => `${entry.module}.${entry.name}`),
    ["env.memory", "dolly_process_0.call"],
  );
});

test("Zig bootstraps the retained Ghostty VT and display libraries inside Dolly", async () => {
  const pins = await readFile(new URL("../config/source-pins.sh", import.meta.url), "utf8");
  const { graph } = await readImagePlan("default");
  const zigRecipe = graph.modules.find(({ name }) => name === "zig").source;
  const ghosttyRecipe = graph.modules.find(({ name }) => name === "ghostty").source;
  const nativeMain = await readFile(new URL("../src/zig/native-main.zig", import.meta.url), "utf8");
  const nativeOptions = await readFile(new URL("../src/zig/native-build-options.zig", import.meta.url), "utf8");
  const nativeBuild = await readFile(new URL("../scripts/build-native-zig.sh", import.meta.url), "utf8");
  const nativePrepare = await readFile(new URL("../scripts/prepare-zig-native.sh", import.meta.url), "utf8");
  const zigPatch = await readFile(new URL("../patches/zig-0.16.0-dolly-native.patch", import.meta.url), "utf8");
  const ghosttyFetch = await readFile(new URL("../scripts/fetch-ghostty.sh", import.meta.url), "utf8");
  const ghosttyPatch = await readFile(new URL("../config/ghostty-dolly.patch", import.meta.url), "utf8");
  const build = await readFile(new URL("../scripts/build.sh", import.meta.url), "utf8");
  const packaging = await readFile(new URL("../toolchain/CMakeLists.txt", import.meta.url), "utf8");
  const processAbi = await readFile(
    new URL("../abi/dolly-process-0.wat", import.meta.url), "utf8",
  );
  const zigBrowserGate = await readFile(
    new URL("../scripts/browser-harness.mjs", import.meta.url), "utf8",
  );

  assert.match(pins, /DOLLY_ZIG_VERSION=0\.16\.0/);
  assert.match(pins, /DOLLY_ZIG_SHA256=[0-9a-f]{64}/);
  assert.match(pins, /DOLLY_ZIG_HOST_X86_64_LINUX_SHA256=[0-9a-f]{64}/);
  assert.match(pins, /DOLLY_ZIG_HOST_AARCH64_LINUX_SHA256=[0-9a-f]{64}/);
  assert.match(pins, /DOLLY_GHOSTTY_COMMIT=[0-9a-f]{40}/);
  assert.match(pins, /DOLLY_UUCODE_SHA256=[0-9a-f]{64}/);
  assert.match(pins, /DOLLY_IOSEVKA_TTF_SHA256=[0-9a-f]{64}/);
  assert.match(pins, /DOLLY_STB_TRUETYPE_SHA256=[0-9a-f]{64}/);

  assert.doesNotMatch(zigRecipe, /zig-check|zig-object-check|answer\.zig|\/tmp\/zig\/Makefile/);
  assert.match(ghosttyRecipe, /SLOP CWD \/usr\/src\/ghostty make/);
  assert.doesNotMatch(ghosttyRecipe, /\/usr\/bin\/ghostty-vt/);
  assert.match(ghosttyRecipe, /EXPORTS LIB\s+ghostty-vt\s+\/usr\/lib\/libghostty-vt\.a/);
  assert.match(ghosttyRecipe, /EXPORTS LIB\s+display\s+\/usr\/lib/);
  assert.match(ghosttyRecipe, /EXPORTS ENV\s+DISPLAY\s+\/usr\/lib\/libdisplay\.so/);
  assert.doesNotMatch(ghosttyRecipe, /display-wasm|display\.wasm/);

  assert.match(ghosttyRecipe, /\/tmp\/ghostty-vt\.o:[\s\S]*?>zig[\s\S]*?-femit-bin=\$@/);
  assert.match(ghosttyRecipe, /\/usr\/lib\/libghostty-vt\.a:[\s\S]*?>ar rcs/);
  assert.match(ghosttyRecipe, /\/usr\/lib\/libdisplay\.so:[\s\S]*?>cc[\s\S]*?-shared[\s\S]*?-lghostty-vt/);

  assert.match(nativeBuild, /fetch-zig-host\.sh/);
  assert.match(nativeBuild, /prepare-zig-native\.sh/);
  assert.match(nativeBuild, /"\$\{host_dir\}\/zig" build-obj/);
  assert.match(nativeBuild, /-target wasm64-emscripten/);
  assert.match(nativeBuild, /-mcpu=generic\+atomics/);
  assert.match(nativeBuild, /-fPIC/);
  assert.match(nativeBuild, /-Mroot="\$\{project_dir\}\/src\/zig\/native-main\.zig"/);
  assert.match(nativeBuild, /-femit-bin="\$\{temporary_object\}"/);
  assert.match(nativeBuild, /object-inputs\.sha256/);
  assert.match(nativeBuild, /trap 'rm -rf -- "\$\{temporary_dir\}"' EXIT/);
  assert.match(nativeBuild,
    /mv -- "\$\{temporary_object_stamp\}" "\$\{object_stamp\}"/);
  assert.doesNotMatch(nativeBuild, /temporary_module|validate-command/);
  assert.match(nativePrepare, /zig-0\.16\.0-dolly-native\.patch/);
  assert.match(nativePrepare, /patch --batch --forward/);
  assert.match(nativeMain, /const compiler = @import\("compiler"\)/);
  assert.match(nativeMain, /compiler\.main\(/);
  assert.match(nativeMain, /export fn ZigClang_main/);
  assert.match(nativeMain, /export fn ZigLlvmAr_main/);
  assert.match(nativeMain, /export fn dolly_main/);
  assert.doesNotMatch(nativeMain, /ZigLLDLink|socket\(|posix_spawn\(/);
  assert.match(nativeOptions, /skip_non_native = true/);
  assert.match(nativeOptions, /have_llvm = true/);
  assert.match(nativeOptions, /dev: DevEnv = \.core/);

  assert.match(zigPatch, /nlink_t = usize/);
  assert.match(zigPatch, /nfds_t = u32/);
  assert.match(zigPatch, /native_os != \.emscripten/);
  assert.match(zigPatch, /version_command/);
  assert.match(zigPatch, /initializeLLVMTarget/);
  assert.match(zigPatch, /LLVMInitializeWebAssemblyTarget/);
  assert.match(zigPatch, /Dolly's native Zig compiler only includes the WebAssembly LLVM target/);

  assert.match(ghosttyFetch, /status --porcelain/);
  assert.match(ghosttyPatch, /builtin\.target\.cpu\.arch\.isWasm\(\) and builtin\.link_libc/);
  assert.match(build, /prepare-zig-native\.sh/);
  assert.match(build, /build-native-zig\.sh/);
  assert.match(build, /-DDOLLY_ZIG_DIR="\$\{zig_container_dir\}"/);

  assert.match(zigRecipe, /SOURCE HOST \/static\/default\/commands\/zig\.c\s+\/tmp\/zig\.c/);
  assert.match(zigRecipe, /SLOP cc \\\n+  \/tmp\/zig\.c \\\n+  -o \/usr\/bin\/zig/);
  assert.match(zigRecipe, /SOURCE HOST \/static\/default\/zig-lib\.tar/);
  assert.match(ghosttyRecipe, /SOURCE HOST \/static\/default\/ghostty\.tar/);
  assert.match(ghosttyRecipe, /SOURCE HOST \/static\/default\/uucode\.tar/);
  assert.doesNotMatch(packaging, /--preload-file .*DOLLY_(?:ZIG|GHOSTTY|UUCODE)/);
  assert.match(packaging, /sysroot\/include@\/seed\/usr\/include/);
  assert.match(packaging, /"\$\{DOLLY_ZIG_DIR\}\/src\/zig_llvm\.cpp"/);
  assert.match(packaging, /add_executable\(dolly-process-compiler[\s\S]*?"\$\{DOLLY_ZIG_OBJECT\}"/);
  assert.doesNotMatch(processAbi, /Zig|LLVM|LLD/);
  assert.match(zigBrowserGate, /zig build-obj -OReleaseSmall -target wasm64-emscripten/);
  assert.match(zigBrowserGate, /test -s \/tmp\/dolly-zig-single\.o/);
  assert.doesNotMatch(zigBrowserGate, /zig-object-check browser-answer\.o/);

  for (const source of [pins, ghosttyRecipe, nativeMain, nativeBuild, build, packaging]) {
    assert.doesNotMatch(source, /WAMR|wasm2c|-ofmt=c|ghostty-vt\.c/i);
  }
});

test("raw sockets terminate in the process runtime while HTTP uses the typed broker", async () => {
  const runtime = await readFile(
    new URL("../src/process/runtime-adapter.c", import.meta.url), "utf8",
  );
  const libcurl = await readFile(new URL("../src/libcurl-fetch.c", import.meta.url), "utf8");
  const curlCommand = await readFile(new URL("../src/commands/curl.c", import.meta.url), "utf8");

  for (const name of ["socket", "connect", "bind", "listen", "recv", "send"]) {
    assert.match(runtime, new RegExp(`(?:int|ssize_t) ${name}\\(`));
  }
  assert.match(runtime, /static int raw_socket_unavailable\(void\) \{\s*errno = ENOSYS;/);
  assert.match(runtime, /dolly_process_call\(\s*DOLLY_PROCESS_HTTP_START/);
  assert.doesNotMatch(libcurl, /\bsocket\s*\(|\bconnect\s*\(|\bgetaddrinfo\s*\(/);
  assert.match(libcurl, /dolly_http_perform\(&request, &response\)/);
  for (const option of [
    "--request", "--header", "--data", "--json", "--head", "--include",
    "--user", "--range", "--remote-name", "--dump-header", "--write-out",
    "--fail-with-body",
  ]) assert.match(curlCommand, new RegExp(option));
  assert.match(curlCommand, /CURLOPT_CUSTOMREQUEST/);
  assert.match(curlCommand, /CURLOPT_HTTPHEADER/);
  assert.match(curlCommand, /CURLOPT_POSTFIELDS/);
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

test("the browser HTTP policy owns destination authority while credentials stay in Wasm", () => {
  const policy = new DollyHttpPolicy({
    maxRequests: 2,
    rules: [{
      origin: "https://models.example",
      pathPrefix: "/v1/",
      methods: ["POST"],
      credentialHeaders: ["authorization"],
      maxRequestBytes: 128,
      maxResponseBytes: 256,
      timeoutMilliseconds: 1000,
    }],
  });
  const headers = new Headers({
    authorization: "Bearer compromised-wasm",
    cookie: "ambient=bad",
    "content-type": "application/json",
  });
  const rule = policy.authorize(
    new URL("https://models.example/v1/chat/completions"),
    "POST",
    headers,
    32,
  );
  assert.equal(headers.get("authorization"), "Bearer compromised-wasm");
  assert.equal(headers.has("cookie"), false);
  assert.equal(headers.get("content-type"), "application/json");
  assert.equal(rule.maxResponseBytes, 256);
  assert.throws(
    () => policy.authorize(
      new URL("https://models.example/v2/chat/completions"),
      "POST",
      new Headers(),
      0,
    ),
    /denied/,
  );
  assert.throws(
    () => policy.authorize(
      new URL("https://models.example/v1/chat/completions"),
      "POST",
      new Headers(),
      0,
    ),
    /quota/,
  );
  assert.equal(isDollyCredentialHeader("Authorization"), true);
  assert.equal(isDollyCredentialHeader("content-type"), false);
});

test("the no-configuration HTTP policy permits generic destinations and credentials", () => {
  const policy = new DollyHttpPolicy();
  const headers = new Headers({
    authorization: "Bearer sandbox-key",
    "x-api-key": "sandbox-api-key",
  });
  policy.authorize(new URL("https://models.example/v1/models"), "GET", headers, 0);
  assert.equal(headers.get("authorization"), "Bearer sandbox-key");
  assert.equal(headers.get("x-api-key"), "sandbox-api-key");
  assert.doesNotThrow(() => policy.authorize(
    new URL("http://source.example/archive.tar.gz"),
    "POST",
    new Headers(),
    0,
  ));
});

test("the browser consumes credential policy without exposing it as page state", () => {
  const page = {
    DOLLY_HTTP_POLICY: {
      rules: [{
        origin: "https://models.example",
        pathPrefix: "/v1/",
        methods: ["POST"],
      }],
    },
  };
  const policy = consumeDollyHttpPolicy(page);
  assert.equal("DOLLY_HTTP_POLICY" in page, false);
  assert.equal(policy.hardened, true);
});

test("exact HTTP policy paths cannot be widened by a matching prefix", () => {
  const policy = new DollyHttpPolicy({
    rules: [{
      origin: "https://models.example",
      path: "/v1/chat/completions",
      methods: ["POST"],
    }],
  });
  assert.throws(
    () => policy.authorize(
      new URL("https://models.example/v1/chat/completions/redirect"),
      "POST",
      new Headers(),
      0,
    ),
    /denied/,
  );
});

test("bootstrap sources are exact read-only broker capabilities", () => {
  const policy = new DollyHttpPolicy(
    { maxRequests: 8, rules: [] },
    [{ path: "/static/tool.tar", byteLength: 1234 }],
    "https://dolly.example/app/",
  );
  const headers = new Headers({ authorization: "Bearer sandbox-secret" });
  const rule = policy.authorize(
    new URL("https://dolly.example/app/static/tool.tar"),
    "GET",
    headers,
    0,
  );
  assert.equal(rule.maxResponseBytes, 1234);
  assert.equal(headers.has("authorization"), false);
  assert.equal(policy.requests, 0, "trusted build inputs do not spend agent quota");
  for (const target of [
    "https://dolly.example/app/static/tool.tar?copy=1",
    "https://dolly.example/app/static/tool.tar/child",
    "https://dolly.example/static/tool.tar",
  ]) {
    assert.throws(
      () => policy.authorize(new URL(target), "GET", new Headers(), 0),
      /denied/,
    );
  }
  assert.throws(
    () => policy.authorize(
      new URL("https://dolly.example/app/static/tool.tar"), "POST", new Headers(), 0,
    ),
    /denied/,
  );
});

test("Pi receives ANSI color, cooperative timers, and incremental Fetch body chunks", async () => {
  const httpHeader = await readFile(new URL("../include/dolly/http.h", import.meta.url), "utf8");
  const runtime = await readFile(new URL("../src/dolly.c", import.meta.url), "utf8");
  const quickjs = await readFile(new URL("../src/runtimes/quickjs-main.c", import.meta.url), "utf8");
  const nodeRuntime = await readFile(new URL("../src/runtimes/dolly-node.js", import.meta.url), "utf8");
  const janis = await readFile(new URL("../src/runtimes/janis.js", import.meta.url), "utf8");
  const renderer = await readFile(new URL("../src/ghostty/display.c", import.meta.url), "utf8");
  const ghosttyRecipe = await readFile(new URL("../modules/ghostty.dm", import.meta.url), "utf8");
  const settings = JSON.parse(
    await readFile(new URL("../src/pi/settings.json", import.meta.url), "utf8"),
  );
  const theme = JSON.parse(
    await readFile(new URL("../src/pi/dolly-theme.json", import.meta.url), "utf8"),
  );
  const browserProof = await readFile(
    new URL("../scripts/browser-harness.mjs", import.meta.url),
    "utf8",
  );

  assert.match(httpHeader, /int dolly_http_start\(/);
  assert.match(httpHeader, /int dolly_http_poll\(/);
  assert.match(runtime, /dolly_http_perform[\s\S]*?dolly_http_start\(/);
  assert.match(runtime, /dolly_http_perform[\s\S]*?dolly_http_poll\(/);
  assert.match(quickjs, /DOLLY_JS_FUNCTION\("httpStart", js_dolly_http_start, 4\)/);
  assert.match(quickjs, /DOLLY_JS_FUNCTION\("httpPoll", js_dolly_http_poll, 1\)/);
  assert.match(nodeRuntime, /const pendingHttp = new Map\(\)/);
  assert.match(nodeRuntime, /globalThis\.__dollyHttpPump =/);
  assert.match(nodeRuntime, /Dolly\.httpPoll\(sequence\)/);
  assert.match(nodeRuntime, /new ReadableStream\(/);
  assert.match(nodeRuntime, /Dolly\.httpStart\(method, url, headerBlock, body\)/);
  assert.match(janis, /const pumpedHttp = Boolean\(globalThis\.__dollyHttpPump\?\.\(\)\)/);
  assert.match(janis, /Math\.min\(pumpedHttp \? 10 : 1000, nextDue\)/);
  assert.match(janis, /function janisShellStream\(/);
  assert.match(runtime, /setenv\("TERM", "xterm-256color", 1\)/);
  assert.match(runtime, /setenv\("COLORTERM", "truecolor", 1\)/);
  assert.match(runtime, /setenv\("SHELL", "\/bin\/slop", 1\)/);
  assert.doesNotMatch(runtime, /setenv\("(?:DISPLAY|ZIG_LIB_DIR|PI_PACKAGE_DIR)"/);
  assert.match(ghosttyRecipe, /EXPORTS ENV\s+DISPLAY\s+\/usr\/lib\/libdisplay\.so/);
  assert.match(renderer, /GHOSTTY_STYLE_COLOR_RGB\) return value->value\.rgb/);
  assert.match(renderer, /return terminal_palette\[value->value\.palette\]/);
  assert.equal(settings.theme, "dolly");
  assert.equal(settings.shellPath, "/bin/slop");
  assert.equal(theme.vars.yellow, "#f2d45c");
  assert.match(browserProof, /response\.write\(`data:/);
  assert.match(browserProof, /piFixtureStream\.phase = "prefix"/);
  assert.match(browserProof, /thinkingAfter\.frame > thinkingStart\.frame/);
  assert.match(browserProof, /prefixBaselineFrame = await currentFrameSequence/);
  assert.match(browserProof, /assert\.notEqual\(prefixRenderedFrame, null/);
  assert.match(browserProof, /piPalette\.accentOutsideCursor > 20/);
  assert.match(browserProof, /Pi's ! command executing ls through \/bin\/slop/);
  assert.match(browserProof, /Pi's ! command publishing child output before exit/);
  assert.match(browserProof, /Pi buffered child output until the command exited/);
  assert.match(browserProof, /__dollyIncompleteBootstrapPaints/);
});

test("upstream Pi is compiled in Dolly and customized only through normal files", async () => {
  const fetchSource = await readFile(new URL("../scripts/fetch-pi-source.sh", import.meta.url), "utf8");
  const packageRuntime = await readFile(
    new URL("../scripts/build-pi-runtime-packages.mjs", import.meta.url), "utf8",
  );
  const piRecipe = await readFile(new URL("../modules/pi.dm", import.meta.url), "utf8");
  const { startup } = await readImagePlan("pi");
  const toolchain = await readFile(new URL("../toolchain/CMakeLists.txt", import.meta.url), "utf8");
  const extension = await readFile(new URL("../src/pi/dolly-tools.js", import.meta.url), "utf8");
  const quickjs = await readFile(new URL("../src/runtimes/quickjs-main.c", import.meta.url), "utf8");
  const systemPrompt = await readFile(new URL("../src/pi/SYSTEM.md", import.meta.url), "utf8");
  const dollySkill = await readFile(
    new URL("../src/pi/skills/dolly/SKILL.md", import.meta.url),
    "utf8",
  );
  const settings = JSON.parse(
    await readFile(new URL("../src/pi/settings.json", import.meta.url), "utf8"),
  );
  const runtimeWorker = await readFile(
    new URL("../src/runtime-worker.mjs", import.meta.url), "utf8",
  );
  const browser = await readFile(new URL("../src/browser.mjs", import.meta.url), "utf8");
  const page = await readFile(new URL("../terminal.html", import.meta.url), "utf8");

  assert.match(fetchSource, /git clone --quiet --filter=blob:none --no-checkout/);
  assert.match(fetchSource, /checkout --quiet "\$\{DOLLY_PI_SOURCE_COMMIT\}"/);
  assert.match(packageRuntime, /package-lock\.json/);
  assert.match(packageRuntime, /typeof locked\.integrity !== "string"/);
  assert.match(piRecipe, /SOURCE HOST \/static\/default\/pi-source\.tar/);
  assert.match(piRecipe, /SLOP CWD \/usr\/src\/pi-source\/packages\/coding-agent tsc/);
  assert.match(piRecipe, /SLOP janis -m \/usr\/lib\/pi\/apply-pi-quickjs-compat\.mjs/);
  assert.match(piRecipe, /SLOP make \\\n  -f \/tmp\/pi\/Makefile/);
  for (const name of ["bash", "read", "edit", "write", "download"]) {
    assert.match(extension, new RegExp(`name: "${name}"`));
  }
  assert.match(extension, /globalThis\.__janisShellStream\([\s\S]*parameters\.command, onChunk, onChunk/);
  assert.match(quickjs, /pipe-backed output/);
  assert.match(quickjs, /poll\(streams, 2, 16\)/);
  assert.match(quickjs, /pump_command_stream/);
  assert.match(quickjs, /drain_command_jobs/);
  assert.match(quickjs, /stdin_file == NULL \? 0 : fileno\(stdin_file\)/);
  assert.match(extension, /context\.ui\.setHeader/);
  assert.match(extension, /! Slop/);
  assert.match(extension, /Bash is not installed/);
  assert.match(extension, /Dolly\.(?:readFile|writeFile)/);
  assert.match(extension, /Dolly\.download\(target\)/);
  assert.match(extension, /registerCommand\("demo"/);
  assert.match(startup, /EXPORTS ENV\s+PI_SKIP_VERSION_CHECK\s+1/);
  assert.match(startup, /skills\/dolly\/SKILL\.md/);
  assert.match(dollySkill, /https:\/\/github\.com\/daugasauron\/dolly/);
  assert.match(dollySkill, /env\.dolly_http_dispatch/);
  assert.match(systemPrompt, /cannot disable browser CORS/);
  assert.match(extension, /pi\.on\("session_start"/);
  assert.match(runtimeWorker, /readImageEntry\(dolly\)/);
  assert.match(runtimeWorker, /supervisor\.spawn\(path, arguments_/);
  assert.match(runtimeWorker, /image entry exited; entering the recovery Slop shell/);
  assert.match(runtimeWorker, /restarting Pi after unexpected status/);
  assert.match(runtimeWorker, /status === 130/);
  assert.match(page, /id="phone-menu-button"/);
  assert.match(page, /data-dolly-input="\/login openrouter\\r"/);
  assert.doesNotMatch(page, /data-dolly-voice/);
  assert.doesNotMatch(browser, /SpeechRecognition|webkitSpeechRecognition|getUserMedia/);
  assert.match(browser, /dataset\.defaultPi = "passed"/);
  assert.match(systemPrompt, /Slop/);
  assert.match(systemPrompt, /Dolly does not contain Bash/);
  assert.match(systemPrompt, /browser WebAssembly sandbox/);
  assert.deepEqual(settings.npmCommand, ["/bin/echo"]);
  assert.equal(settings.shellPath, "/bin/slop");
  assert.match(startup, /extensions\/dolly-tools\.js/);
  assert.match(startup, /\.pi\/agent\/SYSTEM\.md/);
  assert.match(startup, /SOURCE HOST \/static\/default\/runtimes\/janis\.js\s+\/usr\/lib\/janis\/runtime\.js/);
  assert.match(startup, /SOURCE HOST \/static\/default\/pi-source\.tar/);
  assert.match(startup, /SOURCE HOST \/static\/default\/pi-runtime-packages\.tar/);
});
