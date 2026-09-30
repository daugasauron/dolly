import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmod, copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

const projectDir = resolve(import.meta.dirname, "..");
const fixture = name => resolve(projectDir, "test/fixtures", name);

test("Patti's parsers, source cache and compiler commands behave like Cargo", async () => {
  const temporary = await mkdtemp(resolve(tmpdir(), "dolly-patti-"));
  try {
    const compile = (output, ...sources) => execFileSync("cc", ["-std=c17", "-I", resolve(projectDir, "src"),
      "-I", resolve(projectDir, "src/commands"), "-I", resolve(projectDir, "src/third_party/tomlc17"),
      ...sources, resolve(projectDir, "src/third_party/tomlc17/tomlc17.c"), "-lz", "-o", output]);
    const patti = resolve(temporary, "patti");
    compile(patti, resolve(projectDir, "src/commands/patti.c"));
    compile(resolve(temporary, "patti-unit"), fixture("patti-unit.c"));
    assert.match(execFileSync(resolve(temporary, "patti-unit"), { encoding: "utf8" }), /PATTI-PARSERS-PASSED/);
    // Patti hashes the compiler's SDK directory, so the mock gets one of its own.
    const sdk = resolve(temporary, "sdk/bin");
    await mkdir(sdk, { recursive: true });
    await copyFile(fixture("rustc-mock.py"), resolve(sdk, "rustc"));
    await chmod(resolve(sdk, "rustc"), 0o755);
    const env = { ...process.env, PATH: `${sdk}:${process.env.PATH}` };
    assert.match(execFileSync("python3", ["-B", fixture("patti.py"), patti], { env, encoding: "utf8" }),
      /PATTI-FIXTURES-PASSED/);
    assert.match(execFileSync("python3", ["-B", fixture("patti-build.py"), patti, temporary], { env, encoding: "utf8" }),
      /PATTI-BUILD-PASSED/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
