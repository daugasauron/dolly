import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parseWasmInterface, appendCustomSection } from "../src/wasm-interface.mjs";
import { validateProcessInterface } from "../src/process-abi.mjs";
import { validateDsoInterface, validateDsoHost, requireDsoType } from "../host/dso/interface.mjs";
import { validateProcess, validateProcessDso } from "../scripts/dolly-abi.mjs";
import { DOLLY_PROCESS_ABI_DIGEST } from "../dist/dolly-process-abi.mjs";
import { DOLLY_ERRNO } from "../src/process-constants.mjs";

const fixture = name => new URL(`../build/process-${name}.wasm`, import.meta.url);
const contractPath = new URL("../dist/dolly-process-0.wasm", import.meta.url);
const contract = parseWasmInterface(await readFile(contractPath));
const validate = bytes => validateProcessInterface(contract, parseWasmInterface(bytes), DOLLY_PROCESS_ABI_DIGEST);

test("Wasm import, export and custom-section names match the engine's literal UTF-8", () => {
  const string = value => {
    const bytes = [...new TextEncoder().encode(value)];
    return [bytes.length, ...bytes];
  };
  const section = (id, bytes) => [id, bytes.length, ...bytes];
  const bytes = appendCustomSection(Uint8Array.from([0, 97, 115, 109, 1, 0, 0, 0,
    ...section(1, [1, 0x60, 0, 0]),
    ...section(2, [1, ...string("\uFEFFenv"), ...string("\uFEFFcall"), 0, 0]),
    ...section(7, [2, ...string("answer"), 0, 0, ...string("\uFEFFanswer"), 0, 0]),
  ]), "\uFEFFdolly.process", Uint8Array.of(42));
  const module = new WebAssembly.Module(bytes), parsed = parseWasmInterface(bytes);
  assert.deepEqual(parsed.imports.map(({ module, name }) => ({ module, name })),
    WebAssembly.Module.imports(module).map(({ module, name }) => ({ module, name })));
  assert.deepEqual(parsed.exports.map(entry => entry.name), WebAssembly.Module.exports(module).map(entry => entry.name));
  assert.deepEqual(parsed.customSections, ["\uFEFFdolly.process"]);
  assert.equal(WebAssembly.Module.customSections(module, parsed.customSections[0]).length, 1);
});

test("a table of nothing but Binaryen's cast-emulation thunks marks a cast-emulated program", () => {
  const section = (id, bytes) => [id, bytes.length, ...bytes];
  // Types: the thunk, (i64 x 16) -> i64, and an ordinary (i32, i32) -> i32.
  const types = section(1, [2, 0x60, 16, ...Array(16).fill(0x7e), 1, 0x7e, 0x60, 2, 0x7f, 0x7f, 1, 0x7f]);
  const program = tableFunctions => new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, ...types,
    ...section(3, [2, 0, 1]),
    ...section(4, [1, 0x70, 0, 2]),
    ...tableFunctions.length ? section(9, [1, 0, 0x41, 0, 0x0b, tableFunctions.length, ...tableFunctions]) : [],
    ...section(10, [2, 4, 0, 0x42, 0, 0x0b, 4, 0, 0x41, 0, 0x0b])]);
  for (const [functions, emulated] of [[[0], true], [[0, 1], false], [[1], false], [[], false]]) {
    const bytes = program(functions);
    new WebAssembly.Module(bytes);
    assert.equal(parseWasmInterface(bytes).castEmulated, emulated, `table of functions ${functions}`);
  }
});

test("a useful freestanding executable needs only the canonical process imports and _start", async () => {
  const bytes = await readFile(fixture("minimal"));
  assert.deepEqual(validate(bytes), { initial: 1n, maximum: 131072n });
  assert.deepEqual(parseWasmInterface(bytes).exports.map(x => x.name), ["_start"]);
  await validateProcess(contractPath, [fixture("minimal"), fixture("no-dso")]);
});

