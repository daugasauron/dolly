import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
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
  assert.equal(contract.imports.some((item) => item.name === "exit"), false);
  for (const [name, type] of [
    ["dolly_display_acquire", "func(i64)->(i32)"],
    ["dolly_display_begin_frame", "func(i64,i64)->(i32)"],
    ["dolly_display_present", "func(i64,i32)->(i32)"],
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
  assert.match(menu, /import \{ DOLLY_IMAGES \} from "\.\/dist\/dolly-images\.mjs"/);
  assert.match(menu, /`\.\/\$\{definition\.image\}\/`/);
  assert.match(menu, /`\.\/\$\{definition\.image\}\/rebuild\/`/);
  assert.match(menu, /`\.\/view\/\$\{definition\.image\}\/`/);
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
  }
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
  assert.equal(gameView.sources.length, 7);
  assert.equal(pythonView.sources.length, 4);
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
  assert.equal(sources.length, 66);
  assert.ok(sources.every((item) =>
    item.path.startsWith("/static/") && ["txt", "bin"].includes(item.media) &&
    /^[0-9a-f]{64}$/.test(item.sha256) && item.byteLength > 0));
  assert.equal(sources.some((item) => item.path.endsWith(".assets")), false);
  assert.equal(sources.find((item) => item.path === "/static/bootstrap/tar.c").media, "txt");
  assert.ok(sources.find((item) => item.path.endsWith("/zig-lib.tar")).byteLength > 200e6);
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
    "../bin/dolly-cc",
    "../scripts/build.sh",
    "../scripts/build-toolchain.sh",
    "../scripts/build-bison.sh",
    "../scripts/fetch-awk.sh",
    "../scripts/fetch-curl.sh",
    "../scripts/fetch-git.sh",
    "../scripts/fetch-iosevka.sh",
    "../scripts/fetch-make.sh",
    "../scripts/fetch-zig.sh",
    "../scripts/fetch-zig-host.sh",
    "../scripts/fetch-ghostty.sh",
    "../scripts/fetch-uucode.sh",
    "../scripts/fetch-quickjs.sh",
    "../scripts/fetch-sbase.sh",
    "../scripts/fetch-zlib.sh",
    "../scripts/prepare-git.sh",
    "../scripts/prepare-make.sh",
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
  const { startup } = await readImagePlan("default");
  assert.match(runtime, /setenv\("HOME", "\/home\/dolly", 1\)/);
  assert.match(startup, /mkdir -p \/home\/dolly/);
  assert.match(startup, /echo '\[user\]' > \/home\/dolly\/\.gitconfig/);
  assert.match(startup, /name = Dolly/);
  assert.match(startup, /email = dolly@example\.invalid/);
});

