import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

function delta(records) {
  const header = Buffer.alloc(16);
  header.write("DOLLYSES"); header.writeUInt32LE(2, 8); header.writeUInt32LE(records.length, 12);
  return Buffer.concat([header, ...records.flatMap(([kind, path, value = ""]) => {
    const name = Buffer.from(path), data = Buffer.from(value), record = Buffer.alloc(16);
    record.writeUInt32LE(kind); record.writeUInt32LE(name.length, 4); record.writeBigUInt64LE(BigInt(data.length), 8);
    return [record, name, data];
  })]);
}

test("file recovery preserves the source, excludes live configuration, and rejects invalid deltas before copying", async t => {
  const root = await mkdtemp(join(tmpdir(), "dolly-session-recovery-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const run = promisify(execFile);
  const program = join(root, "recover"), input = join(root, "input"), output = join(root, "saved");
  const project = new URL("..", import.meta.url).pathname;
  await run("cc", ["-std=c11", "-Wall", "-Wextra", "-Werror", "-fsanitize=address,undefined",
    "-Isrc", "src/commands/session-recover.c", "-o", program], { cwd: project });
  const saved = delta([[2, "/etc/system", "old system"], [2, "/home/dolly/.dollyrc", "old startup"],
    [4, "/workspace/deleted"], [1, "/workspace/empty"], [3, "/workspace/link", "/etc"],
    [2, "/workspace/project.txt", "saved work"]]);
  await writeFile(input, saved);
  await run(program, [input, output]);
  assert.equal(await readFile(join(output, "workspace/project.txt"), "utf8"), "saved work");
  assert.equal(await readFile(join(output, "home/dolly/.dollyrc"), "utf8"), "old startup");
  await access(join(output, "workspace/empty"));
  for (const path of ["etc", "workspace/link", "workspace/deleted"])
    await assert.rejects(access(join(output, path)), { code: "ENOENT" });
  await assert.rejects(run(program, [input, output]), error => error.code === 1);
  assert.deepEqual(await readFile(input), saved);
  assert.equal(await readFile(join(output, "workspace/project.txt"), "utf8"), "saved work");
  await writeFile(join(root, "sentinel"), "unchanged");
  const wrongVersion = Buffer.from(saved); wrongVersion.writeUInt32LE(3, 8);
  const invalid = [saved.subarray(0, 8), saved.subarray(0, saved.length - 1), wrongVersion,
    delta([[0, "/workspace/file"]]), delta([[1, "/workspace/directory", "invalid data"]]),
    delta([[2, "/workspace/../../sentinel", "overwrite"]]), delta([[2, "/dev/file"]]), delta([[2, "/run/file"]]),
    delta([[2, "/workspace/file"], [2, "/workspace/file"]]),
    delta([[2, "/workspace/file"], [2, "/workspace/file/child"]]),
    delta([[3, "/workspace/link", "bad\0target"]]),
    ...["/workspace/file/", "/workspace//file", "/workspace/./file", "/workspace/a\0b", "/seed/file"]
      .map(path => delta([[2, path, "invalid path"]]))];
  for (const [index, bytes] of invalid.entries()) {
    await writeFile(input, bytes);
    const destination = join(root, `invalid-${index}`);
    await assert.rejects(run(program, [input, destination]), error => error.code === 1);
    await assert.rejects(access(destination), { code: "ENOENT" });
    assert.deepEqual(await readFile(input), bytes);
    assert.equal(await readFile(join(root, "sentinel"), "utf8"), "unchanged");
  }
  await truncate(input, 512 * 1024 * 1024 + 1);
  await assert.rejects(run(program, [input, join(root, "oversized")]), error => error.code === 1);
  await assert.rejects(access(join(root, "oversized")), { code: "ENOENT" });
});
