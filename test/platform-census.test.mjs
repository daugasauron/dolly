import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { censusProcessImports } from "../scripts/platform-census.mjs";
import { readWasmInterface } from "../scripts/wasm-interface.mjs";
import { DOLLY_PROCESS_ABI_DIGEST } from "../dist/dolly-process-abi.mjs";

test("static census recognizes the current process ABI, not resident plugins or filenames", async () => {
  const contract = await readWasmInterface(new URL("../dist/dolly-process-0.wasm", import.meta.url));
  const process = await readFile(new URL("../build/process-minimal.wasm", import.meta.url));
  const plugin = await readFile(new URL("../build/dolly-kernel-plugin-0.wasm", import.meta.url));
  const files = new Map([
    ["/bin/any-name", process], ["/plugin.wasm", plugin], ["/script", Buffer.from("#!/bin/slop\n")],
  ]);
  const census = censusProcessImports(files, contract, DOLLY_PROCESS_ABI_DIGEST);
  assert.equal(census.length, 1);
  assert.equal(census[0].path, "/bin/any-name");
  assert.equal(census[0].imports.length, 1);
  assert.match(census[0].imports[0], /^dolly_process_0\.call /);
  assert.throws(() => censusProcessImports(files, contract, "0".repeat(64)), /wrong dolly.process stamp/);
  assert.throws(() => censusProcessImports(new Map([["plugin", plugin]]), contract, DOLLY_PROCESS_ABI_DIGEST), /no valid Dolly process/);
  const wrong = await readFile(new URL("../build/process-wrong-call.wasm", import.meta.url));
  assert.throws(() => censusProcessImports(new Map([["/bad", wrong]]), contract, DOLLY_PROCESS_ABI_DIGEST), /call/);
});