for (const [name, error] of [
  ["wrong-call", /import dolly_process_0.call must be/],
  ["wrong-start", /incompatible process export _start/],
  ["wrong-memory", /process memory is outside/],
]) {
  test(`build and browser validators agree on ${name}, despite a valid stamp`, async () => {
    const bytes = await readFile(fixture(name));
    assert.throws(() => validate(bytes), error);
    await assert.rejects(validateProcess(contractPath, [fixture(name)]), error);
  });
}

test("memory records, stamps, and side-module identity are checked from actual bytes", async () => {
  const original = new Uint8Array(await readFile(fixture("minimal")));
  const changed = original.slice();
  const record = parseWasmInterface(changed).customSectionData.find(x => x.name === "dolly.process.memory").data;
  new DataView(record.buffer, record.byteOffset, record.byteLength).setBigUint64(0, 2n, true);
  const stamp = parseWasmInterface(original).customSectionData.find(x => x.name === "dolly.process").data;
  const cases = [
    [changed, /memory does not match its memory import/],
    [appendCustomSection(original, "dolly.process", stamp), /exactly one dolly.process section/],
    [appendCustomSection(original, "dylink.0", new Uint8Array()), /must not be a side module/],
    [new Uint8Array(await readFile(contractPath)), /exactly one dolly.process section/],
  ];
  const scratch = await mkdtemp(join(tmpdir(), "dolly-abi-test-"));
  try {
    for (const [bytes, error] of cases) {
      assert.throws(() => validate(bytes), error);
      const path = join(scratch, "case.wasm");
      await writeFile(path, bytes);
      await assert.rejects(validateProcess(contractPath, [path]), error);
    }
  } finally { await rm(scratch, { recursive: true, force: true }); }
});

test("browser errors use Dolly's target encoding, not Linux numbers", () => {
  assert.equal(DOLLY_ERRNO.EINTR, 27);
  assert.equal(DOLLY_ERRNO.EINVAL, 28);
  assert.equal(DOLLY_ERRNO.ENOBUFS, 42);
  assert.equal(DOLLY_ERRNO.ENOSYS, 52);
});

const dsoContractPath = new URL("../dist/dolly-dso-0.wasm", import.meta.url);
const dsoContract = parseWasmInterface(await readFile(dsoContractPath));
const dso = async name => parseWasmInterface(await readFile(new URL(`../build/dso-${name}.wasm`, import.meta.url)));

test("the optional DSO profile checks infrastructure and hooks at build and browser admission", async () => {
  await validateProcessDso(contractPath, dsoContractPath, [new URL("../build/dso-types.wasm", import.meta.url)]);
  for (const name of ["types", "local", "start"]) validateDsoInterface(dsoContract, await dso(name), DOLLY_PROCESS_ABI_DIGEST);
  for (const name of ["stack", "table", "memory", "got", "hook"]) {
    const library = await dso(`wrong-${name}`);
    assert.throws(() => validateDsoInterface(dsoContract, library, DOLLY_PROCESS_ABI_DIGEST), /DSO /);
    await assert.rejects(validateProcessDso(contractPath, dsoContractPath,
      [new URL(`../build/dso-wrong-${name}.wasm`, import.meta.url)]), /DSO /);
  }
});

test("DSO providers and deferred self definitions are checked by actual signatures", async () => {
  const library = await dso("wrong-self");
  const requested = library.imports.find(entry => entry.module === "env" && entry.name === "answer");
  const provided = library.exports.find(entry => entry.name === "answer");
  assert.throws(() => requireDsoType(provided.type, requested.type, "answer"), /expected func\(i64\).*got func\(i32\)/);
  const host = parseWasmInterface(await readFile(fixture("dso-host")));
  validateDsoHost(dsoContract, new Map(host.exports.map(entry => [entry.name, entry])));
  const badHost = parseWasmInterface(await readFile(fixture("dso-bad-host")));
  validateProcessInterface(contract, badHost, DOLLY_PROCESS_ABI_DIGEST);
  assert.throws(() => validateDsoHost(dsoContract, new Map(badHost.exports.map(entry => [entry.name, entry]))), /DSO __dolly_dso_allocate/);
});
