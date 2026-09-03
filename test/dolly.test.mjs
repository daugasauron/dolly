import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { validateCommand, validateRuntime } from "../scripts/dolly-abi.mjs";
import {
  formatWasmType,
  readWasmInterface,
  sameWasmType,
} from "../scripts/wasm-interface.mjs";
import {
  consumeDollyHttpPolicy,
  DollyHttpPolicy,
  isDollyCredentialHeader,
  stripDollyBrowserOwnedHeaders,
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
import {
  decodeSnapshotEntry,
  decodeSystemSnapshot,
} from "../scripts/system-snapshot-format.mjs";

const artifact = (name) => new URL(`../dist/${name}`, import.meta.url);
const contractPath = new URL("../dist/dolly-0.wasm", import.meta.url);
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const commandNames = [
  "program-writer.wasm",
  "program-reader.wasm",
  "program-inspector.wasm",
];

async function readImagePlan(image) {
  const definitions = await discoverImageDefinitions(new URL("..", import.meta.url).pathname);
  const byImage = new Map(definitions.map((definition) => [definition.image, definition]));
  const layers = [];
  let definition = byImage.get(image);
  while (definition) {
    layers.unshift(definition);
    definition = definition.extends ? byImage.get(definition.extends) : null;
  }
  return { startup: layers.map((layer) => layer.source).join("\n") };
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

function readU32(bytes, cursor) {
  let result = 0;
  let shift = 0;
  for (;;) {
    const byte = bytes[cursor.offset++];
    result |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return result;
    shift += 7;
  }
}

function commandWithWrongEntryType(input) {
  const bytes = new Uint8Array(input);
  const cursor = { offset: 8 };
  while (cursor.offset < bytes.length) {
    const section = bytes[cursor.offset++];
    const length = readU32(bytes, cursor);
    const end = cursor.offset + length;
    if (section === 3) {
      const count = readU32(bytes, cursor);
      assert.ok(count >= 2);
      const ctorType = readU32(bytes, cursor);
      for (let index = 1; index < count; index++) {
        assert.ok(bytes[cursor.offset] < 0x80);
        if (index === count - 1) bytes[cursor.offset] = ctorType;
        readU32(bytes, cursor);
      }
      return bytes;
    }
    cursor.offset = end;
  }
  throw new Error("command has no function section");
}

function commandWithUnknownImport(input) {
  const bytes = new Uint8Array(input);
  const needle = new TextEncoder().encode("strcmp");
  for (let offset = 0; offset <= bytes.length - needle.length; offset += 1) {
    if (needle.every((byte, index) => bytes[offset + index] === byte)) {
      bytes[offset + needle.length - 1] = "q".charCodeAt(0);
      return bytes;
    }
  }
  throw new Error("command has no strcmp import");
}

function commandWithWrongContractStamp(input) {
  const bytes = new Uint8Array(input);
  const needle = new TextEncoder().encode("dolly.abi");
  for (let offset = 0; offset <= bytes.length - needle.length - 32; offset += 1) {
    if (needle.every((byte, index) => bytes[offset + index] === byte)) {
      bytes[offset + needle.length] ^= 0xff;
      return bytes;
    }
  }
  throw new Error("command has no dolly.abi stamp");
}

test("dolly-0 is a wasm64 contract with a typed command entry", async () => {
  const contract = await readWasmInterface(contractPath);
  const memory = contract.imports.find((entry) => entry.module === "env" && entry.name === "memory");
  const table = contract.imports.find(
    (entry) => entry.module === "env" && entry.name === "__indirect_function_table",
  );
  const entry = contract.exports.find((item) => item.name === "dolly_main");
  const toolchain = contract.imports.find(
    (item) => item.module === "env" && item.name === "dolly_toolchain_main",
  );
  const commandExit = contract.imports.find(
    (item) => item.module === "env" && item.name === "dolly_exit",
  );
  const spawnTimeout = contract.imports.find(
    (item) => item.module === "env" && item.name === "dolly_spawn_timeout",
  );

  assert.equal(formatWasmType(memory.type), "memory64(min=1024,max=131072,shared)");
  assert.equal(formatWasmType(table.type), "table64(min=1,max=*):funcref");
  assert.equal(formatWasmType(entry.type), "func(i32,i64)->(i32)");
  assert.equal(formatWasmType(toolchain.type), "func(i32,i64,i32)->(i32)");
  assert.equal(formatWasmType(commandExit.type), "func(i32)->()");
  assert.equal(
    formatWasmType(spawnTimeout.type),
    "func(i64,i32,i64,i32,i32,i32,f64)->(i32)",
  );
  for (const [name, type] of [
    ["dolly_terminal_mode_get", "func(i32)->(i32)"],
    ["dolly_terminal_mode_set", "func(i32,i32)->(i32)"],
  ]) {
    const operation = contract.imports.find(
      (item) => item.module === "env" && item.name === name,
    );
    assert.equal(formatWasmType(operation.type), type);
  }
  assert.equal(contract.imports.some((item) => item.name === "exit"), false);
  const isblank = contract.imports.find(
    (item) => item.module === "env" && item.name === "isblank",
  );
  assert.equal(formatWasmType(isblank.type), "func(i32)->(i32)");
  for (const name of ["exp2f", "logf"]) {
    const operation = contract.imports.find(
      (item) => item.module === "env" && item.name === name,
    );
    assert.equal(formatWasmType(operation.type), "func(f32)->(f32)");
  }
  const fmaxf = contract.imports.find(
    (item) => item.module === "env" && item.name === "fmaxf",
  );
  assert.equal(formatWasmType(fmaxf.type), "func(f32,f32)->(f32)");
  for (const [name, type] of [
    ["dolly_display_acquire", "func(i64)->(i32)"],
    ["dolly_display_set_size", "func(i64,i32,i32,i64)->(i32)"],
    ["dolly_display_begin_frame", "func(i64,i64)->(i32)"],
    ["dolly_display_present", "func(i64,i32)->(i32)"],
    ["dolly_display_wait_frame", "func(i64,i64,f64)->(i32)"],
    ["dolly_display_set_cursor", "func(i64,i32)->(i32)"],
    ["dolly_display_next_event", "func(i64,i64,f64)->(i32)"],
    ["dolly_display_release", "func(i64)->(i32)"],
  ]) {
    const operation = contract.imports.find(
      (item) => item.module === "env" && item.name === name,
    );
    assert.equal(formatWasmType(operation.type), type);
  }
});

test("commands satisfy the canonical Dolly contract", async () => {
  await validateCommand(
    contractPath,
    commandNames.map((name) => artifact(name)),
  );

  for (const name of commandNames) {
    const module = await readWasmInterface(artifact(name));
    assert.ok(module.imports.some((entry) => entry.type.kind === "memory"), `${name} does not import memory`);
    assert.ok(
      module.imports.some((entry) => entry.name === "fopen" || entry.name === "opendir"),
      `${name} does not import the runtime filesystem libc`,
    );
    assert.ok(
      module.exports.some((entry) => entry.type.kind === "func" && entry.name === "dolly_main"),
      `${name} does not export dolly_main`,
    );
    assert.ok(
      module.imports.every((entry) => entry.module === "env" || entry.module.startsWith("GOT.")),
      `${name} has an unexpected host import`,
    );
    assert.equal(
      module.imports.some((entry) => entry.module === "wasi_snapshot_preview1"),
      false,
      `${name} unexpectedly delegates its filesystem to a WASI host`,
    );
  }
});

test("the validator rejects wrong contracts, undeclared imports, and signature drift", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "dolly-abi-"));
  try {
    const inspector = await readFile(artifact("program-inspector.wasm"));
    const unknownImportPath = join(temporary, "unknown-import.wasm");
    const wrongEntryPath = join(temporary, "wrong-entry.wasm");
    const wrongContractPath = join(temporary, "wrong-contract.wasm");
    await writeFile(unknownImportPath, commandWithUnknownImport(inspector));
    await writeFile(wrongEntryPath, commandWithWrongEntryType(inspector));
    await writeFile(wrongContractPath, commandWithWrongContractStamp(inspector));

    await assert.rejects(
      validateCommand(contractPath, [wrongContractPath]),
      /dolly\.abi does not match the selected contract/,
    );
    await assert.rejects(
      validateCommand(contractPath, [unknownImportPath]),
      /import is outside dolly-0: env\.strcmq/,
    );
    await assert.rejects(
      validateCommand(contractPath, [wrongEntryPath]),
      /export dolly_main must be func\(i32,i64\)->\(i32\)/,
    );
  } finally {
    await rm(temporary, { recursive: true });
  }
});

test("Emscripten's JSON export list is derived from the Wasm contract", async () => {
  const actual = JSON.parse(
    await readFile(new URL("../build/runtime-exports.json", import.meta.url), "utf8"),
  );
  const expected = new Set([
    "_dolly_bootstrap",
    "_dolly_shell_run",
    "_main",
  ]);
  const contract = await readWasmInterface(contractPath);
  const displayContract = await readWasmInterface(artifact("dolly-display-0.wasm"));
  const snapshotContract = await readWasmInterface(artifact("dolly-snapshot-0.wasm"));

  for (const entry of contract.imports) {
    if (!moduleInfrastructure.has(entry.name) && !loaderBackedFunctions.has(entry.name)) {
      expected.add(`_${entry.name}`);
    }
  }
  for (const entry of displayContract.exports) expected.add(`_${entry.name}`);
  for (const entry of snapshotContract.exports) expected.add(`_${entry.name}`);

  assert.deepEqual(actual, [...expected].sort());
});

test("the runtime implements dolly-0", async () => {
  await validateRuntime(contractPath, artifact("dolly.wasm"));
});

