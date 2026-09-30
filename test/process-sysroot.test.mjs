import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

test("sysroot publication keys startup code and preserves previous versions", async t => {
  const root = await mkdtemp(join(tmpdir(), "dolly-process-sysroot-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const run = promisify(execFile);
  const libraries = join(root, ".cache/emscripten/sysroot/lib/wasm64-emscripten");
  for (const path of [libraries, "scripts", "config", "build/process-threads", "bin", ".cache/llvm-native/bin"])
    await mkdir(path.startsWith(root) ? path : join(root, path), { recursive: true });
  await copyFile(new URL("../scripts/prepare-process-sysroot.sh", import.meta.url),
    join(root, "scripts/prepare-process-sysroot.sh"));
  for (const [name, tool] of [["bin/emar", "ar"], [".cache/llvm-native/bin/llvm-nm", "nm"]]) {
    const { stdout } = await run("sh", ["-c", `command -v ${tool}`]);
    await symlink(stdout.trim(), join(root, name));
  }
  await writeFile(join(root, "provider.c"), "int fixture(void) { return 0; }\n");
  await run("cc", ["-c", "provider.c", "-o", "provider.o"], { cwd: root });
  await run("ar", ["rcsD", "build/libdolly-process.a", "provider.o"], { cwd: root });
  const clients = ["runtime", "gpu"].map(name => `libdolly-${name}.a`);
  for (const name of clients) await copyFile(join(root, "build/libdolly-process.a"), join(root, "build", name));
  for (const name of ["libstandalonewasm-ww-memgrow.a", "libstubs.a", "libc-ww.a",
    "libdlmalloc-ww.a", "libclang_rt.builtins-wasmsjlj-ww.a", "libunwind-ww-wasmexcept.a",
    "libc++-ww-wasmexcept.a", "libc++abi-ww-wasmexcept.a", "libstandalonewasm-mt-memgrow.a",
    "libdlmalloc-mt.a", "libclang_rt.builtins-wasmsjlj-mt.a", "libunwind-mt-wasmexcept.a",
    "libc++-mt-wasmexcept.a", "libc++abi-mt-wasmexcept.a"])
    await copyFile(join(root, "build/libdolly-process.a"), join(libraries, name));
  for (const name of ["libdolly-process.a", "libdolly-runtime.a", "libc-mt.a"])
    await copyFile(join(root, "build/libdolly-process.a"), join(root, "build/process-threads", name));
  await copyFile(join(root, "provider.o"), join(root, "build/process-threads/crt1.o"));
  await writeFile(join(root, "config/process-libc-provider.symbols"), "fixture\n");
  const startup = join(root, "build/process-crt1.o");
  const compileStartup = async value => {
    await writeFile(join(root, "startup.c"), `int startup(void) { return ${value}; }\n`);
    await run("cc", ["-c", "startup.c", "-o", startup], { cwd: root });
  };
  const publish = async () => (await run("bash", ["scripts/prepare-process-sysroot.sh", ...clients], {
    cwd: root, env: { ...process.env, PATH: `${join(root, "bin")}:${process.env.PATH}` },
  })).stdout.trim();
  await compileStartup(1);
  const original = await publish();
  const originalBytes = await readFile(startup);
  assert.deepEqual(await readFile(join(original, "crt1.o")), originalBytes);
  assert.equal(await publish(), original);
  await compileStartup(2);
  const changed = await publish();
  assert.notEqual(changed, original, "startup changes must select a new sysroot");
  assert.deepEqual(await readFile(join(changed, "crt1.o")), await readFile(startup));
  assert.deepEqual(await readFile(join(original, "crt1.o")), originalBytes);
  assert.equal(await publish(), changed);
  await writeFile(join(root, "client.c"), "int client(void) { return 7; }\n");
  await run("cc", ["-c", "client.c", "-o", "client.o"], { cwd: root });
  await run("ar", ["rcsD", "build/libdolly-gpu.a", "client.o"], { cwd: root });
  const clientChanged = await publish();
  assert.notEqual(clientChanged, changed, "client ABI libraries must participate in sysroot identity");
  assert.deepEqual(await readFile(join(clientChanged, "libdolly-gpu.a")), await readFile(join(root, "build/libdolly-gpu.a")));
  await copyFile(startup, join(root, "build/process-threads/crt1.o"));
  const threadChanged = await publish();
  assert.notEqual(threadChanged, clientChanged, "threaded startup must participate in sysroot identity");
  assert.deepEqual(await readFile(join(threadChanged, "threads/crt1.o")), await readFile(startup));
  await rm(startup);
  await assert.rejects(publish());
  assert.deepEqual(await readFile(join(original, "crt1.o")), originalBytes);
});
