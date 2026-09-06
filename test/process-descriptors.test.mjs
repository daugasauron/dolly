import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

test("descriptor fixture agrees with native POSIX under sanitizers", async () => {
  const scratch = await mkdtemp(resolve(tmpdir(), "dolly-descriptors-"));
  try {
    const executable = resolve(scratch, "probe");
    execFileSync("cc", ["-Wall", "-Wextra", "-Werror", "-g", "-O1",
      "-fsanitize=address,undefined", "-fno-omit-frame-pointer", "-no-pie",
      "test/fixtures/process-descriptors.c", "-o", executable],
    { cwd: resolve(import.meta.dirname, ".."), timeout: 30000 });
    assert.equal(execFileSync(executable, { encoding: "utf8", timeout: 10000 }),
      "PROCESS-DESCRIPTORS-OK\n");
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});