test("the runtime exposes the typed slop shell boundary", async () => {
  const runtime = await readWasmInterface(artifact("dolly.wasm"));
  const bootstrap = runtime.exports.find((entry) => entry.name === "dolly_bootstrap");
  const run = runtime.exports.find((entry) => entry.name === "dolly_shell_run");
  const mailbox = runtime.exports.find(
    (entry) => entry.name === "dolly_display_mailbox_address",
  );

  assert.equal(formatWasmType(bootstrap.type), "func()->(i32)");
  assert.equal(formatWasmType(run.type), "func()->(i32)");
  assert.equal(formatWasmType(mailbox.type), "func()->(i64)");
  assert.equal(runtime.exports.some((entry) => entry.name === "dolly_shell_start"), false);
  assert.equal(runtime.exports.some((entry) => entry.name === "dolly_shell_submit"), false);
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
  assert.match(sessionImageIdentity(DOLLY_IMAGES, "python"),
    /^default:[0-9a-f]{64}\npython:[0-9a-f]{64}$/);
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

test("the loader is browser-only and has no native filesystem path", async () => {
  const loader = await readFile(artifact("dolly.mjs"), "utf8");
  const runtime = await readFile(new URL("../src/dolly.c", import.meta.url), "utf8");
  assert.doesNotMatch(loader, /node:fs|readFileSync|NODEFS|NODERAWFS|child_process|spawnSync/);
  assert.doesNotMatch(loader, /PThread|em-pthread|emscripten_thread/);
  assert.doesNotMatch(loader, /window\.prompt|FS_stdin_getChar|_wasmfs_stdin_get_char/);
  assert.doesNotMatch(loader, /__emscripten_system/);
  for (const operation of ["dolly_system", "dolly_popen", "dolly_pclose"]) {
    assert.match(runtime, new RegExp(`${operation}\\([^)]*\\).*?errno = ENOSYS`, "s"));
  }
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
  assert.match(frontend, /class FramebufferPresenter/);
  assert.match(frontend, /putImageData\(new ImageData/);
  assert.match(frontend, /pushKey\(event\)/);
  assert.match(frontend, /pushRecord/);
  assert.match(frontend, /eventSize !== 128/);
  assert.doesNotMatch(frontend, /dolly_shell_submit|ccall\(/);
  assert.match(worker, /shared: true/);
  assert.match(worker, /_dolly_bootstrap\(\)/);
  assert.match(worker, /_dolly_bootstrap_snapshot\(BigInt\(range\.size\)\)/);
  assert.match(worker, /_dolly_snapshot_capture\(\)/);
  assert.match(worker, /dolly-\$\{configuredImage\}-system\.snapshot/);
  assert.match(worker, /dolly-\$\{configuredImage\}-system-snapshot\.mjs/);
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
  assert.match(worker, /_dolly_shell_run\(\)/);
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
  assert.match(worker, /_dolly_display_framebuffer_address\(0\)/);
  assert.match(frontend, /requestFullscreen\(\{ navigationUI: "hide" \}\)/);
  assert.match(frontend, /fullscreenchange/);
  assert.match(frontend, /window\.addEventListener\("keydown", handleKeyboardEvent/);
  assert.match(frontend, /const bootstrapMaximumLines = 40/);
  assert.match(
    frontend,
    /displayFatal\(error instanceof Error \? error\.message : String\(error\)\)/,
  );
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
  assert.match(page, /Dolly failed to load/);
  assert.match(page, /dataset\.dollyStatus = "failed"/);
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
  assert.match(menu, /import \{ DOLLY_IMAGES \} from "\.\/dist\/dolly-images\.mjs"/);
  assert.match(menu, /`\.\/\$\{definition\.image\}\/`/);
  assert.match(menu, /`\.\/\$\{definition\.image\}\/rebuild\/`/);
  assert.match(menu, /`\.\/view\/\$\{definition\.image\}\/`/);
  assert.match(menu, /`\.\/\$\{definition\.dollyfile\}`/);
  assert.match(menu, /id="dollyfile-upload"/);
  assert.match(menu, /sessionStorage\.setItem\("dolly-custom-source"/);
  assert.doesNotMatch(menu, /voice input/i);
});

test("system snapshots are sealed to their visible recipe chain", async () => {
  const { DOLLY_BUILD_ID } = await import(artifact("dolly-build-id.mjs"));
  const definitions = await discoverImageDefinitions(new URL("..", import.meta.url).pathname);
  const byImage = new Map(definitions.map((item) => [item.image, item]));
  for (const image of definitions.map(({ image }) => image)) {
    const snapshot = await readFile(artifact(`dolly-${image}-system.snapshot`));
    const { DOLLY_SYSTEM_SNAPSHOT: metadata } = await import(
      artifact(`dolly-${image}-system-snapshot.mjs`)
    );
    const chain = [];
    for (let current = byImage.get(image); current; current = current.extends
      ? byImage.get(current.extends)
      : null) {
      chain.unshift(current.image);
    }
    assert.equal(metadata.image, image);
    assert.equal(metadata.buildId, DOLLY_BUILD_ID);
    assert.equal(metadata.identityVersion, 2);
    assert.deepEqual(metadata.recipes, chain.map((name) => {
      const definition = byImage.get(name);
      return {
        image: name,
        path: `/${definition.filename}`,
        sha256: createHash("sha256").update(definition.source).digest("hex"),
      };
    }));
    assert.deepEqual(metadata.manifest, [...metadata.manifest].sort());
    assert.ok(metadata.manifest.includes("/usr/bin/pi"));
    assert.ok(metadata.manifest.includes("/etc/dolly/recipes.lock"));
    assert.equal(metadata.manifest.some((path) => path.startsWith("/workspace")), false);
    assert.equal(metadata.byteLength, snapshot.byteLength);
    assert.equal(metadata.sha256, createHash("sha256").update(snapshot).digest("hex"));
    assert.deepEqual(metadata.entry, ["/usr/bin/pi"]);
    const decoded = decodeSystemSnapshot(snapshot);
    assert.deepEqual(decoded.manifest, metadata.manifest);
    assert.deepEqual(
      decodeSnapshotEntry(decoded.files.get("/etc/dolly/entry")),
      metadata.entry,
    );
  }
});

test("the platform census derives exact typed imports from sealed executables", async () => {
  const packageDefinition = JSON.parse(await readFile(
    new URL("../package.json", import.meta.url),
    "utf8",
  ));
  const census = await readFile(
    new URL("../scripts/platform-census.mjs", import.meta.url),
    "utf8",
  );
  assert.equal(packageDefinition.scripts.census, "node scripts/platform-census.mjs");
  assert.match(census, /metadata\.sha256 !== sha256/);
  assert.match(census, /customSections\.includes\("dolly\.abi"\)/);
  assert.match(census, /item\.name === "dolly_main"/);
  assert.match(census, /formatWasmType\(imported\.type\)/);
  assert.match(census, /imported\.module\.startsWith\("GOT\."\)/);
  assert.match(census, /Operation to consumers/);
  assert.match(census, /link-time requirement census, not evidence/);
});

test("Dollyfiles are additive and execute through the sequential C engine", async () => {
  const base = await readFile(new URL("../Dollyfile", import.meta.url), "utf8");
  const game = await readFile(new URL("../Dollyfile-gamedev", import.meta.url), "utf8");
  const python = await readFile(new URL("../Dollyfile-python", import.meta.url), "utf8");
  const baseView = inspectDollyfile(base, "Dollyfile");
  const gameView = inspectDollyfile(game, "Dollyfile-gamedev");
  const pythonView = inspectDollyfile(python, "Dollyfile-python");
  const engine = await readFile(new URL("../src/dollyfile.c", import.meta.url), "utf8");
  const worker = await readFile(new URL("../src/runtime-worker.mjs", import.meta.url), "utf8");
  assert.equal(baseView.image, "default");
  assert.equal(gameView.extends, "default");
  assert.equal(pythonView.extends, "default");
  assert.ok(baseView.sources.length > 40);
  assert.equal(gameView.sources.length, 8);
  assert.equal(pythonView.sources.length, 11);
  assert.equal(baseView.sources.some((item) =>
    /gamedev|graphics-demo|cpython/.test(item.location)), false);
  assert.match(base, /SOURCE HOST TXT \/static\/bootstrap\/tar\.c/);
  assert.match(base, /RUN cc .*\/bin\/tar/);
  assert.match(base, /SOURCE HOST BIN .*\.tar .* SHA256 [0-9a-f]{64}/);
  assert.match(base, /RUN tar -xf/);
  assert.doesNotMatch(`${base}\n${game}\n${python}`, /DECLARE HTTP|SAMEHOST|\.assets|\bBASE\b/);
  assert.match(engine, /result = fetch_source\(engine.*?result = run_slop/s);
  assert.doesNotMatch(worker, /compileDollyfiles|parseDollyfile|sameHostAssets|\.assets/);
});

test("HOST inputs are independent exact pinned files", async () => {
  const projectDir = new URL("..", import.meta.url).pathname;
  const definitions = await discoverImageDefinitions(projectDir);
  const sources = await inspectStaticSources(projectDir, definitions);
  assert.equal(sources.length, 111);
  assert.ok(sources.every((item) =>
    item.path.startsWith("/static/") && ["txt", "bin"].includes(item.media) &&
    /^[0-9a-f]{64}$/.test(item.sha256) && item.byteLength > 0));
  assert.equal(sources.some((item) => item.path.endsWith(".assets")), false);
  assert.equal(sources.find((item) => item.path === "/static/bootstrap/tar.c").media, "txt");
  assert.ok(sources.find((item) => item.path.endsWith("/zig-lib.tar")).byteLength > 200e6);
});

test("snapshot commands refresh derived policy and provide an exact rebuild check", async () => {
  const packageDefinition = JSON.parse(await readFile(
    new URL("../package.json", import.meta.url),
    "utf8",
  ));
  const checker = await readFile(
    new URL("../scripts/verify-snapshot-reproducibility.mjs", import.meta.url),
    "utf8",
  );
  const build = await readFile(new URL("../scripts/build.sh", import.meta.url), "utf8");
  const pruner = await readFile(
    new URL("../scripts/prune-stale-snapshots.mjs", import.meta.url),
    "utf8",
  );
  assert.match(packageDefinition.scripts.snapshot, /^npm run routes && /);
  assert.match(packageDefinition.scripts["snapshot:reproducible"], /^npm run routes && /);
  assert.match(checker, /DOLLY_SNAPSHOT_IMAGE/);
  assert.match(checker, /first differing byte/);
  assert.match(checker, /two \$\{image\} rebuilds are byte-identical/);
  assert.doesNotMatch(build, /image_outputs/);
  assert.match(build, /node scripts\/prune-stale-snapshots\.mjs/);
  assert.match(pruner, /snapshotMetadata\.buildId !== DOLLY_BUILD_ID/);
  assert.match(pruner, /snapshotMetadata\.byteLength !== snapshotStat\.size/);
  assert.match(pruner, /snapshotMetadata\.recipes/);
  assert.match(pruner, /snapshotMetadata\.sha256 !== await fileDigest/);
});

test("registry, routes, and source viewer derive from Dollyfiles", async () => {
  const { DOLLY_IMAGES, DOLLY_STATIC_SOURCES } = await import(artifact("dolly-images.mjs"));
  assert.deepEqual(DOLLY_IMAGES.map(({ image, dollyfile, extends: parent }) => ({
    image, dollyfile, ...(parent ? { extends: parent } : {}),
  })), [
    { image: "default", dollyfile: "Dollyfile" },
    { image: "gamedev", dollyfile: "Dollyfile-gamedev", extends: "default" },
    { image: "python", dollyfile: "Dollyfile-python", extends: "default" },
  ]);
  assert.ok(DOLLY_STATIC_SOURCES.length >= 54);
  for (const image of DOLLY_IMAGES) {
    await readFile(new URL(`../build/routes/${image.image}/index.html`, import.meta.url));
    await readFile(new URL(`../build/routes/${image.image}/rebuild/index.html`, import.meta.url));
    await readFile(new URL(`../build/routes/view/${image.image}/index.html`, import.meta.url));
    assert.ok(image.byteLength > 0);
    assert.match(image.sha256, /^[0-9a-f]{64}$/);
  }
  const viewer = await readFile(new URL("../src/dollyfile-viewer.mjs", import.meta.url), "utf8");
  assert.match(viewer, /anchor\.download/);
  assert.match(viewer, /source\[1\] === "HOST"/);
});

test("the common seed builds Dollyfile and only essential command wrappers", async () => {
  const loader = await readFile(artifact("dolly.mjs"), "utf8");
  const runtime = await readFile(new URL("../src/dolly.c", import.meta.url), "utf8");
  const recipe = await readFile(new URL("../Dollyfile", import.meta.url), "utf8");
  for (const output of ["slop", "dollyfile", "mkdir", "rm", "cc", "c++", "ld", "ar"]) {
    assert.match(runtime, new RegExp(`"/bin/${escapeRegex(output)}"`));
  }
  assert.doesNotMatch(loader, /\/usr\/bin\/(?:git|make|zig|pi|qjs)/);
  assert.match(runtime, /dolly_spawn\("\/bin\/dollyfile"/);
  assert.match(runtime, /"\/etc\/dolly\/recipe\.locator"/);
  assert.match(runtime, /"\/etc\/dolly\/host\.base"/);
  assert.doesNotMatch(runtime, /startup\.slop/);
  assert.match(recipe, /make -f \/usr\/src\/dolly\/startup\.mk pi/);
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
    "DOLLY_SAMURAI_COMMIT",
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
    "../bin/dolly-cc",
    "../scripts/build.sh",
    "../scripts/build-toolchain.sh",
    "../scripts/build-bison.sh",
    "../scripts/fetch-awk.sh",
    "../scripts/fetch-curl.sh",
    "../scripts/fetch-git.sh",
    "../scripts/fetch-iosevka.sh",
    "../scripts/fetch-make.sh",
    "../scripts/fetch-samurai.sh",
    "../scripts/fetch-emscripten-system-libs.sh",
    "../scripts/fetch-zig.sh",
    "../scripts/fetch-zig-host.sh",
    "../scripts/fetch-ghostty.sh",
    "../scripts/fetch-uucode.sh",
    "../scripts/fetch-quickjs.sh",
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

test("bootstrap creates a writable HOME with a default global Git identity", async () => {
  const runtime = await readFile(new URL("../src/dolly.c", import.meta.url), "utf8");
  const gitPatch = await readFile(new URL("../config/git-dolly.patch", import.meta.url), "utf8");
  const { startup } = await readImagePlan("default");
  assert.match(runtime, /setenv\("HOME", "\/home\/dolly", 1\)/);
  assert.match(startup, /mkdir -p \/home\/dolly/);
  assert.match(startup, /echo '\[user\]' > \/home\/dolly\/\.gitconfig/);
  assert.match(startup, /name = Dolly/);
  assert.match(startup, /email = dolly@example\.invalid/);
  assert.match(gitPatch, /Dolly has no permission model/);
  assert.match(gitPatch, /Unix execute bits cannot gate PATH lookup/);
  assert.match(
    await readFile(new URL("../scripts/prepare-git.sh", import.meta.url), "utf8"),
    /--no-backup-if-mismatch/,
  );
});

test("help reflects optional Python tools without registering hidden commands", async () => {
  const help = await readFile(new URL("../src/commands/help.c", import.meta.url), "utf8");
  assert.match(help, /access\("\/usr\/bin\/python", F_OK\)/);
  assert.match(help, /python python3 bonnie/);
  assert.match(help, /bonnie install PACKAGE; bonnie list\|freeze\|show\|check/);
  assert.doesNotMatch(help, /dolly_spawn|system\(|exec[a-z]*\(/);

  const { manifest } = decodeSystemSnapshot(
    await readFile(artifact("dolly-default-system.snapshot")),
  );
  for (const directory of ["/bin", "/usr/bin"]) {
    const line = new RegExp(`fputs\\(\"${directory}: ([^\"]+)`).exec(help);
    assert.ok(line, `help does not contain its ${directory} inventory`);
    const documented = line[1].replace(/\\n$/, "").trim().split(/ +/)
      .map((name) => `${directory}/${name}`).sort();
    const actual = manifest.filter((path) =>
      path.startsWith(`${directory}/`) &&
      !path.slice(directory.length + 1).includes("/"));
    assert.deepEqual(documented, actual, `${directory} help inventory drifted`);
  }
});

test("slop reserves only stateful shell operations and resolves utilities through PATH", async () => {
  const shell = await readFile(new URL("../src/slop.c", import.meta.url), "utf8");
  const runtime = await readFile(new URL("../src/dolly.c", import.meta.url), "utf8");
  const copy = await readFile(new URL("../src/commands/cp.c", import.meta.url), "utf8");
  const which = await readFile(new URL("../src/commands/which.c", import.meta.url), "utf8");
  const xargs = await readFile(new URL("../src/commands/xargs.c", import.meta.url), "utf8");
  const find = await readFile(new URL("../src/commands/find.c", import.meta.url), "utf8");
  const tail = await readFile(new URL("../src/commands/tail.c", import.meta.url), "utf8");
  const tee = await readFile(new URL("../src/commands/tee.c", import.meta.url), "utf8");
  const env = await readFile(new URL("../src/commands/env.c", import.meta.url), "utf8");
  const printenv = await readFile(new URL("../src/commands/printenv.c", import.meta.url), "utf8");
  const reverse = await readFile(new URL("../src/commands/rev.c", import.meta.url), "utf8");
  const timeout = await readFile(new URL("../src/commands/timeout.c", import.meta.url), "utf8");
  const time = await readFile(new URL("../src/commands/time.c", import.meta.url), "utf8");
  const uname = await readFile(new URL("../src/commands/uname.c", import.meta.url), "utf8");
  const hostname = await readFile(new URL("../src/commands/hostname.c", import.meta.url), "utf8");
  const realpath = await readFile(new URL("../src/commands/realpath.c", import.meta.url), "utf8");
  const diff = await readFile(new URL("../src/commands/diff.c", import.meta.url), "utf8");
  const command = await readFile(new URL("../src/commands/command.c", import.meta.url), "utf8");
  const patch = await readFile(new URL("../src/commands/patch.c", import.meta.url), "utf8");
  const du = await readFile(new URL("../src/commands/du.c", import.meta.url), "utf8");
  const dd = await readFile(new URL("../src/commands/dd.c", import.meta.url), "utf8");
  const tty = await readFile(new URL("../src/commands/tty.c", import.meta.url), "utf8");
  const install = await readFile(new URL("../src/commands/install.c", import.meta.url), "utf8");
  const testCommand = await readFile(new URL("../src/commands/test.c", import.meta.url), "utf8");
  const makefile = await readFile(new URL("../src/startup.mk", import.meta.url), "utf8");
  const { startup } = await readImagePlan("default");
  for (const builtin of [":", ".", "source", "eval", "exec", "return", "exit", "cd", "export", "unset", "set", "shift", "read", "getopts", "local", "type", "break", "continue"]) {
    assert.match(shell, new RegExp(`strcmp\\(argv\\[0\\], "${escapeRegex(builtin)}"\\)`));
  }
  for (const executable of ["help", "pwd", "cat", "echo", "mkdir", "touch", "rm", "rmdir", "ln", "readlink", "realpath", "pathchk", "clear", "ls", "mv", "cp", "install", "which", "command", "xargs", "find", "du", "dd", "tail", "tee", "tty", "env", "printenv", "basename", "dirname", "tr", "cmp", "diff", "patch", "comm", "paste", "join", "seq", "expr", "nl", "split", "strings", "cksum", "rev", "fold", "expand", "unexpand", "tsort", "date", "time", "uname", "hostname", "mktemp", "sha256sum", "md5sum", "sleep", "timeout", "cc", "c++", "ld", "ar", "make", "demo"] ) {
    assert.doesNotMatch(shell, new RegExp(`strcmp\\(argv\\[0\\], "${escapeRegex(executable)}"\\)`));
  }
  assert.match(shell, /resolve_command\(argv\[0\]/);
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
  assert.match(
    shell,
    /if \(byte == 0x0c\) \{[^}]*redraw_line\(line, length, cursor\);[^}]*\}/,
  );
  assert.match(shell, /SLOP_DEFERRED_STATUS/);
  assert.match(shell, /defer_dollar/);
  assert.match(shell, /expand_deferred_dollars\(shell, tokens, start, end\)/);
  assert.match(shell, /TOKEN_DUP_INPUT/);
  assert.match(shell, /TOKEN_DUP_OUTPUT/);
  assert.match(shell, /TOKEN_HEREDOC/);
  assert.match(shell, /SLOP_MAX_HEREDOCS 32/);
  assert.match(shell, /expand_heredoc/);
  assert.match(shell, /deferred_quoted_positional_fields/);
  assert.match(shell, /expand_tilde_words/);
  assert.match(shell, /descriptor_state_save_all/);
  assert.match(shell, /descriptor_state_commit/);
  assert.match(shell, /Shell nested = \*shell/);
  assert.match(shell, /nested\.errexit = 0/);
  assert.match(shell, /parameter_closing_brace/);
  assert.match(shell, /expand_arithmetic/);
  assert.match(shell, /arithmetic_multiply/);
  assert.match(shell, /strchr\("-=\+\?", \*body_cursor\)/);
  assert.match(shell, /setenv\(variable, assigned_value, 1\)/);
  assert.match(shell, /append_pattern_removal/);
  assert.match(shell, /unsupported parameter length expansion/);
  assert.match(shell, /STOP_THEN/);
  assert.match(shell, /STOP_ELIF/);
  assert.match(shell, /parse_if_branch/);
  assert.match(shell, /execute_list\(shell, parser, execute, 1,/);
  assert.match(shell, /STOP_DO/);
  assert.match(shell, /STOP_DONE/);
  assert.match(shell, /parse_for/);
  assert.match(shell, /parse_while/);
  assert.match(shell, /until \? condition_status != 0/);
  assert.match(shell, /STOP_ESAC/);
  assert.match(shell, /STOP_CASE_CLAUSE/);
  assert.match(shell, /TOKEN_CASE_END/);
  assert.match(shell, /parse_case/);
  assert.match(shell, /wildcard_match\(pattern, value\)/);
  assert.match(shell, /parse_function_definition/);
  assert.match(shell, /functions_clone\(shell->functions, &nested_functions\)/);
  assert.match(shell, /shell_set_positional/);
  assert.match(shell, /shell_shift/);
  assert.match(shell, /builtin_read/);
  assert.match(shell, /run_simple_mutable/);
  assert.match(shell, /copy\[index\]\.text = strdup/);
  assert.match(startup, /if false; then false; elif true; then true; else false; fi/);
  assert.match(startup, /if true; then if false; then false; else true; fi; else false; fi/);
  assert.match(startup, /for outer in a b; do for inner in 1 2;/);
  assert.match(startup, /slop -c 'for value; do echo "\$value"; done' loop first second/);
  assert.match(startup, /while test "\$DOLLY_COUNT" != 3/);
  assert.match(startup, /until test "\$DOLLY_COUNT" = 2/);
  assert.match(startup, /case "\$DOLLY_CASE" in alpha\) false ;; beta\|gamma\)/);
  assert.match(startup, /case outer in outer\) case inner\.c in \*\.c\)/);
  assert.match(startup, /DOLLY_PARAMETER:-fallback/);
  assert.match(startup, /DOLLY_PARAMETER:=\$\{DOLLY_FALLBACK:-assigned\}/);
  assert.match(startup, /DOLLY_MISSING:\?required parameter/);
  assert.match(startup, /CHECK test "\$\(false; echo substitution-continued\)" = substitution-continued/);
  assert.doesNotMatch(shell, /expand_dollar\(shell, &source, &word\)/);
  assert.match(shell, /expand_deferred_status\(shell, tokens, start, end\)/);
  assert.match(shell, /kind == TOKEN_NOT && tokens->count != 0/);
  assert.match(shell, /tab-stripping <<- here-documents are unsupported/);
  assert.doesNotMatch(shell, /readline|linenoise|editline/);
  assert.match(startup, /RUN cc .*\/bin\/tar/);
  assert.match(startup, /CHECK git --version/);
  assert.doesNotMatch(shell, /chmod|X_OK|S_IXUSR|S_IXGRP|S_IXOTH/);
  assert.match(startup, /RUN cc \/usr\/src\/dolly\/commands\/cp\.c -o \/bin\/cp/);
  assert.match(startup, /RUN cc \/usr\/src\/dolly\/commands\/which\.c -o \/bin\/which/);
  assert.match(startup, /RUN cc \/usr\/src\/dolly\/commands\/xargs\.c -o \/bin\/xargs/);
  assert.match(startup, /RUN cc \/usr\/src\/dolly\/commands\/find\.c -o \/bin\/find/);
  assert.match(startup, /RUN cc \/usr\/src\/dolly\/commands\/tail\.c -o \/bin\/tail/);
  assert.match(startup, /RUN cc \/usr\/src\/dolly\/commands\/tee\.c -o \/bin\/tee/);
  assert.match(startup, /RUN cc \/usr\/src\/dolly\/commands\/env\.c -o \/bin\/env/);
  assert.match(startup, /RUN cc \/usr\/src\/dolly\/commands\/printenv\.c -o \/bin\/printenv/);
  assert.match(startup, /CHECK which cc/);
  assert.match(startup, /CHECK printf 'one\\0two\\0' \| xargs -0 -n 1 test -n/);
  assert.match(xargs, /dolly_spawn\(path, count, arguments, 0, 1, 2\)/);
  assert.match(xargs, /Dolly executes serially; only -P 1 is supported/);
  assert.doesNotMatch(xargs, /\bfork\s*\(|\bexec(?:ve|vp|v|le|lp|l)\s*\(/);
  assert.doesNotMatch(xargs, /chmod|X_OK|S_IXUSR|S_IXGRP|S_IXOTH/);
  assert.match(find, /qsort\(names\.items, names\.count/);
  assert.match(find, /NODE_NAME/);
  assert.match(find, /NODE_PATH/);
  assert.match(find, /NODE_PRUNE/);
  assert.match(find, /NODE_EXEC/);
  assert.match(find, /static int wildcard_match/);
  assert.match(find, /dolly_spawn\(path, \(int\)count, arguments, 0, 1, 2\)/);
  assert.match(find, /Dolly has no user, group, or permission model/);
  assert.doesNotMatch(find, /\bfnmatch\s*\(|getgr(?:gid|nam)|getpw(?:uid|nam)|chmod|X_OK|S_IXUSR|S_IXGRP|S_IXOTH/);
  assert.match(dd, /DOLLY_DD_MAX_BLOCK/);
  assert.match(dd, /conv=notrunc,sync/);
  assert.doesNotMatch(dd, /chmod|fork|pthread|socket\s*\(/);
  assert.match(hostname, /Dolly's deterministic hostname is read-only/);
  assert.match(tail, /follow mode is unsupported in Dolly's serial process model/);
  assert.doesNotMatch(tail, /chmod|fork|pthread|signal\s*\(/);
  assert.match(tee, /Dolly Ctrl\+C always cancels the foreground command/);
  assert.doesNotMatch(tee, /chmod|fork|pthread|signal\s*\(/);
  assert.match(env, /dolly_spawn_env/);
  assert.match(env, /values\.items == NULL \? empty_environment/);
  assert.doesNotMatch(env, /\bexec(?:ve|vp|v|le|lp|l)\s*\(|chmod|X_OK|S_IXUSR|S_IXGRP|S_IXOTH/);
  assert.match(printenv, /environ\[index\]/);
  assert.doesNotMatch(printenv, /for \(; \*environ; environ\+\+\)/);
  assert.match(startup, /CHECK ! false/);
  for (const command of [
    "cut", "od", "printf", "sort", "uniq", "true", "false",
    "basename", "dirname", "tr",
    "cmp", "date", "mktemp", "sha256sum", "md5sum", "sleep",
    "ln", "readlink", "rmdir", "seq", "paste", "comm",
    "expr", "nl", "join", "split", "strings", "cksum", "fold",
    "expand", "unexpand", "tsort", "pathchk",
  ]) {
    assert.match(makefile, new RegExp(`\\/bin\\/${command}`));
    assert.match(startup, new RegExp(`KEEP \\/bin\\/${command}`));
  }
  assert.match(startup, /RUN cc -std=c17 \/usr\/src\/dolly\/commands\/rev\.c -o \/bin\/rev/);
  assert.match(startup, /KEEP \/bin\/rev/);
  assert.match(reverse, /is_continuation/);
  assert.doesNotMatch(reverse, /chmod|fork|pthread|signal\s*\(/);
  assert.match(startup, /RUN cc \/usr\/src\/dolly\/commands\/timeout\.c -o \/bin\/timeout/);
  assert.match(startup, /KEEP \/bin\/timeout/);
  assert.match(timeout, /dolly_spawn_timeout/);
  assert.doesNotMatch(timeout, /chmod|X_OK|fork|pthread|signal\s*\(/);
  for (const command of ["time", "uname", "realpath"]) {
    assert.match(startup, new RegExp(`RUN cc \/usr\/src\/dolly\/commands\/${command}\\.c -o \/bin\/${command}`));
    assert.match(startup, new RegExp(`KEEP \/bin\/${command}`));
  }
  assert.match(time, /CLOCK_MONOTONIC/);
  assert.match(time, /dolly_spawn\(/);
  assert.match(uname, /"wasm64"/);
  assert.match(realpath, /realpath\(argv\[argument\], resolved\)/);
  assert.match(startup, /RUN cc \/usr\/src\/dolly\/commands\/diff\.c -o \/bin\/diff/);
  assert.match(startup, /KEEP \/bin\/diff/);
  assert.match(startup, /CHECK test "\$\(diff -u \/tmp\/diff-left \/tmp\/diff-right/);
  assert.match(diff, /dolly_spawn\("\/usr\/bin\/git"/);
  assert.match(diff, /"--no-pager"/);
  assert.match(diff, /"--no-index"/);
  for (const executable of ["command", "patch", "du", "tty", "install"]) {
    assert.match(startup, new RegExp(`RUN cc \/usr\/src\/dolly\/commands\/${executable}\\.c -o \/bin\/${executable}`));
    assert.match(startup, new RegExp(`KEEP \/bin\/${executable}`));
  }
  assert.match(command, /dolly_spawn\(path/);
  assert.match(patch, /dolly_spawn\("\/usr\/bin\/git"/);
  assert.match(patch, /"--no-pager"/);
  assert.match(patch, /"apply"/);
  assert.match(du, /logical in-memory file bytes/);
  assert.doesNotMatch(du, /st_blocks|chmod|chown|tsearch/);
  assert.match(tty, /isatty\(STDIN_FILENO\)/);
  assert.match(install, /Dolly has no permission or identity model/);
  assert.doesNotMatch(install, /chmod|chown|getpw|getgr/);
  assert.doesNotMatch(`${time}\n${uname}\n${realpath}\n${diff}\n${command}\n${patch}\n${du}\n${tty}\n${install}`, /chmod|X_OK|fork|pthread|signal\s*\(/);
  assert.match(which, /getenv\("PATH"\)/);
  assert.match(which, /S_ISREG\(metadata\.st_mode\)/);
  assert.doesNotMatch(which, /chmod|X_OK|S_IXUSR|S_IXGRP|S_IXOTH/);
  assert.match(testCommand, /strcmp\(operation, "-x"\)[\s\S]*?S_ISREG/);
  assert.doesNotMatch(testCommand, /X_OK|S_IXUSR|S_IXGRP|S_IXOTH/);
  assert.match(copy, /copy_directory/);
  assert.doesNotMatch(copy, /chmod|chown|st_mode\s*&/);
});

test("GNU Make is source-pinned and executes every job synchronously through Slop", async () => {
  const recipe = await readFile(new URL("../Dollyfile", import.meta.url), "utf8");
  const manifest = await readFile(new URL("../config/make-sources.txt", import.meta.url), "utf8");
  const patch = await readFile(new URL("../config/make-dolly.patch", import.meta.url), "utf8");
  const adapter = await readFile(new URL("../src/runtimes/make-dolly.c", import.meta.url), "utf8");
  const amalgamation = await readFile(
    new URL("../src/runtimes/make-amalgamation-dolly.c", import.meta.url), "utf8");
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
  assert.equal((amalgamation.match(/^#include /gm) ?? []).length, 34);
  assert.match(amalgamation, /DOLLY_MAKE_PART == 1/);
  assert.match(amalgamation, /DOLLY_MAKE_PART == 7/);
  assert.match(recipe, /-DDOLLY_MAKE_PART=1/);
  assert.match(recipe, /-DDOLLY_MAKE_PART=7/);
});

test("Samurai provides a source-pinned serial Ninja interface inside Dolly", async () => {
  const recipe = await readFile(new URL("../Dollyfile", import.meta.url), "utf8");
  const fetch = await readFile(
    new URL("../scripts/fetch-samurai.sh", import.meta.url), "utf8");
  const prepare = await readFile(
    new URL("../scripts/prepare-samurai.sh", import.meta.url), "utf8");
  const patch = await readFile(
    new URL("../config/samurai-dolly.patch", import.meta.url), "utf8");
  const startup = await readFile(
    new URL("../src/startup.mk", import.meta.url), "utf8");
  const unit = await readFile(
    new URL("../src/runtimes/samurai-unit-dolly.c", import.meta.url), "utf8");

  assert.match(fetch, /DOLLY_SAMURAI_COMMIT/);
  assert.match(prepare, /samurai-dolly\.patch/);
  assert.match(recipe, /Samurai 1\.3/);
  assert.match(recipe, /make -f \/usr\/src\/dolly\/startup\.mk ninja/);
  assert.match(startup, /SAMURAI_NAMES := build deps env graph/);
  assert.match(startup, /-DDOLLY/);
  assert.match(startup, /SAMURAI_CFLAGS := -O1/);
  assert.match(startup, /SAMURAI_UNIT := .*samurai-unit-dolly\.c/);
  assert.match(startup, /SAMURAI_OBJECTS := .*part-/);
  assert.match(startup, /-DDOLLY_SAMURAI_PART=\$\*/);
  assert.match(startup, /-O0 -fdolly-runtime-interrupt-handler -DDOLLY_SAMURAI_PART=12/);
  assert.match(startup, /\/usr\/bin\/ninja: \$\(SAMURAI_OBJECTS\)/);
  assert.match(startup, /\$\(CC\) \$\(SAMURAI_OBJECTS\) -o \$@/);
  assert.match(unit, /#include "build\.c"/);
  assert.match(unit, /#include "os-posix\.c"/);
  assert.equal((unit.match(/^#include "[^"]+\.c"/gm) ?? []).length, 13);
  assert.match(unit, /DOLLY_SAMURAI_PART == 1/);
  assert.match(unit, /DOLLY_SAMURAI_PART == 13/);
  assert.match(unit, /dolly_samurai_fprintf/);
  assert.match(patch, /dolly_spawn\("\/bin\/slop"/);
  assert.match(patch, /dolly_interrupt_checkpoint\(\)/);
  assert.match(patch, /diff --git a\/util\.c b\/util\.c/);
  assert.match(patch, /dolly_exit\(130\)/);
  assert.match(patch, /#ifdef DOLLY/);
  assert.match(patch, /while \(work && numfail < buildopts\.maxfail\)/);
  assert.doesNotMatch(patch, /^\+.*\b(?:fork|exec[a-z]*|posix_spawn|waitpid)\s*\(/m);
});

test("the in-Wasm linker validates a staged output before publishing it", async () => {
  const compiler = await readFile(new URL("../src/compiler.cpp", import.meta.url), "utf8");
  const bootstrapCompiler = await readFile(new URL("../bin/dolly-cc", import.meta.url), "utf8");
  assert.match(compiler, /temporary_path\(job, options\.inputs\.size\(\) \+ 1, "\.wasm"\)/);
  assert.match(compiler, /"-fvisibility=hidden"/);
  assert.match(bootstrapCompiler, /-fvisibility=hidden/);
  assert.match(compiler, /export_name\(\\"dolly_main\\"\)/);
  assert.match(compiler, /_Z10dolly_main/);
  assert.match(compiler, /__asm__\(\\"%s\\"\)/);
  assert.match(compiler, /link_side_module\(linked, link_inputs, options\.linker_options/);
  assert.match(compiler, /validate_command\(linked\).*stamp_command\(linked\).*publish_file\(linked, output\)/s);
  assert.match(compiler, /std::rename\(source\.c_str\(\), output\.c_str\(\)\)/);
  assert.match(compiler, /WasmFS cannot rename across every backend boundary/);
  assert.match(compiler, /std::fopen\(output\.c_str\(\), "wb"\)/);
  assert.doesNotMatch(compiler, /link_side_module\(output/);
});

test("foreground SIGINT is a PID-targeted in-Wasm lifecycle operation", async () => {
  const display = await readFile(new URL("../include/dolly/display.h", import.meta.url), "utf8");
  const runtime = await readFile(new URL("../src/dolly.c", import.meta.url), "utf8");
  const compiler = await readFile(new URL("../src/compiler.cpp", import.meta.url), "utf8");
  const quickjs = await readFile(new URL("../src/runtimes/quickjs-main.c", import.meta.url), "utf8");

  assert.match(display, /interrupt_sequence/);
  assert.match(display, /interrupt_target_pid/);
  assert.match(runtime, /target != \(uint32_t\)active_process_pid/);
  assert.match(runtime, /status = 128 \+ SIGINT/);
  assert.match(runtime, /active_process_deadline[\s\S]*?emscripten_get_now\(\)/);
  assert.match(runtime, /int dolly_spawn_timeout\(/);
  assert.match(quickjs, /dolly_spawn_timeout\("\/bin\/slop"/);
  assert.match(runtime, /void __sanitizer_cov_trace_pc\(void\)/);
  assert.match(compiler, /-fsanitize-coverage-trace-pc/);
  assert.match(compiler, /argument == "-fdolly-runtime-interrupt-handler"/);
  assert.match(compiler, /options\.edge_interrupt_safepoints = false/);
  assert.match(quickjs, /JS_SetInterruptHandler\(runtime, quickjs_interrupt_handler/);
  assert.match(quickjs, /dolly_isatty\(descriptor\)/);
  assert.match(runtime, /static uint32_t active_terminal_mask = 0x7u/);
  assert.match(runtime, /int dolly_isatty\(int descriptor\)[\s\S]*?active_terminal_mask/);
  assert.match(runtime, /child_terminal_mask[\s\S]*?active_terminal_mask = child_terminal_mask/);
  assert.match(runtime, /active_terminal_mask = previous_terminal_mask/);
  assert.match(compiler, /"isatty=dolly_isatty"/);
  const startup = await readFile(new URL("../src/startup.mk", import.meta.url), "utf8");
  assert.match(startup, /QUICKJS_CPPFLAGS :=.*-fdolly-runtime-interrupt-handler/);
  assert.match(runtime, /dolly_http_poll[\s\S]*?dolly_interrupt_checkpoint\(\)/);
  assert.match(runtime, /dolly_terminal_read_raw_timeout[\s\S]*?dolly_interrupt_checkpoint\(\)/);
  assert.match(runtime, /dolly_sleep[\s\S]*?dolly_interrupt_checkpoint\(\)/);
  assert.match(runtime, /dolly_sleep[\s\S]*?deadline - emscripten_get_now\(\)/);
  assert.doesNotMatch(runtime, /remaining -= interval/);
  const shell = await readFile(new URL("../src/slop.c", import.meta.url), "utf8");
  assert.match(shell, /report_status = !line_is_blank\(line\)/);
  assert.match(shell, /if \(report_status && shell->last_status != 0/);
});

test("the browser can replace a worker wedged outside Dolly safepoints", async () => {
  const browser = await readFile(new URL("../src/browser.mjs", import.meta.url), "utf8");
  const browserProof = await readFile(
    new URL("../scripts/browser-harness.mjs", import.meta.url), "utf8",
  );
  assert.match(browser, /hardInterruptGraceMilliseconds = 2000/);
  assert.match(browser, /pendingForegroundInterrupt\?\.pid === pid/);
  assert.match(browser, /runtimeWorker\?\.terminate\(\)/);
  assert.match(browser, /location\.reload\(\)/);
  assert.match(browser, /hardInterruptRecoveryKey/);
  assert.match(browser, /restoredCheckpoint \? "session" : "base"/);
  assert.match(browserProof, /-fdolly-runtime-interrupt-handler/);
  assert.match(browserProof, /a foreign no-safepoint loop was hard-stopped/);
});

test("command epochs reclaim bounded descriptor leaks and restore shell context", async () => {
  const runtime = await readFile(new URL("../src/dolly.c", import.meta.url), "utf8");
  const browserProof = await readFile(
    new URL("../scripts/browser-harness.mjs", import.meta.url), "utf8",
  );
  assert.match(runtime, /DOLLY_COMMAND_FD_LIMIT = 4096/);
  assert.match(runtime, /capture_descriptors\(&saved_descriptors\)/);
  assert.match(runtime, /close_new_descriptors\(&saved_descriptors\)/);
  assert.match(runtime, /persistent_command = find_persistent_module\(path\) != NULL/);
  assert.match(runtime, /retain_persistent_descriptors\(&saved_descriptors\)/);
  assert.match(runtime, /descriptor_snapshot_contains\(&persistent_descriptors, descriptor\)/);
  assert.match(runtime,
    /dup2\(saved\[fd\], fd\)[\s\S]*?close_new_descriptors\(&saved_descriptors\)/);
  assert.match(browserProof, /for \(int index = 0; index < 96; \+\+index\)/);
  assert.match(browserProof, /xargs -n 1 \/tmp\/dolly-fd-leak/);
  assert.match(browserProof, /descriptor-epoch-ok/);
  assert.match(browserProof, /test -z \\"\$DOLLY_LEAKED\\"/);
});

test("terminal modes are a small in-Wasm contract restored at command boundaries", async () => {
  const publicRuntime = await readFile(
    new URL("../include/dolly/runtime.h", import.meta.url),
    "utf8",
  );
  const runtime = await readFile(new URL("../src/dolly.c", import.meta.url), "utf8");
  const adapter = await readFile(
    new URL("../src/runtimes/cpython-termios.c", import.meta.url),
    "utf8",
  );
  const launcher = await readFile(
    new URL("../src/runtimes/cpython-main.c", import.meta.url),
    "utf8",
  );
  const recipe = await readFile(new URL("../Dollyfile-python", import.meta.url), "utf8");

  for (const bit of ["CANONICAL", "ECHO"]) {
    assert.match(publicRuntime, new RegExp(`DOLLY_TERMINAL_${bit}`));
  }
  assert.doesNotMatch(publicRuntime, /DOLLY_TERMINAL_SIGNALS/);
  assert.match(runtime, /terminal_mode_flags[\s\S]*?DOLLY_TERMINAL_CANONICAL/);
  assert.match(runtime, /dolly_terminal_mode_set[\s\S]*?flags & ~valid/);
  assert.match(runtime, /previous_terminal_mode = terminal_mode_flags/);
  assert.match(runtime, /terminal_mode_flags = previous_terminal_mode/);
  assert.match(runtime, /dolly_terminal_discard_pending_input/);
  assert.match(runtime, /dolly_wait\(pid, &status\)[\s\S]*?dolly_terminal_discard_pending_input\(\)/);
  assert.match(runtime, /matching key-up record is already queued/);
  assert.match(runtime, /_wasmfs_stdin_get_char[\s\S]*?DOLLY_TERMINAL_CANONICAL/);
  assert.match(adapter, /dolly_py_tcgetattr/);
  assert.match(adapter, /dolly_py_tcsetattr/);
  assert.match(adapter, /TIOCGWINSZ/);
  assert.match(adapter, /dolly_terminal_rows\(\)/);
  assert.match(adapter, /dolly_terminal_columns\(\)/);
  assert.match(adapter, /attributes->c_lflag \|= ISIG/);
  assert.doesNotMatch(adapter, /DOLLY_TERMINAL_SIGNALS/);
  assert.doesNotMatch(adapter, /dolly_http|fetch|EM_JS|emscripten/);
  assert.match(recipe, /MODULE_TERMIOS_CFLAGS=/);
  assert.match(recipe, /Modules\/dolly_termios\.o/);
  assert.match(recipe, /import os, termios, tty/);
  assert.match(launcher, /PyConfig_SetBytesString\(&config, &config\.home, "\/usr"\)/);
});

test("foreground commands can exclusively lease and safely restore the in-Wasm framebuffer", async () => {
  const display = await readFile(new URL("../include/dolly/display.h", import.meta.url), "utf8");
  const runtime = await readFile(new URL("../src/dolly.c", import.meta.url), "utf8");
  const driver = await readFile(new URL("../src/ghostty/display.c", import.meta.url), "utf8");
  const demo = await readFile(new URL("../src/commands/graphics-demo.c", import.meta.url), "utf8");
  const raylibAdapter = await readFile(
    new URL("../src/gamedev/dolly-raylib.c", import.meta.url),
    "utf8",
  );
  const box3dAdapter = await readFile(
    new URL("../src/gamedev/box3d-platform.c", import.meta.url),
    "utf8",
  );
  const makefile = await readFile(new URL("../src/gamedev.mk", import.meta.url), "utf8");
  const packaging = await readFile(new URL("../scripts/build.sh", import.meta.url), "utf8");
  const gamedev = await readFile(new URL("../Dollyfile-gamedev", import.meta.url), "utf8");
  const browser = await readFile(new URL("../src/browser.mjs", import.meta.url), "utf8");

  assert.match(display, /DOLLY_DISPLAY_PIXEL_RGBA8/);
  assert.match(display, /dolly_display_acquire\(dolly_display_surface \*surface\)/);
  assert.match(display, /dolly_display_set_size\(uint64_t generation/);
  assert.match(display, /dolly_display_begin_frame\(uint64_t generation/);
  assert.match(display, /dolly_display_wait_frame\(uint64_t generation/);
  assert.match(display, /dolly_display_set_cursor\(uint64_t generation/);
  assert.match(display, /dolly_display_next_event\(uint64_t generation/);
  assert.match(display, /void \(\*set_suspended\)\(int suspended\)/);
  assert.match(runtime, /buffer_index != \(active \^ 1u\)/);
  assert.match(runtime, /display_lease\.owner_pid != owner_pid/);
  assert.match(runtime, /Events already published while the graphics owner was active/);
  assert.match(runtime, /paste_consumed_sequence[\s\S]*?paste_sequence/);
  assert.match(
    runtime,
    /release_display_lease_for_pid\(process->pid\);[\s\S]*?fflush\(NULL\)/,
  );
  assert.match(runtime, /dolly_display_next_event[\s\S]*?dolly_interrupt_checkpoint\(\)/);
  assert.match(runtime, /dolly_display_wait_frame[\s\S]*?animation_frame_sequence/);
  assert.match(runtime, /dolly_display_set_size[\s\S]*?display_lease\.width = width/);
  assert.match(driver, /DRIVER_ABI_VERSION = 3/);
  assert.match(driver, /if \(suspended \|\| terminal == NULL/);
  assert.match(driver, /if \(was_suspended && !suspended\) render_frame\(\)/);
  assert.match(driver, /static cached_glyph ascii_glyphs\[128\]/);
  assert.match(driver, /if \(event == NULL && frame_dirty\) render_frame\(\)/);
  assert.match(driver, /frame_dirty = true/);
  assert.match(display, /DOLLY_INPUT_EVENT_SCROLL = 7/);
  assert.match(driver, /ghostty_selection_gesture_new/);
  assert.match(driver, /ghostty_selection_gesture_event\(/);
  assert.match(driver, /ghostty_terminal_scroll_viewport/);
  assert.match(browser, /pushScroll\(deltaRows\)/);
  assert.match(browser, /addEventListener\("wheel"/);
  assert.match(browser, /event\.pointerType === "touch"/);
  assert.match(browser, /publishAnimationFrame\(\)/);
  assert.match(browser, /currentAnimationFrameSequence\(\)/);
  assert.match(browser, /\["text", "default", "crosshair", "pointer", "none"\]/);
  assert.match(raylibAdapter, /dolly_display_acquire\(&context->surface\)/);
  assert.match(raylibAdapter, /dolly_display_set_size\(context->surface\.generation/);
  assert.match(raylibAdapter, /dolly_display_present\(context->surface\.generation/);
  assert.match(raylibAdapter, /rlCopyFramebuffer\(/);
  assert.doesNotMatch(raylibAdapter, /LoadImageFromScreen|memcpy\(frame\.pixels/);
  assert.match(box3dAdapter, /b3GetTicks/);
  assert.match(box3dAdapter, /b3CreateMutex/);
  assert.match(box3dAdapter, /tasks serially inside/);
  assert.doesNotMatch(box3dAdapter, /pthread_|dolly_http|fetch|EM_JS/);
  assert.match(makefile, /\/usr\/bin\/graphics-demo: \/usr\/src\/dolly\/gamedev\/graphics-demo\.c/);
  assert.match(packaging, /copy_static .*graphics-demo\.c.*gamedev\/graphics-demo\.c/);
  assert.match(gamedev, /SOURCE HOST TXT \/static\/gamedev\/graphics-demo\.c/);
  assert.match(gamedev, /KEEP \/usr\/bin\/graphics-demo/);
  assert.match(gamedev, /KEEP \/usr\/src\/dolly\/gamedev\/gamedev\.mk/);
  assert.match(gamedev, /KEEP \/usr\/src\/dolly\/gamedev\/graphics-demo\.c/);
  assert.match(gamedev, /raylib\.tar/);
  assert.match(gamedev, /box3d\.tar/);
  assert.match(gamedev, /box3d-platform\.c/);
  assert.match(gamedev, /skills\/dolly-gamedev\/SKILL\.md/);
  assert.match(makefile, /-DPLATFORM_MEMORY/);
  assert.match(makefile, /-DSUPPORT_CUSTOM_FRAME_CONTROL=1/);
  assert.match(makefile, /-DSW_FRAMEBUFFER_OUTPUT_BGRA=0/);
  assert.match(makefile, /libbox3d\.a/);
  assert.match(makefile, /filter-out \$\(BOX3D_SOURCE\)\/timer\.c/);
  assert.match(demo, /#include <box3d\/box3d\.h>/);
  assert.match(demo, /b3World_Explode/);
  assert.match(demo, /b3CreateDistanceJoint/);
  assert.match(demo, /rlPushMatrix\(\)/);
  assert.match(demo, /DrawCubeV/);
  assert.doesNotMatch(demo, /LoadModelFromMesh|IsModelValid/);
  assert.match(demo, /#include <dolly\/raylib\.h>/);
  assert.match(browser, /graphicsActive\(\)/);
  assert.doesNotMatch(demo, /EM_JS|fetch\s*\(|window\.|document\.|canvas/i);
});

test("the in-Wasm loader revalidates every filesystem executable", async () => {
  const compiler = await readFile(new URL("../src/compiler.cpp", import.meta.url), "utf8");
  const runtime = await readFile(new URL("../src/dolly.c", import.meta.url), "utf8");
  const header = await readFile(new URL("../src/dolly-runtime.h", import.meta.url), "utf8");

  assert.match(compiler, /bool has_contract_stamp\(const std::string &path\)/);
  assert.match(compiler, /matches != 1/);
  assert.match(compiler, /dolly_toolchain_validate_executable/);
  assert.match(header, /dolly_toolchain_validate_executable/);
  assert.match(
    runtime,
    /dolly_run_filesystem_module[\s\S]*?dolly_toolchain_validate_executable\(path\)[\s\S]*?dlopen\(path/,
  );
  assert.match(
    runtime,
    /install_display_driver[\s\S]*?dolly_toolchain_validate_executable\(driver_path\)/,
  );
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

test("Janis resolves finite ESM package exports solely through WasmFS", async () => {
  const runtime = await readFile(
    new URL("../src/runtimes/quickjs-main.c", import.meta.url),
    "utf8",
  );
  const janis = await readFile(new URL("../src/runtimes/janis.js", import.meta.url), "utf8");
  const { startup } = await readImagePlan("default");

  assert.match(runtime, /resolve_bare_module\(JSContext \*context/);
  assert.match(runtime, /__janisResolveModule/);
  assert.match(runtime, /bare module resolver returned a non-absolute path/);
  assert.match(runtime, /classify_file_module\(JSContext \*context, char \*normalized\)/);
  assert.match(runtime, /__janisResolveFile/);
  assert.match(runtime, /js_import_meta_resolve\(JSContext \*context/);
  assert.match(runtime, /__janisImportMetaResolve/);
  assert.match(runtime, /install_globals\(context, argv\[0\], strcmp\(name, "<eval>"\)/);
  assert.match(runtime, /strcmp\(module_name .*"\.json"\) == 0/s);
  assert.match(runtime, /static const char prefix\[\] = "export default \("/);
  assert.match(janis, /function janisResolveModule\(specifier, baseName, forRequire = false, raw = false\)/);
  assert.match(janis, /function janisEsmBuiltin\(specifier\)/);
  assert.match(janis, /function fsGlobSync\(pattern, options = \{\}\)/);
  assert.match(janis, /patternParts\[patternIndex\] === "\*\*"/);
  assert.match(janis, /globSync: fsGlobSync/);
  assert.match(
    await readFile(new URL("../src/runtimes/dolly-node.js", import.meta.url), "utf8"),
    /globalThis\.scriptExecutable.*globalThis\.scriptPath/s,
  );
  assert.match(janis, /export const \$\{key\} = builtin/);
  assert.match(janis, /\/tmp\/janis-esm-builtins/);
  assert.match(janis, /function janisEsmCommonJs\(modulePath\)/);
  assert.match(janis, /function janisModuleIsEsm\(path, fallback = false\)/);
  assert.match(janis, /janisModuleIsEsm\(path, true\) \? path/);
  assert.match(janis, /globalThis\.__janisRequireCjs/);
  assert.match(janis, /globalThis\.__janisResolveFile = \(path\) => janisModuleForImport/);
  assert.match(janis, /code: "ERR_REQUIRE_ESM"/);
  assert.match(janis, /janisRequireCache\[resolved\] = child/);
  assert.match(janis, /janisPackageExport\(manifest\.exports, subpath, conditions\)/);
  assert.match(janis, /\["require", "default", "node"\]/);
  assert.match(janis, /\["import", "default", "node"\]/);
  assert.match(janis, /function janisPackageImport\(specifier, baseName, forRequire = false, raw = false\)/);
  assert.match(janis, /ERR_PACKAGE_IMPORT_NOT_DEFINED/);
  assert.match(janis, /roots\.push\("\/usr\/lib\/node_modules"\)/);
  assert.match(janis, /ERR_PACKAGE_PATH_NOT_EXPORTED/);
  assert.match(janis, /ERR_INVALID_PACKAGE_TARGET/);
  assert.match(janis, /candidate !== packageRoot && !candidate\.startsWith/);
  assert.doesNotMatch(
    janis.slice(janis.indexOf("function janisResolveModule"),
      janis.indexOf("const janisRequireCache")),
    /\bfetch\s*\(/,
  );
  assert.match(startup, /node_modules\/@dolly\/example\/package\.json/);
  assert.match(startup, /"\.\/sub\/\*":"\.\/src\/\*\.js"/);
  assert.match(startup, /CHECK janis -m \/tmp\/janis-esm\/main\.mjs/);
  assert.match(startup, /CHECK janis -m \/tmp\/janis-esm\/resolve\.mjs/);
  assert.match(startup, /CHECK janis -m \/tmp\/janis-esm\/argv\.mjs ARG/);
  assert.match(startup, /CHECK janis -m \/tmp\/janis-esm\/json\.mjs/);
  assert.match(startup, /CHECK janis -m \/tmp\/janis-esm\/glob\.mjs/);
  assert.match(startup, /CHECK janis -m \/tmp\/janis-esm\/builtin\.mjs/);
  assert.match(startup, /CHECK janis -m \/tmp\/janis-esm\/commonjs\.mjs/);
  assert.match(startup, /"require":"\.\/commonjs\/index\.cjs"/);
});

test("the in-Wasm C driver accepts relaxed aliasing mode", async () => {
  const compiler = await readFile(new URL("../src/compiler.cpp", import.meta.url), "utf8");
  assert.match(compiler, /argument == "-fno-strict-aliasing"/);
  assert.match(compiler, /push_back\("-relaxed-aliasing"\)/);
  assert.match(compiler, /options\.frontend_options\.push_back\(argument\)/);
});

test("Zig bootstraps and builds Ghostty VT from pinned source inside Dolly", async () => {
  const pins = await readFile(new URL("../config/source-pins.sh", import.meta.url), "utf8");
  const { startup } = await readImagePlan("default");
  const makefile = await readFile(new URL("../src/startup.mk", import.meta.url), "utf8");
  const nativeMain = await readFile(new URL("../src/zig/native-main.zig", import.meta.url), "utf8");
  const nativeOptions = await readFile(new URL("../src/zig/native-build-options.zig", import.meta.url), "utf8");
  const objectCheck = await readFile(new URL("../src/zig/object-check.c", import.meta.url), "utf8");
  const nativeBuild = await readFile(new URL("../scripts/build-native-zig.sh", import.meta.url), "utf8");
  const nativePrepare = await readFile(new URL("../scripts/prepare-zig-native.sh", import.meta.url), "utf8");
  const zigPatch = await readFile(new URL("../patches/zig-0.16.0-dolly-native.patch", import.meta.url), "utf8");
  const ghosttyFetch = await readFile(new URL("../scripts/fetch-ghostty.sh", import.meta.url), "utf8");
  const ghosttyPatch = await readFile(new URL("../config/ghostty-dolly.patch", import.meta.url), "utf8");
  const build = await readFile(new URL("../scripts/build.sh", import.meta.url), "utf8");
  const packaging = await readFile(new URL("../toolchain/CMakeLists.txt", import.meta.url), "utf8");
  const abi = await readFile(new URL("../abi/dolly-0.wat", import.meta.url), "utf8");
  const browser = await readFile(new URL("../src/browser.mjs", import.meta.url), "utf8");

  assert.match(pins, /DOLLY_ZIG_VERSION=0\.16\.0/);
  assert.match(pins, /DOLLY_ZIG_SHA256=[0-9a-f]{64}/);
  assert.match(pins, /DOLLY_ZIG_HOST_X86_64_LINUX_SHA256=[0-9a-f]{64}/);
  assert.match(pins, /DOLLY_ZIG_HOST_AARCH64_LINUX_SHA256=[0-9a-f]{64}/);
  assert.match(pins, /DOLLY_GHOSTTY_COMMIT=[0-9a-f]{40}/);
  assert.match(pins, /DOLLY_UUCODE_SHA256=[0-9a-f]{64}/);
  assert.match(pins, /DOLLY_IOSEVKA_TTF_SHA256=[0-9a-f]{64}/);
  assert.match(pins, /DOLLY_STB_TRUETYPE_SHA256=[0-9a-f]{64}/);

  assert.match(startup, /make -f \/usr\/src\/dolly\/startup\.mk zig/);
  assert.match(startup, /\/usr\/libexec\/dolly\/zig-check/);
  assert.match(startup, /make -f \/usr\/src\/dolly\/startup\.mk ghostty/);
  assert.match(startup, /\/usr\/bin\/ghostty-vt/);

  assert.match(makefile, /\/tmp\/zig\/answer\.o:[\s\S]*?zig build-obj[\s\S]*?-femit-bin=\$@/);
  assert.match(makefile, /zig-object-check \$@/);
  assert.match(makefile, /\/tmp\/ghostty\/ghostty-vt\.o:[\s\S]*?zig \$\(GHOSTTY_ZIG_FLAGS\) -femit-bin=\$@/);
  assert.match(makefile, /\/usr\/lib\/libghostty-vt\.a:[\s\S]*?\$\(AR\) rcs/);
  assert.match(makefile, /\/usr\/bin\/ghostty-vt:[\s\S]*?\$\(CC\).*?-lghostty-vt/);
  assert.match(makefile, /\/usr\/libexec\/dolly\/display\.wasm:[\s\S]*?\$\(CC\).*?-lghostty-vt/);

  assert.match(nativeBuild, /fetch-zig-host\.sh/);
  assert.match(nativeBuild, /prepare-zig-native\.sh/);
  assert.match(nativeBuild, /"\$\{host_dir\}\/zig" build-obj/);
  assert.match(nativeBuild, /-target wasm64-emscripten/);
  assert.match(nativeBuild, /-mcpu=generic\+atomics/);
  assert.match(nativeBuild, /-fPIC/);
  assert.match(nativeBuild, /-Mroot="\$\{project_dir\}\/src\/zig\/native-main\.zig"/);
  assert.match(nativeBuild, /\.\/bin\/dolly-cc "\$\{object\}" -o "\$\{module\}"/);
  assert.match(nativeBuild, /dolly-abi\.mjs" validate-command/);
  assert.match(nativeBuild, /build-inputs\.sha256/);
  assert.match(nativePrepare, /zig-0\.16\.0-dolly-native\.patch/);
  assert.match(nativePrepare, /patch --batch --forward/);

  assert.match(nativeMain, /const compiler = @import\("compiler"\)/);
  assert.match(nativeMain, /compiler\.main\(/);
  assert.match(nativeMain, /export fn ZigClang_main/);
  assert.match(nativeMain, /export fn ZigLlvmAr_main/);
  assert.match(nativeMain, /export fn ZigLLDLinkCOFF[\s\S]*?return false/);
  assert.match(nativeMain, /export fn ZigLLDLinkELF[\s\S]*?return false/);
  assert.match(nativeMain, /export fn socket\([\s\S]*?return unsupported\(\)/);
  assert.match(nativeMain, /export fn posix_spawn\([\s\S]*?E\.NOSYS/);
  assert.match(nativeOptions, /skip_non_native = true/);
  assert.match(nativeOptions, /have_llvm = true/);
  assert.match(nativeOptions, /dev: DevEnv = \.core/);
  assert.match(objectCheck, /0x00, 0x61, 0x73, 0x6d/);

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

  assert.match(startup, /SOURCE HOST BIN \/static\/default\/zig\.wasm \/usr\/bin\/zig/);
  assert.match(startup, /SOURCE HOST BIN \/static\/default\/zig-lib\.tar/);
  assert.match(startup, /SOURCE HOST BIN \/static\/default\/ghostty\.tar/);
  assert.match(startup, /SOURCE HOST BIN \/static\/default\/uucode\.tar/);
  assert.doesNotMatch(packaging, /--preload-file .*DOLLY_(?:ZIG|GHOSTTY|UUCODE)/);
  assert.match(packaging, /sysroot\/include@\/seed\/usr\/include/);
  assert.match(packaging, /"\$\{DOLLY_ZIG_DIR\}\/src\/zig_llvm\.cpp"/);
  assert.match(abi, /"ZigLLDLinkWasm"/);
  assert.match(abi, /"ZigLLVMTargetMachineEmitToFile"/);
  assert.match(abi, /"LLVMInitializeWebAssemblyTarget"/);
  assert.match(browser, /zig build-obj -OReleaseSmall -target wasm64-emscripten/);
  assert.match(browser, /zig-object-check browser-answer\.o/);
  assert.match(browser, /cc browser-zig-check\.c browser-answer\.o -o browser-zig-check/);

  for (const source of [pins, makefile, nativeMain, nativeBuild, build, packaging]) {
    assert.doesNotMatch(source, /WAMR|wasm2c|-ofmt=c|ghostty-vt\.c/i);
  }
});

test("native process and socket APIs terminate at typed in-Wasm ENOSYS wrappers", async () => {
  const compiler = await readFile(new URL("../src/compiler.cpp", import.meta.url), "utf8");
  const wrapper = await readFile(new URL("../bin/dolly-cc", import.meta.url), "utf8");
  const runtime = await readFile(new URL("../src/dolly.c", import.meta.url), "utf8");
  const libcurl = await readFile(new URL("../src/libcurl-fetch.c", import.meta.url), "utf8");
  const curlCommand = await readFile(new URL("../src/commands/curl.c", import.meta.url), "utf8");
  const pythonRecipe = await readFile(new URL("../Dollyfile-python", import.meta.url), "utf8");
  const pythonSocketStubs = await readFile(
    new URL("../src/runtimes/cpython-socket-stubs.c", import.meta.url),
    "utf8",
  );
  const pythonPatch = await readFile(
    new URL("../config/cpython-dolly.patch", import.meta.url),
    "utf8",
  );

  for (const [name, replacement] of [
    ["fork", "dolly_fork"],
    ["execve", "dolly_execve"],
    ["wait", "dolly_wait_any"],
    ["socket", "dolly_socket"],
    ["connect", "dolly_connect"],
    ["recv", "dolly_recv"],
  ]) {
    assert.match(compiler, new RegExp(`"${name}=${replacement}"`));
    assert.match(wrapper, new RegExp(`-D${name}=${replacement}`));
    assert.match(runtime, new RegExp(`${replacement}\\([^)]*\\)[\\s\\S]*?unavailable\\(\\)`));
  }
  assert.match(runtime, /static int unavailable\(void\) \{\s*errno = ENOSYS;/);
  assert.match(pythonRecipe, /MODULE__SOCKET_CFLAGS=/);
  assert.match(pythonRecipe, /Modules\/dolly_socket_stubs\.o/);
  assert.match(pythonRecipe, /-DPLATFORM="dolly"/);
  assert.match(pythonRecipe, /assert sys\.platform == "dolly"/);
  assert.match(pythonPatch, /_can_fork_exec = sys\.platform not in \{"dolly"/);
  assert.match(pythonPatch, /sys\.platform in \{"dolly", "emscripten"\}/);
  assert.match(pythonPatch, /HAVE_SYS_RESOURCE_H\) && !defined\(DOLLY\)/);
  assert.match(pythonRecipe, /import faulthandler, socket, pdb/);
  assert.match(pythonRecipe, /faulthandler\.dump_traceback/);
  for (const operation of ["accept", "bind", "getaddrinfo", "listen", "poll", "sendto"]) {
    assert.match(pythonSocketStubs, new RegExp(`dolly_py_${operation}\\(`));
  }
  assert.doesNotMatch(pythonSocketStubs, /dolly_http|fetch|EM_JS|emscripten/);
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

test("the main module uses one shared wasm64/table64 address space and owns WasmFS operations", async () => {
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

test("capability fingerprints separate browser authority from capsule contents", async () => {
  const script = await readFile(
    new URL("../scripts/capability-fingerprint.mjs", import.meta.url), "utf8",
  );
  const documentation = await readFile(
    new URL("../docs/capability-fingerprint.md", import.meta.url), "utf8",
  );
  const packageDefinition = JSON.parse(await readFile(
    new URL("../package.json", import.meta.url), "utf8",
  ));
  assert.equal(packageDefinition.scripts.fingerprint,
    "node scripts/capability-fingerprint.mjs");
  assert.match(script, /formatWasmType\(entry\.type\)/);
  assert.match(script, /browser import is unclassified/);
  assert.match(script, /appears in multiple policy groups/);
  assert.match(script, /network\.length !== 1/);
  assert.match(script, /env\.dolly_http_dispatch/);
  assert.match(script, /abiContracts/);
  assert.match(script, /interfaceSha256/);
  assert.match(script, /runtimeBuildId: buildId/);
  assert.match(script, /retainedManifestSha256/);
  assert.match(script, /authoritySha256/);
  assert.match(script, /fingerprintSha256/);
  assert.doesNotMatch(script, /credential.*value|auth\.json|OPENROUTER_API_KEY/i);
  assert.match(documentation, /audit identities, not signatures or grants/);
  assert.match(documentation, /Secrets and\s+HTTP response data are never included/);
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

test("the HTTP broker removes browser-owned transport headers without removing credentials", () => {
  const headers = new Headers({
    accept: "application/json",
    "accept-encoding": "gzip",
    authorization: "Bearer sandbox-key",
    "user-agent": "bonnie/0.6 (Dolly wasm64)",
  });
  stripDollyBrowserOwnedHeaders(headers);
  assert.equal(headers.get("accept"), "application/json");
  assert.equal(headers.get("authorization"), "Bearer sandbox-key");
  assert.equal(headers.has("accept-encoding"), false);
  assert.equal(headers.has("user-agent"), false);
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
  assert.match(runtime, /setenv\("TERM", "xterm-256color", 1\)/);
  assert.match(runtime, /setenv\("COLORTERM", "truecolor", 1\)/);
  assert.match(runtime, /setenv\("SHELL", "\/bin\/slop", 1\)/);
  assert.match(renderer, /GHOSTTY_STYLE_COLOR_RGB\) return value->value\.rgb/);
  assert.match(renderer, /return terminal_palette\[value->value\.palette\]/);
  assert.equal(settings.theme, "dolly");
  assert.equal(settings.shellPath, "/bin/slop");
  assert.equal(settings.images.autoResize, false);
  assert.equal(theme.vars.yellow, "#f2d45c");
  assert.match(browserProof, /response\.write\(`data:/);
  assert.match(browserProof, /piFixtureStream\.phase = "prefix"/);
  assert.match(browserProof, /thinkingAfter\.frame > thinkingStart\.frame/);
  assert.match(browserProof, /assert\.doesNotMatch\(streamedPrefixText, \/DOLLY-PI-HTTP-EDIT-OK\//);
  assert.match(browserProof, /piPalette\.accentOutsideCursor > 20/);
  assert.match(browserProof, /Pi's ! command executing ls through \/bin\/slop/);
  assert.match(browserProof, /tsc --target ES2023 --module ES2022 --moduleResolution bundler/);
  assert.match(browserProof, /DOLLY-TYPESCRIPT-EXTENSION-OK/);
  assert.match(browserProof, /Pi restart with target-compiled TypeScript extension/);
  assert.match(browserProof, /__dollyIncompleteBootstrapPaints/);
});

test("upstream Pi is source-built for Janis and customized only through normal files", async () => {
  const { startup } = await readImagePlan("default");
  const extension = await readFile(new URL("../src/pi/dolly-tools.js", import.meta.url), "utf8");
  const command = await readFile(new URL("../src/commands/pi.c", import.meta.url), "utf8");
  const quickjs = await readFile(new URL("../src/runtimes/quickjs-main.c", import.meta.url), "utf8");
  const systemPrompt = await readFile(new URL("../src/pi/SYSTEM.md", import.meta.url), "utf8");
  const dollySkill = await readFile(
    new URL("../src/pi/skills/dolly/SKILL.md", import.meta.url),
    "utf8",
  );
  const settings = JSON.parse(
    await readFile(new URL("../src/pi/settings.json", import.meta.url), "utf8"),
  );
  const runtime = await readFile(new URL("../src/dolly.c", import.meta.url), "utf8");
  const browser = await readFile(new URL("../src/browser.mjs", import.meta.url), "utf8");
  const page = await readFile(new URL("../terminal.html", import.meta.url), "utf8");

  assert.match(command, /@earendil-works\/pi-coding-agent\/dist\/cli\.js/);
  for (const name of ["bash", "read", "edit", "write", "download"]) {
    assert.match(extension, new RegExp(`name: "${name}"`));
  }
  assert.match(extension, /Dolly\.shell\(parameters\.command, "", 60_000\)/);
  assert.match(quickjs, /stdin_file == NULL \? 0 : fileno\(stdin_file\)/);
  assert.match(extension, /context\.ui\.setHeader/);
  assert.match(extension, /! Slop/);
  assert.match(extension, /Bash is not installed/);
  assert.match(extension, /Dolly\.(?:readFile|writeFile)/);
  assert.match(extension, /Dolly\.download\(target\)/);
  assert.match(extension, /registerCommand\("demo"/);
  assert.match(startup, /ENV PI_SKIP_VERSION_CHECK=1/);
  assert.match(startup, /skills\/dolly\/SKILL\.md/);
  assert.match(dollySkill, /https:\/\/github\.com\/daugasauron\/dolly/);
  assert.match(dollySkill, /env\.dolly_http_dispatch/);
  assert.match(systemPrompt, /cannot disable browser CORS/);
  assert.match(extension, /pi\.on\("session_start"/);
  assert.match(runtime, /dolly_spawn\(entry_argv\[0\], entry_argc, entry_argv/);
  assert.match(runtime, /load_image_entry/);
  assert.match(runtime, /Pi exited; entering the recovery Slop shell/);
  assert.match(runtime, /restarting Pi after unexpected status/);
  assert.match(runtime, /status == 130/);
  assert.match(
    runtime,
    /PI_PACKAGE_DIR[\s\S]*?\/usr\/lib\/node_modules\/@earendil-works\/pi-coding-agent/,
  );
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
  assert.equal(settings.images.autoResize, false);
  assert.match(startup, /extensions\/dolly-tools\.js/);
  assert.match(startup, /echo '\{"type":"module"\}' > \/home\/dolly\/\.pi\/agent\/extensions\/package\.json/);
  assert.match(startup, /\.pi\/agent\/SYSTEM\.md/);
  assert.match(startup, /SOURCE HOST TXT .*janis\.js \/usr\/lib\/janis\/runtime\.js/);
  assert.doesNotMatch(startup, /pi-package\.tar|pi-target/);
  assert.match(startup, /RUN make -f \/usr\/src\/dolly\/startup\.mk pi/);
  assert.match(startup, /CHECK pi --version/);
  assert.match(startup, /CHECK PI_STARTUP_BENCHMARK=1 pi --offline --no-session/);
  assert.match(startup, /KEEP \/usr\/bin\/pi/);
  assert.match(
    startup,
    /coding-agent\/docs .*coding-agent\/examples .*\/usr\/lib\/node_modules\/@earendil-works\/pi-coding-agent/,
  );
});

test("TypeScript and the exact Pi source tree compile inside Dolly", async () => {
  const pins = await readFile(new URL("../config/source-pins.sh", import.meta.url), "utf8");
  const targetConfig = await readFile(
    new URL("../config/pi-tsconfig.dolly.json", import.meta.url),
    "utf8",
  );
  const fetchTypeScript = await readFile(
    new URL("../scripts/fetch-typescript.sh", import.meta.url),
    "utf8",
  );
  const fetchPi = await readFile(
    new URL("../scripts/fetch-pi-source.sh", import.meta.url),
    "utf8",
  );
  const build = await readFile(new URL("../scripts/build.sh", import.meta.url), "utf8");
  const makefile = await readFile(new URL("../src/startup.mk", import.meta.url), "utf8");
  const gzip = await readFile(new URL("../src/commands/gzip.c", import.meta.url), "utf8");
  const tsc = await readFile(new URL("../src/commands/tsc.c", import.meta.url), "utf8");
  const wrapper = await readFile(
    new URL("../src/runtimes/tsc-dolly.mjs", import.meta.url),
    "utf8",
  );
  const compatibility = await readFile(
    new URL("../config/pi-quickjs-compat.mjs", import.meta.url),
    "utf8",
  );
  const targetCompatibility = await readFile(
    new URL("../src/runtimes/apply-pi-quickjs-compat.mjs", import.meta.url),
    "utf8",
  );
  const { startup } = await readImagePlan("default");

  assert.match(pins, /DOLLY_TYPESCRIPT_VERSION=5\.9\.3/);
  assert.match(pins, /typescript-5\.9\.3\.tgz/);
  assert.match(pins, /DOLLY_TYPESCRIPT_SHA256=10e108c9cf7d5f2879053dff18515fb405abf2ccef63eaaf017d9c571687a1d3/);
  assert.match(pins, /DOLLY_PI_SOURCE_COMMIT=b79e4cc834970cca69daebffab7df1da7d1e52c4/);
  assert.match(fetchTypeScript, /sha256sum --check --status/);
  assert.match(fetchPi, /checkout --quiet "\$\{DOLLY_PI_SOURCE_COMMIT\}"/);
  assert.match(fetchPi, /rev-parse HEAD/);
  assert.match(build, /default\/typescript-5\.9\.3\.tgz/);
  assert.match(build, /default\/pi-source\.tar/);
  for (const packageName of [
    "telemetry", "ai", "agent", "protocol", "client", "tui", "coding-agent",
  ]) {
    assert.match(build, new RegExp(`packages/${packageName}/src`));
    assert.match(
      startup,
      new RegExp(`RUN cd /usr/src/pi-source/packages/${packageName} && tsc -p tsconfig\\.dolly\\.json`),
    );
    assert.match(
      startup,
      new RegExp(`CHECK '\\[' -f /usr/src/pi-source/packages/${packageName}/dist-dolly/`),
    );
  }

  assert.match(makefile, /\/bin\/gzip: .*\/usr\/lib\/libz\.a/);
  assert.match(makefile, /\$\(CC\).* -lz -o \$@/);
  assert.match(makefile, /typescript: \/usr\/bin\/tsc/);
  assert.match(makefile, /\/usr\/bin\/tsc: .*_tsc\.js .*libdolly-js\.a/);
  assert.match(gzip, /gzopen\(argv\[2\], "rb"\)/);
  assert.match(gzip, /implements decompression to stdout only/);
  assert.match(tsc, /tsc-dolly\.mjs/);
  assert.match(wrapper, /Dolly\.readFile\(compiler\)/);
  assert.match(wrapper, /createRequire\(compiler\)/);
  assert.doesNotMatch(wrapper, /\bfetch\s*\(/);
  assert.doesNotMatch(wrapper, /\bimport\s+.*from/);

  const parsedTarget = JSON.parse(targetConfig);
  assert.equal(parsedTarget.compilerOptions.noCheck, true);
  assert.deepEqual(parsedTarget.compilerOptions.types, []);
  assert.equal(parsedTarget.compilerOptions.outDir, "./dist-dolly");
  assert.match(startup, /RUN gzip -dc .*typescript-5\.9\.3\.tgz/);
  assert.match(startup, /CHECK tsc --version .*Version 5\.9\.3/);
  assert.match(startup, /RUN tsc --target ES2023 --module ES2022/);
  assert.match(startup, /CHECK '\[' -f .*dist-dolly\/cli\.js '\]'/);
  assert.match(startup, /PI-SOURCE-EMIT/);
  assert.match(startup, /RUN make -f \/usr\/src\/dolly\/startup\.mk pi/);
  assert.match(startup, /CHECK pi --version/);
  assert.match(startup, /CHECK PI_STARTUP_BENCHMARK=1 pi --offline --no-session/);
  assert.match(startup, /KEEP \/usr\/bin\/pi/);
  assert.match(startup, /RUN janis -m \/usr\/lib\/pi\/apply-pi-quickjs-compat\.mjs .*tui\/dist-dolly\/utils\.js/);
  assert.match(startup, /CHECK grep -q '\^const zeroWidthRegex = \.\*u;\$'/);
  assert.match(startup, /pi-runtime-packages\.tar/);
  assert.match(startup, /CHECK janis -m \/tmp\/pi-image-check\.mjs \| grep -q '\^PI-IMAGE-PASSTHROUGH\$'/);
  assert.match(startup, /pi-generated-model-data\.tar/);
  assert.match(startup, /packages\/ai\/src\/providers\/data .*packages\/ai\/dist-dolly\/providers/);
  assert.match(startup, /coding-agent\/src\/core\/export-html\/template\.html/);
  assert.match(startup, /import chalk from "chalk"; import \{ Type \} from "typebox"/);
  assert.match(startup, /KEEP-TREE \/usr\/lib\/node_modules/);
  assert.match(startup, /import \{ defineTelemetrySchema \} from "@earendil-works\/pi-telemetry"/);
  assert.match(startup, /KEEP-TREE \/usr\/src\/pi-source/);
  assert.match(
    await readFile(new URL("../src/browser.mjs", import.meta.url), "utf8"),
    /defineTelemetrySchema.*bad target workspace package/,
  );
  assert.equal((compatibility.match(/\["[A-Za-z]+Regex",/g) ?? []).length, 6);
  assert.match(compatibility, /export function lowerPiQuickJs/);
  assert.match(targetCompatibility, /import \{ lowerPiQuickJs \} from "\/usr\/lib\/pi\/quickjs-compat\.mjs"/);
  assert.match(targetCompatibility, /Dolly\.writeFile\(path, lowerPiQuickJs\(Dolly\.readFile\(path\), "source"\)\)/);
  assert.doesNotMatch(targetCompatibility, /\bfetch\s*\(/);
});

test("the source-built Pi runtime profile is explicit and lockfile-verified", async () => {
  const census = await readFile(
    new URL("../scripts/pi-runtime-census.mjs", import.meta.url),
    "utf8",
  );
  const archive = await readFile(
    new URL("../scripts/build-pi-runtime-packages.mjs", import.meta.url),
    "utf8",
  );
  const profile = await readFile(
    new URL("../config/pi-runtime-packages.txt", import.meta.url),
    "utf8",
  );
  const packageDefinition = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );

  assert.equal(packageDefinition.dependencies.esbuild, undefined);
  assert.equal(packageDefinition.scripts["pi:census"], "node scripts/pi-runtime-census.mjs");
  assert.match(census, /explicit external package profile/);
  assert.match(census, /package-lock\.json/);
  assert.match(census, /licenseExpression/);
  assert.match(census, /lifecycleScripts/);
  assert.match(census, /nativeAddons/);
  assert.match(census, /embeddedWasm/);
  assert.match(census, /conservative trim candidates/);
  assert.doesNotMatch(census, /env\.dolly_http_dispatch|\bfetch\s*\(/);
  assert.match(archive, /config\/pi-runtime-packages\.txt/);
  assert.match(archive, /package-lock\.json/);
  assert.match(archive, /locked\.integrity/);
  assert.match(archive, /build-source-tar\.mjs/);
  assert.match(archive, /--exclude-suffix=\.map/);
  assert.match(archive, /\/usr\/lib\/node_modules\/\$\{name\}/);
  assert.doesNotMatch(archive, /\bfetch\s*\(/);
  assert.match(profile, /^openai$/m);
  assert.match(profile, /^typebox$/m);
  assert.doesNotMatch(profile, /@earendil-works\/pi-/);
  assert.doesNotMatch(profile, /@silvia-odwyer\/photon-node/);
});

test("Bonnie resolves wheels and source builds without adding a network edge", async () => {
  const recipe = await readFile(new URL("../Dollyfile-python", import.meta.url), "utf8");
  const frontend = await readFile(new URL("../src/commands/bonnie.c", import.meta.url), "utf8");
  const helper = await readFile(new URL("../src/runtimes/bonnie.py", import.meta.url), "utf8");
  const shell = await readFile(new URL("../src/slop.c", import.meta.url), "utf8");
  const browserProof = await readFile(
    new URL("../scripts/browser-harness.mjs", import.meta.url),
    "utf8",
  );
  const helperTemporary = await mkdtemp(join(tmpdir(), "dolly-bonnie-helper-"));
  try {
    const combinedPath = join(helperTemporary, "combined.txt");
    execFileSync("python3", [
      new URL("../src/runtimes/bonnie.py", import.meta.url).pathname,
      "combine",
      "Requests[socks]>=2",
      "requests<3,!=2.5",
      combinedPath,
    ]);
    const combined = (await readFile(combinedPath, "utf8")).trim();
    assert.match(combined, /^requests\[socks\]/);
    assert.match(combined, />=2/);
    assert.match(combined, /<3/);
    assert.match(combined, /!=2\.5/);
    const metadataPath = join(helperTemporary, "metadata.json");
    const selectionPath = join(helperTemporary, "selection.txt");
    await writeFile(metadataPath, JSON.stringify({ releases: {
      "1.9": [{
        filename: "requests-1.9.tar.gz",
        packagetype: "sdist",
        requires_python: ">=3",
        yanked: false,
      }],
      "3.1": [{
        filename: "requests-3.1.tar.gz",
        packagetype: "sdist",
        requires_python: ">=3",
        yanked: false,
      }],
    } }));
    execFileSync("python3", [
      new URL("../src/runtimes/bonnie.py", import.meta.url).pathname,
      "select",
      "requests>=1,<3",
      metadataPath,
      selectionPath,
    ]);
    assert.match(await readFile(selectionPath, "utf8"), /^version 1\.9$/m);
  } finally {
    await rm(helperTemporary, { recursive: true, force: true });
  }

  assert.match(recipe, /SOURCE HOST TXT .*bonnie\.c/);
  assert.match(recipe, /SOURCE HOST TXT .*bonnie\.py/);
  assert.match(recipe, /RUN cc .*bonnie\.c .* -lcurl/);
  assert.match(recipe, /KEEP \/usr\/lib\/bonnie\/bonnie\.py/);
  assert.match(recipe, /ENV PYTHONDONTWRITEBYTECODE=1/);
  assert.match(recipe, /-DDATE="Jan 01 1970"/);
  assert.match(recipe, /-DTIME="00:00:00"/);
  assert.match(recipe, /CHECK test ! -d \/usr\/lib\/python3\.14\/__pycache__/);
  assert.match(frontend, /https:\/\/pypi\.org\/pypi\/%s\/json/);
  assert.match(frontend, /BONNIE_FETCH_ATTEMPTS = 3/);
  assert.match(frontend, /helper_satisfies/);
  assert.match(frontend, /combine_requirements/);
  assert.match(frontend, /root_indices/);
  assert.match(frontend, /dependency constraints are unsatisfiable/);
  assert.match(frontend, /resolved and verified %zu package/);
  assert.match(frontend, /https:\/\/files\.pythonhosted\.org\/packages\//);
  assert.match(frontend, /compile_entry_points/);
  assert.match(frontend, /build_source/);
  assert.match(frontend, /build-requirement/);
  assert.match(frontend, /preparing dependency graph/);
  assert.match(frontend, /prepare_resolved_plan/);
  assert.match(frontend, /stage-reset/);
  assert.match(frontend, /prepared %zu package/);
  assert.match(frontend, /queue_requirements_file/);
  assert.match(frontend, /requirements-file options are unsupported/);
  assert.match(frontend, /run_introspection/);
  assert.match(frontend, /bonnie list/);
  assert.match(frontend, /bonnie freeze/);
  assert.match(frontend, /bonnie show PACKAGE/);
  assert.match(frontend, /bonnie check/);
  assert.match(frontend, /dolly_spawn\("\/bin\/cc"/);
  assert.match(helper, /default_environment/);
  assert.match(helper, /def combine\(left: str, right: str, output_path: str\)/);
  assert.match(helper, /def _sync_pythonpath\(\)/);
  assert.match(helper, /_dolly_bonnie_pythonpath/);
  assert.match(helper, /parse_wheel_filename/);
  assert.match(helper, /requires_dist/);
  assert.match(helper, /hashlib\.sha256/);
  assert.match(helper, /wheel path escapes its installation directory/);
  assert.match(helper, /wheel contains duplicate destination/);
  assert.match(helper, /def _console_scripts\(wheel: zipfile\.ZipFile/);
  assert.match(helper, /def verify\(specification: str, artifact_path: str/);
  assert.match(helper, /def _sdist_metadata\(/);
  assert.match(helper, /pyproject\.toml/);
  assert.match(helper, /--no-build-isolation/);
  assert.match(helper, /--no-index/);
  assert.match(helper, /def build\(sdist_path: str, wheel_path: str\)/);
  assert.match(helper, /def satisfies\(specification: str, version: str\)/);
  assert.match(helper, /def list_installed\(freeze: bool = False\)/);
  assert.match(helper, /def show_installed\(names: list\[str\]\)/);
  assert.match(helper, /def check_installed\(\) -> int/);
  assert.doesNotMatch(helper, /requests\.|urllib\.request|socket\./);
  assert.match(shell, /Python packages: bonnie install PACKAGE/);
  assert.match(browserProof, /requests>=2,<3/);
  assert.match(browserProof, /requests\[socks\]>=2,<3/);
  assert.match(browserProof, /bonnie freeze \| grep/);
  assert.match(browserProof, /bonnie show requests \| grep/);
  assert.match(browserProof, /bonnie check \| grep/);
  assert.match(browserProof, /--requirement \/tmp\/requirements\.txt/);
  assert.match(browserProof, /python -m pytest --version/);
  assert.match(browserProof, /file \/usr\/bin\/pytest \| grep -q WebAssembly/);
  assert.match(browserProof, /pytest -q \/tmp\/test_sample\.py/);
  assert.match(browserProof, /bonnie install black/);
  assert.doesNotMatch(browserProof, /bonnie install numpy/);
  assert.match(browserProof, /bonnie install pandas/);
  assert.match(browserProof, /find_spec\(\\"numpy\\"\) is None/);
  assert.match(browserProof, /DataFrame/);
  assert.match(browserProof, /black --quiet \/tmp\/black_sample\.py/);
  assert.match(browserProof, /import pdb, requests, socket/);
  assert.match(browserProof, /socket\.socket\(\)/);
  assert.match(browserProof, /contradictory version constraints/);
  assert.match(browserProof, /mutated its target before resolving the complete graph/);
});

test("CPython subprocesses use Dolly's serial in-Wasm lifecycle", async () => {
  const recipe = await readFile(new URL("../Dollyfile-python", import.meta.url), "utf8");
  const adapter = await readFile(
    new URL("../src/runtimes/cpython-process.c", import.meta.url),
    "utf8",
  );
  const compatibility = await readFile(
    new URL("../src/runtimes/cpython-subprocess.py", import.meta.url),
    "utf8",
  );
  const patch = await readFile(
    new URL("../config/cpython-dolly.patch", import.meta.url),
    "utf8",
  );

  assert.match(adapter, /dolly_spawn_env/);
  assert.match(adapter, /dolly_spawn_timeout/);
  assert.match(adapter, /dolly_wait/);
  assert.doesNotMatch(adapter, /fetch\s*\(|socket\s*\(/);
  assert.match(compatibility, /tempfile\.TemporaryFile/);
  assert.match(compatibility, /return "\/bin\/slop", \["\/bin\/slop", "-c", command\]/);
  assert.match(compatibility, /def _which\(program, path\)/);
  assert.match(compatibility, /os\.path\.isfile\(candidate\)/);
  assert.doesNotMatch(compatibility, /os\.X_OK|shutil\.which/);
  assert.match(compatibility, /for stream in \(sys\.stdout, sys\.stderr\)/);
  assert.match(patch, /from _dolly_subprocess import Popen/);
  assert.match(recipe, /subprocess\.check_output\(\["python"/);
  assert.match(recipe, /subprocess\.run\(\["cat"\], input="pipe-ok"/);
});

test("the compiler accepts fixed wasm64 CPython extension flags deliberately", async () => {
  const compiler = await readFile(new URL("../src/compiler.cpp", import.meta.url), "utf8");
  const toolchain = await readFile(
    new URL("../toolchain/CMakeLists.txt", import.meta.url), "utf8");
  assert.match(compiler, /argument == "-m64" \|\| argument == "-sMEMORY64=1"/);
  assert.match(compiler, /argument == "-fno-strict-overflow" \|\| argument == "-fwrapv"/);
  assert.match(compiler, /frontend_options\.push_back\("-fwrapv"\)/);
  assert.match(compiler, /DebugInfoKind::Full/);
  assert.match(compiler, /-debug-info-kind=standalone/);
  assert.match(compiler, /"--no-check-features"/);
  assert.ok(
    compiler.indexOf('"/usr/include/compat"') <
      compiler.indexOf('"/usr/include/c++/v1"') &&
    compiler.indexOf('"/usr/include/c++/v1"') <
      compiler.indexOf('"/usr/lib/clang/24/include"'),
    "embedded C++ include order must match the Emscripten driver",
  );
  for (const library of ["libc++.a", "libc++abi.a", "libclang_rt.builtins.a"]) {
    assert.match(compiler, new RegExp(escapeRegex(`/usr/lib/${library}`)));
  }
  assert.match(toolchain, /\/seed\/usr\/lib\/libclang_rt\.builtins\.a/);
  assert.doesNotMatch(toolchain, /libc\+\+(?:abi)?-noexcept\.a/);
  const startup = await readFile(new URL("../src/startup.mk", import.meta.url), "utf8");
  assert.match(startup, /\/usr\/lib\/libc\+\+\.a/);
  assert.match(startup, /\/usr\/lib\/libc\+\+abi\.a/);
  assert.match(startup, /libcxx-string-dolly\.c/);
  assert.doesNotMatch(startup, /LIBCXX_SOURCE_NAMES/);
});
