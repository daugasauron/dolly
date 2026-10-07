// The sealed closed-source-agent image holds no file of the Claude Code package: no
// path of it, and no file with the bytes of one of its members.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { decodeSystemSnapshot } from "../../../scripts/system-snapshot-format.mjs";
import { claudeCodeTarball } from "./fixtures/tarball.mjs";

const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const walk = directory => readdirSync(directory).flatMap(name => {
  const path = join(directory, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
});

test("the sealed closed-source-agent image contains no file of the Claude Code package", async () => {
  const snapshot = decodeSystemSnapshot(readFileSync(resolve(import.meta.dirname, "../../../dist/dolly-closed-source-agent-system.snapshot")));
  assert.deepEqual(snapshot.manifest.filter(path => /claude|anthropic/i.test(path)), []);
  const unpacked = mkdtempSync(`${tmpdir()}/claude-code-package-`);
  try {
    execFileSync("tar", ["-xzf", await claudeCodeTarball(), "-C", unpacked]);
    // Its vendored ripgrep's crate licence texts are the ones ripgrep's own build retains.
    const members = new Set(walk(unpacked).filter(path => !/\/(COPYING|LICENSE|UNLICENSE)[^/]*$/.test(path))
      .map(path => sha256(readFileSync(path))));
    assert.ok(members.size > 10, "the tarball unpacked to fewer files than expected");
    const shipped = [...snapshot.files].filter(([, data]) => members.has(sha256(data))).map(([path]) => path);
    assert.deepEqual(shipped, []);
  } finally {
    rmSync(unpacked, { recursive: true, force: true });
  }
});
