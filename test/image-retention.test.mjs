import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

const project = resolve(import.meta.dirname, "..");

test("shared filesystem restoration handles kinds, replacements and invalid parents", async () => {
  const scratch = await mkdtemp(resolve(tmpdir(), "dolly-fs-record-test-"));
  try {
    const program = resolve(scratch, "restore");
    execFileSync("cc", ["-std=c11", "-Wall", "-Wextra", "-Werror", "-I", resolve(project, "src"),
      resolve(project, "test/fixtures/fs-record.c"), "-o", program]);
    assert.match(execFileSync(program, [scratch], { encoding: "utf8" }), /FS-RECORD-OK/);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test("Dollyfile retention records directories and symlinks without traversing links", async () => {
  const scratch = await mkdtemp(resolve(tmpdir(), "dolly-retention-test-"));
  try {
    const program = resolve(scratch, "collector");
    execFileSync("cc", ["-std=c11", "-O1", "-ffunction-sections", "-fdata-sections",
      "-Wl,--gc-sections", "-I", resolve(project, "include"),
      resolve(project, "test/fixtures/image-retention.c"), "-o", program]);
    await mkdir(resolve(scratch, "tree/empty"), { recursive: true });
    await writeFile(resolve(scratch, "tree/file"), "retained");
    const collect = () => execFileSync(program, [scratch, "tree"], { encoding: "utf8" })
      .trim().split("\n").sort();
    assert.deepEqual(collect(), ["tree", "tree/empty", "tree/file"]);
    await symlink("file", resolve(scratch, "tree/link"));
    await symlink("missing", resolve(scratch, "tree/dangling"));
    await symlink(".", resolve(scratch, "tree/cycle"));
    assert.deepEqual(collect(), ["tree", "tree/cycle", "tree/dangling", "tree/empty", "tree/file", "tree/link"]);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});