test("slop reserves only stateful shell operations and resolves utilities through PATH", async () => {
  const shell = await readFile(new URL("../src/slop.c", import.meta.url), "utf8");
  const runtime = await readFile(new URL("../src/dolly.c", import.meta.url), "utf8");
  const copy = await readFile(new URL("../src/commands/cp.c", import.meta.url), "utf8");
  const { startup } = await readImagePlan("default");
  for (const builtin of [":", "exit", "cd", "export", "unset", "set"]) {
    assert.match(shell, new RegExp(`strcmp\\(argv\\[0\\], "${escapeRegex(builtin)}"\\)`));
  }
  for (const command of ["help", "pwd", "cat", "echo", "mkdir", "touch", "rm", "clear", "ls", "mv", "cp", "cc", "c++", "ld", "ar", "make", "demo"] ) {
    assert.doesNotMatch(shell, new RegExp(`strcmp\\(argv\\[0\\], "${escapeRegex(command)}"\\)`));
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
  assert.match(shell, /SLOP_DEFERRED_STATUS/);
  assert.match(shell, /expand_deferred_status\(shell, tokens, start, end\)/);
  assert.match(shell, /kind == TOKEN_NOT && tokens->count != 0/);
  assert.doesNotMatch(shell, /readline|linenoise|editline/);
  assert.match(startup, /RUN cc .*\/bin\/tar/);
  assert.match(startup, /CHECK git --version/);
  assert.doesNotMatch(shell, /chmod|X_OK|S_IXUSR|S_IXGRP|S_IXOTH/);
  assert.match(startup, /RUN cc \/usr\/src\/dolly\/commands\/cp\.c -o \/bin\/cp/);
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

test("the in-Wasm linker validates a staged output before publishing it", async () => {
  const compiler = await readFile(new URL("../src/compiler.cpp", import.meta.url), "utf8");
  const bootstrapCompiler = await readFile(new URL("../bin/dolly-cc", import.meta.url), "utf8");
  assert.match(compiler, /temporary_path\(job, options\.inputs\.size\(\) \+ 1, "\.wasm"\)/);
  assert.match(compiler, /"-fvisibility=hidden"/);
  assert.match(bootstrapCompiler, /-fvisibility=hidden/);
  assert.match(compiler, /export_name\(\\"dolly_main\\"\)/);
  assert.match(compiler, /_Z10dolly_main/);
  assert.match(compiler, /__asm__\(\\"%s\\"\)/);
  assert.match(compiler, /link_command\(linked, link_inputs\)/);
  assert.match(compiler, /validate_command\(linked\).*stamp_command\(linked\).*publish_file\(linked, output\)/s);
  assert.match(compiler, /std::rename\(source\.c_str\(\), output\.c_str\(\)\)/);
  assert.match(compiler, /WasmFS cannot rename across every backend boundary/);
  assert.match(compiler, /std::fopen\(output\.c_str\(\), "wb"\)/);
  assert.doesNotMatch(compiler, /link_command\(output\)/);
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
  const makefile = await readFile(new URL("../src/gamedev.mk", import.meta.url), "utf8");
  const packaging = await readFile(new URL("../scripts/build.sh", import.meta.url), "utf8");
  const gamedev = await readFile(new URL("../Dollyfile-gamedev", import.meta.url), "utf8");
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
    runtime,
    /release_display_lease_for_pid\(process->pid\);[\s\S]*?fflush\(NULL\)/,
  );
  assert.match(runtime, /dolly_display_next_event[\s\S]*?dolly_interrupt_checkpoint\(\)/);
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
  assert.match(raylibAdapter, /dolly_display_acquire\(&context->surface\)/);
  assert.match(raylibAdapter, /dolly_display_present\(context->surface\.generation/);
  assert.match(makefile, /\/usr\/bin\/graphics-demo: \/usr\/src\/dolly\/gamedev\/graphics-demo\.c/);
  assert.match(packaging, /copy_static .*graphics-demo\.c.*gamedev\/graphics-demo\.c/);
  assert.match(gamedev, /SOURCE HOST TXT \/static\/gamedev\/graphics-demo\.c/);
  assert.match(gamedev, /KEEP \/usr\/bin\/graphics-demo/);
  assert.match(gamedev, /KEEP \/usr\/src\/dolly\/gamedev\/gamedev\.mk/);
  assert.match(gamedev, /KEEP \/usr\/src\/dolly\/gamedev\/graphics-demo\.c/);
  assert.match(gamedev, /raylib\.tar/);
  assert.match(gamedev, /box2d\.tar/);
  assert.match(gamedev, /skills\/dolly-gamedev\/SKILL\.md/);
  assert.match(makefile, /-DPLATFORM_MEMORY/);
  assert.match(makefile, /libbox2d\.a/);
  assert.match(demo, /#include <box2d\/box2d\.h>/);
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
  assert.equal(theme.vars.yellow, "#f2d45c");
  assert.match(browserProof, /response\.write\(`data:/);
  assert.match(browserProof, /piFixtureStream\.phase = "prefix"/);
  assert.match(browserProof, /thinkingAfter\.frame > thinkingStart\.frame/);
  assert.match(browserProof, /assert\.doesNotMatch\(streamedPrefixText, \/DOLLY-PI-HTTP-EDIT-OK\//);
  assert.match(browserProof, /piPalette\.accentOutsideCursor > 20/);
  assert.match(browserProof, /Pi's ! command executing ls through \/bin\/slop/);
  assert.match(browserProof, /__dollyIncompleteBootstrapPaints/);
});

test("upstream Pi is packaged for Janis and customized only through normal files", async () => {
  const packaging = await readFile(new URL("../scripts/build-pi.mjs", import.meta.url), "utf8");
  const { startup } = await readImagePlan("default");
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
  const runtime = await readFile(new URL("../src/dolly.c", import.meta.url), "utf8");
  const browser = await readFile(new URL("../src/browser.mjs", import.meta.url), "utf8");
  const page = await readFile(new URL("../terminal.html", import.meta.url), "utf8");

  assert.match(packaging, /globalThis\.PI_BUNDLED_NODE = true/);
  assert.match(packaging, /registerBunOAuthFlows/);
  assert.match(packaging, /@earendil-works\/pi-ai\/bun-oauth/);
  assert.match(packaging, /await main\(process\.argv\.slice\(2\)\)/);
  assert.match(packaging, /unmodified upstream CLI packaged for Janis/);
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
  assert.match(startup, /SOURCE HOST TXT .*janis\.js \/usr\/lib\/janis\/runtime\.js/);
  assert.match(startup, /SOURCE HOST BIN .*pi-package\.tar/);
});
