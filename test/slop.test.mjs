import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { shellCases, sourceFiles } from "./fixtures/slop-cases.mjs";

test("Slop argument ownership and substitution status under sanitizers", async t => {
  const project = resolve(import.meta.dirname, "..");
  const scratch = await mkdtemp(resolve(tmpdir(), "dolly-slop-sanitizer-"));
  try {
    execFileSync("cc", ["-g", "-O1", "-fsanitize=address,undefined", "-fno-omit-frame-pointer",
      "-no-pie", "-Iinclude", "src/slop.c", "test/fixtures/slop-denied-host.c",
      "-o", resolve(scratch, "slop")], { cwd: project, stdio: "pipe" });
    for (const [name, source] of Object.entries(sourceFiles)) {
      await writeFile(resolve(scratch, name), source);
    }
    const cwdResult = spawnSync(resolve(scratch, "slop"),
      ["-c", 'case "$PWD" in "$1") :;; *) exit 91;; esac', "fixture-zero", scratch], {
        cwd: scratch, encoding: "utf8", timeout: 5000,
        env: { ...process.env, PWD: "/not-the-working-directory", ASAN_OPTIONS: "detect_leaks=1:halt_on_error=1" },
      });
    assert.equal(cwdResult.status, 0, cwdResult.stderr);
    for (const [name, source, expected, referenceStatus = expected] of shellCases) await t.test(name, () => {
      const reference = spawnSync("bash", ["--noprofile", "--norc", "-c", source, "fixture-zero"], {
        cwd: scratch, encoding: "utf8", timeout: 5000,
        env: { ...process.env, BASH_ENV: "" },
      });
      assert.equal(reference.status, referenceStatus, `reference shell: ${reference.stderr}`);
      const result = spawnSync(resolve(scratch, "slop"), ["-c", source, "fixture-zero"], {
        cwd: scratch, encoding: "utf8", timeout: 5000,
        env: { ...process.env, ASAN_OPTIONS: "detect_leaks=1:halt_on_error=1" },
      });
      assert.equal(result.signal, null, `${result.error ?? ""}\n${result.stderr}`);
      assert.equal(result.status, expected, result.stderr);
      assert.doesNotMatch(result.stderr, /AddressSanitizer|runtime error:/);
    });
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});
