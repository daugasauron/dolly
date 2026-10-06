import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { commandCases, pipelineCases, shellCases, sourceFiles } from "./fixtures/slop-cases.mjs";
import { stagedIncludeDirectory } from "../scripts/host-modules.mjs";
const includeDirectory = await stagedIncludeDirectory();

test("Slop semantics under sanitizers against Bash", async t => {
  const project = resolve(import.meta.dirname, "..");
  const scratch = await mkdtemp(resolve(tmpdir(), "dolly-slop-sanitizer-"));
  try {
    const compile = (output, ...sources) => execFileSync("cc", ["-g", "-O1",
      "-fsanitize=address,undefined", "-fno-omit-frame-pointer", "-no-pie", `-I${includeDirectory}`,
      "src/slop.c", ...sources, "test/fixtures/slop-denied-host.c", "-o", output], { cwd: project, stdio: "pipe" });
    compile(resolve(scratch, "native-slop"));
    // The same shell over the host's posix_spawn, pipes and SIGPIPE.
    const spawning = resolve(scratch, "spawning");
    await mkdir(spawning);
    compile(resolve(spawning, "slop"), "test/fixtures/native-spawn.c");
    for (const [name, source] of Object.entries(sourceFiles)) {
      await writeFile(resolve(scratch, name), source);
    }
    const cwdResult = spawnSync(resolve(scratch, "native-slop"),
      ["-c", 'case "$PWD" in "$1") :;; *) exit 91;; esac', "fixture-zero", scratch], {
        cwd: scratch, encoding: "utf8", timeout: 5000,
        env: { ...process.env, PWD: "/not-the-working-directory", ASAN_OPTIONS: "detect_leaks=1:halt_on_error=1" },
      });
    assert.equal(cwdResult.status, 0, cwdResult.stderr);
    // Bash is the reference for every case, including the nested `slop`.
    const reference = resolve(scratch, "reference");
    await mkdir(reference);
    await symlink(execFileSync("bash", ["-c", "command -v bash"], { encoding: "utf8" }).trim(),
      resolve(reference, "slop"));
    for (const [native, cases] of [["native-slop", shellCases], [null, commandCases], ["spawning/slop", pipelineCases]]) {
    for (const [name, source, expected, referenceStatus = expected] of cases) await t.test(name, () => {
      const bash = spawnSync("bash", ["--noprofile", "--norc", "-c", source, "fixture-zero"], {
        cwd: scratch, encoding: "utf8", timeout: 5000,
        env: { ...process.env, PATH: `${reference}:${process.env.PATH}`, BASH_ENV: "" },
      });
      assert.equal(bash.status, referenceStatus, `reference shell: ${bash.stderr}`);
      if (native === null) return;
      const result = spawnSync(resolve(scratch, native), ["-c", source, "fixture-zero"], {
        cwd: scratch, encoding: "utf8", timeout: 5000,
        env: { ...process.env, PATH: `${spawning}:${process.env.PATH}`, ASAN_OPTIONS: "detect_leaks=1:halt_on_error=1" },
      });
      assert.equal(result.signal, null, `${result.error ?? ""}\n${result.stderr}`);
      assert.equal(result.status, expected, result.stderr);
      assert.doesNotMatch(result.stderr, /AddressSanitizer|runtime error:/);
    });
    }
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});
