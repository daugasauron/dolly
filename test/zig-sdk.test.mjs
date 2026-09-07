import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { decodeSystemSnapshot, decodeSnapshotEnvironment } from "../scripts/system-snapshot-format.mjs";
import { readWasmInterface } from "../scripts/wasm-interface.mjs";
import { validateProcessInterface } from "../src/process-abi.mjs";
import { DOLLY_PROCESS_ABI_DIGEST } from "../dist/dolly-process-abi.mjs";

test("Clang and Zig are independently validated process executables", async () => {
  const contract = await readWasmInterface(new URL("../dist/dolly-process-0.wasm", import.meta.url));
  for (const name of ["compiler", "zig"]) {
    validateProcessInterface(contract, await readWasmInterface(
      new URL(`../build/process-tools/${name}.wasm`, import.meta.url)), DOLLY_PROCESS_ABI_DIGEST);
  }
});

test("default copies Ghostty runtime bytes without its compiler or development files", async () => {
  const load = async name => decodeSystemSnapshot(await readFile(
    new URL(`../dist/dolly-${name}-system.snapshot`, import.meta.url)));
  const runtime = await load("default"), builder = await load("ghostty-build");
  for (const path of ["/usr/bin/zig", "/usr/lib/zig/std/std.zig",
    "/usr/lib/libghostty-vt.a", "/usr/include/ghostty/vt.h"]) {
    assert.ok(builder.files.has(path), `builder must retain ${path}`);
    assert.ok(!runtime.entries.has(path), `runtime must not retain ${path}`);
  }
  assert.ok(!runtime.manifest.some(path => path.startsWith("/usr/lib/zig/") ||
    path.startsWith("/usr/include/ghostty/")));
  assert.ok(!runtime.entries.has("/usr/include/ghostty.h"));
  for (const path of ["/usr/lib/libdisplay.so", "/usr/share/fonts/IosevkaTerm-SemiBold.ttf",
    "/usr/share/licenses/ghostty/LICENSE", "/usr/share/licenses/uucode/LICENSE.md"]) {
    assert.ok(runtime.files.has(path), path);
    assert.deepEqual(runtime.files.get(path), builder.files.get(path), path);
  }
  const environment = decodeSnapshotEnvironment(runtime.files.get("/etc/dolly/environment"));
  assert.equal(environment.get("DISPLAY"), "/usr/lib/libdisplay.so");
  assert.equal(environment.has("ZIG_LIB_DIR"), false);
});

test("the Zig SDK archive contains exactly its supported-target install roots", async () => {
  const roots = (await readFile(new URL("../config/zig-sdk-files.txt", import.meta.url), "utf8"))
    .split("\n").filter(line => line && !line.startsWith("#"));
  assert.equal(new Set(roots).size, roots.length);
  const files = execFileSync("tar", ["-tf",
    new URL("../dist/static/default/zig-lib.tar", import.meta.url).pathname], { encoding: "utf8" })
    .trimEnd().split("\n");
  const sdk = files.filter(path => path.startsWith("usr/lib/zig/"))
    .map(path => path.slice("usr/lib/zig/".length));
  assert.deepEqual([...new Set(sdk.map(path => path.split("/")[0]))].sort(), roots.sort());
  assert.deepEqual(files.filter(path => !path.startsWith("usr/lib/zig/")),
    ["usr/share/licenses/zig/LICENSE"]);
  for (const required of ["std/std.zig", "compiler/test_runner.zig", "compiler_rt.zig",
    "compiler_rt/udivmodti4_test.zig", "c.zig", "zig.h"]) assert.ok(sdk.includes(required), required);
});
