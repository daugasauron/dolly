import assert from "node:assert/strict";
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

const artifact = (name) => new URL(`../dist/${name}`, import.meta.url);
const contractPath = new URL("../dist/dolly-0.wasm", import.meta.url);
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const commandNames = [
  "program-writer.wasm",
  "program-reader.wasm",
  "program-inspector.wasm",
  "lua-5.5.1.wasm",
];
const moduleInfrastructure = new Set([
  "memory",
  "__indirect_function_table",
  "__memory_base",
  "__stack_pointer",
  "__table_base",
  "__table_base32",
]);
const loaderBackedFunctions = new Set([
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

  assert.equal(formatWasmType(memory.type), "memory64(min=1024,max=131072,shared)");
  assert.equal(formatWasmType(table.type), "table64(min=1,max=*):funcref");
  assert.equal(formatWasmType(entry.type), "func(i32,i64)->(i32)");
  assert.equal(formatWasmType(toolchain.type), "func(i32,i64,i32)->(i32)");
  assert.equal(formatWasmType(commandExit.type), "func(i32)->()");
  assert.equal(contract.imports.some((item) => item.name === "exit"), false);
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

test("upstream Lua keeps executable-local relocations out of the global GOT", async () => {
  const lua = await readWasmInterface(artifact("lua-5.5.1.wasm"));

  assert.equal(lua.hasStart, true, "Lua's relocated BSS initializer should be preserved");
  assert.ok(lua.exports.some((entry) => entry.name === "__wasm_apply_data_relocs"));
  for (const name of ["luaT_typenames_", "luaP_opmodes", "luaopen_utf8"]) {
    assert.equal(
      lua.imports.some((entry) => entry.name === name),
      false,
      `Lua leaks its local ${name} relocation through the process-global GOT`,
    );
    assert.equal(
      lua.exports.some((entry) => entry.name === name),
      false,
      `Lua exports executable-local symbol ${name}`,
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

  for (const entry of contract.imports) {
    if (!moduleInfrastructure.has(entry.name) && !loaderBackedFunctions.has(entry.name)) {
      expected.add(`_${entry.name}`);
    }
  }

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
    (entry) => entry.name === "dolly_terminal_mailbox_address",
  );

  assert.equal(formatWasmType(bootstrap.type), "func()->(i32)");
  assert.equal(formatWasmType(run.type), "func()->(i32)");
  assert.equal(formatWasmType(mailbox.type), "func()->(i64)");
  assert.equal(runtime.exports.some((entry) => entry.name === "dolly_shell_start"), false);
  assert.equal(runtime.exports.some((entry) => entry.name === "dolly_shell_submit"), false);
});

test("the runtime implements the canonical terminal mailbox contract", async () => {
  const contract = await readWasmInterface(artifact("dolly-terminal-0.wasm"));
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

test("the frontend connects ghostty-web to a worker and an in-Wasm terminal mailbox", async () => {
  const frontend = await readFile(new URL("../src/browser.mjs", import.meta.url), "utf8");
  const page = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const worker = await readFile(new URL("../src/runtime-worker.mjs", import.meta.url), "utf8");
  const ghostty = await readFile(artifact("ghostty-web.js"));

  assert.match(frontend, /from "\.\.\/dist\/ghostty-web\.js"/);
  assert.match(frontend, /terminal\.onData\(handleTerminalData\)/);
  assert.match(frontend, /new Worker\(new URL\("\.\/runtime-worker\.mjs"/);
  assert.match(frontend, /Atomics\.waitAsync/);
  assert.match(
    frontend,
    /for \(;;\) \{\s*const current = Atomics\.load\(this\.words, index\);\s*if \(current === 1\) return;\s*const waiting = Atomics\.waitAsync/s,
  );
  assert.match(frontend, /transport\?\.push\(data\)/);
  assert.doesNotMatch(frontend, /dolly_shell_submit|ccall\(/);
  assert.match(worker, /shared: true/);
  assert.match(worker, /_dolly_bootstrap\(\)/);
  assert.match(worker, /_dolly_shell_run\(\)/);
  assert.match(worker, /installOutputDevice\(dolly, "\/dev\/dolly-stdout", 1\)/);
  assert.match(worker, /installOutputDevice\(dolly, "\/dev\/dolly-stderr", 2\)/);
  assert.match(worker, /FS\.registerDevice/);
  assert.match(frontend, /event\.key !== "F11"/);
  assert.match(frontend, /requestFullscreen\(\{ navigationUI: "hide" \}\)/);
  assert.match(frontend, /fullscreenchange/);
  assert.match(frontend, /window\.addEventListener\("keydown", zoomTerminal/);
  assert.match(frontend, /terminal\.options\.fontSize = fontSize/);
  assert.match(frontend, /Dolly IosevkaTerm SemiBold/);
  assert.match(frontend, /convertEol: true/);
  assert.match(frontend, /const accent = "#f2d45c"/);
  assert.doesNotMatch(frontend, /\x1b\[31m|\x1b\[33m\$\{text\}/);
  assert.match(page, /IosevkaTerm-SemiBold\.woff2/);
  assert.match(page, /caret-color: transparent/);
  assert.doesNotMatch(page, /<header|<footer|id="status"/);
  assert.ok(ghostty.length > 500_000, "ghostty-web browser bundle was not packaged");
});

test("boot commands are source inputs, not prebuilt command assets", async () => {
  const loader = await readFile(artifact("dolly.mjs"), "utf8");
  const toolchain = await readFile(new URL("../toolchain/CMakeLists.txt", import.meta.url), "utf8");
  const runtimeSource = await readFile(new URL("../src/dolly.c", import.meta.url), "utf8");
  const startup = await readFile(new URL("../src/startup.slop", import.meta.url), "utf8");
  const startupMake = await readFile(new URL("../src/startup.mk", import.meta.url), "utf8");
  assert.match(loader, /\/usr\/src\/dolly\/slop\.c/);
  assert.match(runtimeSource, /"\/usr\/src\/dolly\/slop\.c", "\/bin\/slop"/);
  for (const command of [
    "help", "pwd", "cd", "cat", "echo", "mkdir", "touch", "rm", "clear", "ls", "cc", "ld", "ar",
  ]) {
    assert.match(loader, new RegExp(`/usr/src/dolly/commands/${command}\\.c`));
    const source = await readFile(
      new URL(`../src/commands/${command}.c`, import.meta.url),
      "utf8",
    );
    assert.match(source, /int main\(int argc, char \*\*argv\)/);
    assert.doesNotMatch(source, /command_name|strcmp\(.*argv\[0\]/);
    assert.match(
      runtimeSource,
      new RegExp(`\\{"/usr/src/dolly/commands/${command}\\.c", "/bin/${command}"\\}`),
    );
  }
  const cxxSource = await readFile(
    new URL("../src/commands/c++.c", import.meta.url),
    "utf8",
  );
  assert.match(loader, /\/usr\/src\/dolly\/commands\/c\+\+\.c/);
  assert.match(cxxSource, /dolly_toolchain_main\(argc, argv, DOLLY_TOOLCHAIN_CXX\)/);
  assert.match(
    runtimeSource,
    /\{"\/usr\/src\/dolly\/commands\/c\+\+\.c", "\/bin\/c\+\+"\}/,
  );
  assert.doesNotMatch(runtimeSource, /copy_command|tool_names/);
  assert.match(loader, /\/usr\/src\/dolly\/cpp-check\.cpp/);
  assert.match(loader, /\/usr\/src\/dolly\/demo\.c/);
  for (const command of ["grep", "sed", "head", "wc"]) {
    assert.match(loader, new RegExp(`/usr/src/sbase/${command}\\.c`));
    assert.doesNotMatch(toolchain, new RegExp(`${command}\\.wasm`));
  }
  for (const source of [
    "awkgram.tab.c", "awkgram.tab.h", "awk.h", "b.c", "lex.c", "lib.c",
    "main.c", "maketab.c", "parse.c", "proto.h", "run.c", "tran.c",
  ]) {
    assert.match(loader, new RegExp(`/usr/src/awk/${source.replace(".", "\\.")}`));
  }
  assert.match(startupMake, /\/usr\/src\/awk\/proctab\.c:[^\n]*awk-maketab/);
  assert.match(startupMake, /\/bin\/awk: \$\(AWK_SOURCES\)/);
  assert.doesNotMatch(toolchain, /awk[^\n]*\.wasm/);
  assert.match(loader, /\/usr\/src\/dolly\/commands\/curl\.c/);
  assert.match(loader, /\/usr\/src\/dolly\/libcurl-fetch\.c/);
  assert.match(loader, /\/usr\/include\/curl\/curl\.h/);
  assert.match(startupMake, /\/usr\/lib\/libcurl\.a: \/tmp\/libcurl-fetch\.o/);
  assert.match(startupMake, /\/usr\/src\/dolly\/commands\/curl\.c -lcurl -o \$@/);
  assert.match(loader, /\/usr\/src\/zlib\/zlib\.h/);
  assert.match(loader, /\/usr\/src\/git\/dolly-sources\.txt/);
  assert.match(startupMake, /\/usr\/lib\/libz\.a: \$\(ZLIB_OBJECTS\)/);
  assert.match(startupMake, /\/usr\/lib\/libgit\.a: \$\(GIT_OBJECTS\)/);
  assert.match(startupMake, /\/usr\/bin\/git:/);
  assert.match(startupMake, /\/usr\/libexec\/git-core\/git-remote-http:/);
  assert.match(startupMake, /-lgit -lcurl -lz -o \$@/);
  assert.match(loader, /\/usr\/src\/make\/dolly-sources\.txt/);
  assert.match(startup, /=== building GNU make ===/);
  assert.match(startup, /\/usr\/src\/make\/src\/main\.c[\s\S]*-o \/usr\/bin\/make/);
  assert.match(loader, /\/usr\/src\/dolly\/runtimes\/quickjs-main\.c/);
  for (const source of ["dtoa.c", "libregexp.c", "libunicode.c", "quickjs.c"]) {
    assert.match(loader, new RegExp(`/usr/src/quickjs/${source.replace(".", "\\.")}`));
  }
  assert.match(loader, /\/usr\/src\/dolly\/commands\/qjs\.c/);
  assert.match(loader, /\/usr\/src\/dolly\/runtimes\/quickjs-runner\.h/);
  assert.match(startupMake, /\/usr\/lib\/libdolly-js\.a: \$\(QUICKJS_OBJECTS\)/);
  assert.match(startupMake, /\/usr\/bin\/qjs: \/usr\/src\/dolly\/commands\/qjs\.c \/usr\/lib\/libdolly-js\.a/);
  assert.match(loader, /\/usr\/src\/dolly\/commands\/pi\.c/);
  assert.match(loader, /\/usr\/lib\/pi\/pi\.js/);
  assert.match(loader, /\/usr\/lib\/dolly\/node\.js/);
  assert.match(startupMake, /\/usr\/bin\/pi: \/usr\/src\/dolly\/commands\/pi\.c/);
  assert.match(startupMake, /\$\(CC\) \$\(QUICKJS_CPPFLAGS\) \$< -ldolly-js -o \$@/);
  assert.match(startup, /=== installing Pi agent ===/);
  assert.doesNotMatch(toolchain, /quickjs[^\n]*\.wasm/);
  assert.match(loader, /\/usr\/bin\/lua/);
  assert.doesNotMatch(loader, /\/usr\/src\/dolly\/tools\.c/);
  assert.match(toolchain, /\$\{DOLLY_LUA_WASM\}@\/usr\/bin\/lua/);
  assert.doesNotMatch(toolchain, /\$\{DOLLY_LUA_WASM\}@\/bin\/lua/);
  assert.match(toolchain, /startup\.slop@\/etc\/dolly\/startup\.slop/);
  assert.match(toolchain, /startup\.mk@\/usr\/src\/dolly\/startup\.mk/);
  assert.match(runtimeSource, /\{"slop", "\/etc\/dolly\/startup\.slop", NULL\}/);
  assert.match(runtimeSource, /int dolly_write_file\(/);
  assert.doesNotMatch(runtimeSource, /install_(?:awk|libcurl_fetch|zlib|git|make|quickjs)/);
  assert.doesNotMatch(loader, /program-ls\.wasm|program-cpp\.wasm/);
  await assert.rejects(readFile(artifact("program-ls.wasm")), { code: "ENOENT" });
  await assert.rejects(readFile(artifact("program-cpp.wasm")), { code: "ENOENT" });
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
    "DOLLY_WAMR_COMMIT",
    "DOLLY_GHOSTTY_COMMIT",
    "DOLLY_UUCODE_SHA256",
    "DOLLY_LUA_SHA256",
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
    "../scripts/build-lua.sh",
    "../scripts/fetch-awk.sh",
    "../scripts/fetch-curl.sh",
    "../scripts/fetch-git.sh",
    "../scripts/fetch-iosevka.sh",
    "../scripts/fetch-lua.sh",
    "../scripts/fetch-make.sh",
    "../scripts/fetch-zig.sh",
    "../scripts/fetch-wamr.sh",
    "../scripts/fetch-ghostty.sh",
    "../scripts/fetch-uucode.sh",
    "../scripts/fetch-quickjs.sh",
    "../scripts/fetch-sbase.sh",
    "../scripts/fetch-zlib.sh",
    "../scripts/prepare-git.sh",
    "../scripts/prepare-make.sh",
    "../scripts/prepare-ghostty-source.sh",
  ]) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(source, /source "\$\{project_dir\}\/config\/source-pins\.sh"/);
    assert.doesNotMatch(source, /\b[0-9a-f]{40}\b/);
  }
  assert.match(inventory, /Host\/build-time role/);
  assert.match(inventory, /Browser-time result/);
  assert.match(inventory, /Pi agent/);
  assert.match(inventory, /\/home\/dolly\/.*global Git configuration/);
});

test("bootstrap creates a writable HOME with a default global Git identity", async () => {
  const runtime = await readFile(new URL("../src/dolly.c", import.meta.url), "utf8");
  const startup = await readFile(new URL("../src/startup.slop", import.meta.url), "utf8");
  assert.match(runtime, /setenv\("HOME", "\/home\/dolly", 1\)/);
  assert.match(startup, /mkdir -p \/home\/dolly/);
  assert.match(startup, /echo '\[user\]' > \/home\/dolly\/\.gitconfig/);
  assert.match(startup, /name = Dolly/);
  assert.match(startup, /email = dolly@example\.invalid/);
});

test("slop reserves only stateful shell operations and resolves utilities through PATH", async () => {
  const shell = await readFile(new URL("../src/slop.c", import.meta.url), "utf8");
  const runtime = await readFile(new URL("../src/dolly.c", import.meta.url), "utf8");
  const startup = await readFile(new URL("../src/startup.slop", import.meta.url), "utf8");
  for (const builtin of [":", "exit", "cd", "export", "unset", "set"]) {
    assert.match(shell, new RegExp(`strcmp\\(argv\\[0\\], "${escapeRegex(builtin)}"\\)`));
  }
  for (const command of ["help", "pwd", "cat", "echo", "mkdir", "touch", "rm", "clear", "ls", "cc", "c++", "ld", "ar", "make", "demo"] ) {
    assert.doesNotMatch(shell, new RegExp(`strcmp\\(argv\\[0\\], "${escapeRegex(command)}"\\)`));
  }
  assert.match(shell, /resolve_command\(argv\[0\]/);
  assert.match(runtime, /setenv\("PATH", "\/bin:\/usr\/bin", 1\)/);
  assert.match(shell, /int xtrace;/);
  assert.match(shell, /option\[index\] == 'x'/);
  assert.match(startup, /^set -ex$/m);
  assert.match(startup, /echo '=== building GNU make ==='/);
  assert.doesNotMatch(shell, /chmod|X_OK|S_IXUSR|S_IXGRP|S_IXOTH/);
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

test("the in-Wasm linker stages outside bin before publishing the final name", async () => {
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
  assert.doesNotMatch(compiler, /link_command\(output\)/);
});

test("the in-Wasm C driver accepts Zig's required aliasing mode", async () => {
  const compiler = await readFile(new URL("../src/compiler.cpp", import.meta.url), "utf8");
  assert.match(compiler, /argument == "-fno-strict-aliasing"/);
  assert.match(compiler, /push_back\("-relaxed-aliasing"\)/);
  assert.match(compiler, /options\.frontend_options\.push_back\(argument\)/);
});

test("Zig bootstraps and builds Ghostty VT from pinned source inside Dolly", async () => {
  const pins = await readFile(new URL("../config/source-pins.sh", import.meta.url), "utf8");
  const startup = await readFile(new URL("../src/startup.slop", import.meta.url), "utf8");
  const makefile = await readFile(new URL("../src/startup.mk", import.meta.url), "utf8");
  const runner = await readFile(new URL("../src/runtimes/zig1-wamr.c", import.meta.url), "utf8");
  const command = await readFile(new URL("../src/commands/zig.c", import.meta.url), "utf8");
  const compatibility = await readFile(new URL("../src/zig/include/zig.h", import.meta.url), "utf8");
  const ghosttyFetch = await readFile(new URL("../scripts/fetch-ghostty.sh", import.meta.url), "utf8");
  const packaging = await readFile(new URL("../toolchain/CMakeLists.txt", import.meta.url), "utf8");

  assert.match(pins, /DOLLY_ZIG_VERSION=0\.16\.0/);
  assert.match(pins, /DOLLY_ZIG_SHA256=[0-9a-f]{64}/);
  assert.match(pins, /DOLLY_WAMR_COMMIT=[0-9a-f]{40}/);
  assert.match(pins, /DOLLY_GHOSTTY_COMMIT=[0-9a-f]{40}/);
  assert.match(pins, /DOLLY_UUCODE_SHA256=[0-9a-f]{64}/);

  assert.match(startup, /make -f \/usr\/src\/dolly\/startup\.mk zig/);
  assert.match(startup, /\/usr\/libexec\/dolly\/zig-check/);
  assert.match(startup, /make -f \/usr\/src\/dolly\/startup\.mk ghostty/);
  assert.match(startup, /\/usr\/bin\/ghostty-vt/);

  assert.match(makefile, /\/usr\/libexec\/dolly\/zig1:.*zig1-wamr\.c[\s\S]*?\$\(CC\)/);
  assert.match(makefile, /\/tmp\/ghostty\/ghostty-vt\.c:[\s\S]*?zig \$\(GHOSTTY_ZIG_FLAGS\)/);
  assert.match(makefile, /\/usr\/lib\/libghostty-vt\.a:[\s\S]*?\$\(AR\) rcs/);
  assert.match(makefile, /\/usr\/bin\/ghostty-vt:[\s\S]*?\$\(CC\).*?-lghostty-vt/);
  assert.match(runner, /#include "wasi\.c"/);
  assert.match(runner, /wasm_runtime_register_natives_raw/);
  assert.match(runner, /DOLLY_ZIG1_WASM_PATH "\/usr\/src\/zig\/stage1\/zig1\.wasm"/);
  assert.match(command, /DOLLY_ZIG_VERSION "0\.16\.0"/);
  assert.match(command, /strcmp\(argv\[1\], "version"\)/);
  assert.match(command, /dolly_spawn\(child_argv\[0\]/);
  assert.match(compatibility, /#undef __has_include/);
  assert.match(compatibility, /#undef zig_return_address/);
  assert.match(ghosttyFetch, /status --porcelain/);

  for (const packaged of [
    "DOLLY_ZIG_DIR",
    "DOLLY_WAMR_DIR",
    "DOLLY_GHOSTTY_DIR",
    "DOLLY_UUCODE_DIR",
  ]) {
    assert.match(
      packaging,
      new RegExp(`--preload-file ${escapeRegex("${" + packaged + "}")}`),
    );
  }
  assert.doesNotMatch(makefile, /wasm2c|wasm3/i);
});

test("native process and socket APIs terminate at typed in-Wasm ENOSYS wrappers", async () => {
  const compiler = await readFile(new URL("../src/compiler.cpp", import.meta.url), "utf8");
  const wrapper = await readFile(new URL("../bin/dolly-cc", import.meta.url), "utf8");
  const runtime = await readFile(new URL("../src/dolly.c", import.meta.url), "utf8");
  const libcurl = await readFile(new URL("../src/libcurl-fetch.c", import.meta.url), "utf8");

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
  assert.equal(
    actual.some((name) => /nodefs|opfs|fetch|socket|spawn|process|pthread|thread_/.test(name)),
    false,
  );
});
