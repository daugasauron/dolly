import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

for (const [fixture, marker] of [["process-descriptors", "PROCESS-DESCRIPTORS-OK"], ["process-locks", "PROCESS-LOCKS-OK"]]) {
  test(`${fixture} fixture agrees with native POSIX under sanitizers`, async () => {
    const scratch = await mkdtemp(resolve(tmpdir(), `dolly-${fixture}-`));
    try {
      const executable = resolve(scratch, "probe");
      execFileSync("cc", ["-Wall", "-Wextra", "-Werror", "-g", "-O1",
        "-fsanitize=address,undefined", "-fno-omit-frame-pointer", "-no-pie",
        `test/fixtures/${fixture}.c`, "-o", executable],
      { cwd: resolve(import.meta.dirname, ".."), timeout: 30000 });
      assert.equal(execFileSync(executable, { encoding: "utf8", timeout: 20000 }), `${marker}\n`);
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  });
}
