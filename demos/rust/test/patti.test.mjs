import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";
import test from "node:test";
import { inspectDollyfile } from "../../../src/dollyfile-view.mjs";

const projectDir = resolve(import.meta.dirname, "../../..");
const fixture = name => resolve(projectDir, "demos/rust/test/fixtures", name);

test("Patti's parsers, source cache and compiler commands behave like Cargo", async () => {
  const temporary = await mkdtemp(resolve(tmpdir(), "dolly-patti-"));
  try {
    const compile = (output, ...sources) => execFileSync("cc", ["-std=c17", "-I", resolve(projectDir, "src"),
      "-I", resolve(projectDir, "demos/rust"), "-I", resolve(projectDir, "demos/rust/tomlc17"),
      ...sources, resolve(projectDir, "demos/rust/tomlc17/tomlc17.c"), "-lz", "-o", output]);
    const patti = resolve(temporary, "patti");
    compile(patti, resolve(projectDir, "demos/rust/patti.c"));
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

test("Patti pins its C implementation and parser without a Python runtime dependency", async () => {
  const module = inspectDollyfile(await readFile(resolve(projectDir, "demos/rust/patti.dm"), "utf8"), "patti.dm");
  assert.ok(!module.requirements.some(requirement => requirement.name.startsWith("python")));
  const sources = new Map([
    ["patti.c", "demos/rust/patti.c"], ["sha256.h", "src/sha256.h"],
    ["tomlc17.c", "demos/rust/tomlc17/tomlc17.c"],
    ["tomlc17.h", "demos/rust/tomlc17/tomlc17.h"],
    ["LICENSE", "demos/rust/tomlc17/LICENSE"],
  ]);
  assert.equal(module.sources.length, sources.size);
  for (const source of module.sources) {
    const path = sources.get(basename(source.location));
    assert.ok(path, source.location);
    assert.equal(createHash("sha256").update(await readFile(resolve(projectDir, path))).digest("hex"), source.sha256);
  }
  assert.ok(module.slops.some(step => step.command[0] === "cc" && step.command.includes("/usr/bin/patti")));
});
