import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { inspectDollyfile } from "../src/dollyfile-view.mjs";

test("the C parser and JavaScript inspector agree on quoted words, paths and declarations", async () => {
  const scratch = await mkdtemp(resolve(tmpdir(), "dolly-parser-"));
  try {
    const project = resolve(import.meta.dirname, "..");
    const program = resolve(scratch, "parser");
    execFileSync("cc", ["-std=c11", "-O1", "-I", resolve(project, "include"),
      resolve(project, "test/fixtures/dollyfile-parser.c"), "-o", program]);
    const run = (...args) => spawnSync(program, args, { encoding: "utf8" });
    const recipe = resolve(scratch, "recipe");
    const prefix = "DOLLY 2\nMODULE probe\nREQUIRES TOOL cc\n";
    for (const row of [
      'SLOP "cc" input.c', "SLOP 'cc' input.c", "SLOP c\\c input.c",
      'SLOP CWD "/workspace/project dir" "cc" "an input.c"',
      'SLOP "CWD" / "cc" ""', 'SLOP cc "unterminated', "SLOP CWD /workspace/ cc",
      "SLOP cc input.c", 'SLOP cc "東京 input.c" # comment',
      'EXPORTS ENV DOLLY_TEST_VALUE "APPEND literal"', "EXPORTS ENV DOLLY_TEST_VALUE APPEND",
      "EXPORTS ENV DOLLY_TEST_VALUE APPEND extra words", "REQUIRES TOOL cc",
      'FILE "/usr/share/a b"', "FILE /workspace/no", "FILE /usr/share/trailing/",
      "FILE /usr/share/a\u2028b",
      `FILE /${"界".repeat(1500)}`, 'FILE "/usr/share/a\\b"',
      'SOURCE URL file:///host/file /usr/share/file ' + "0".repeat(64),
    ]) {
      const source = prefix + row + "\n";
      let accepted = true;
      try { inspectDollyfile(source); } catch { accepted = false; }
      await writeFile(recipe, source);
      const actual = run("parse", recipe);
      assert.equal(actual.status === 0, accepted, `${row}\n${actual.stderr}`);
      if (row.includes('"APPEND literal"')) assert.match(actual.stdout, /ENV-VALUE:APPEND literal/);
    }
    await writeFile(recipe, 'DOLLY 2\nMODULE "probe"\n');
    assert.equal(run("parse", recipe).status, 0, "quoted module identity");
    for (const raw of ['cc "" "a b" c\\ d', "'cc' 'a\\b' \"東京\"", "cc input name.c"]) {
      const expected = inspectDollyfile(prefix + "SLOP " + raw + "\n").slops[0].command;
      assert.deepEqual(run("words", raw).stdout.split("\0").slice(0, -1), expected);
    }
    const directory = resolve(scratch, "space dir");
    await mkdir(directory);
    for (const command of ['"cc" "a b.c"', "cc 'a b.c' ; cc second.c"]) {
      const result = run("slop", `CWD "${directory}" ${command}`);
      assert.equal(result.status, 0, result.stderr);
      assert.ok(result.stdout.includes(`RAW-CWD:${directory}\nRAW-COMMAND:${command}\n`));
    }
    const file = resolve(scratch, "file");
    await writeFile(file, "data");
    await symlink("file", resolve(scratch, "link"));
    for (const type of ["FILE", "LIB", "HEADER", "FOLDER"]) {
      assert.equal(run("kind", type, file).status === 0, type !== "FOLDER", type);
      assert.equal(run("kind", type, directory).status === 0, ["FOLDER", "HEADER"].includes(type), type);
      assert.equal(run("kind", type, resolve(scratch, "link")).status === 0, type !== "FOLDER", type);
    }
    assert.equal(run("writer", "/modules/a.dm", "/modules/a.dm").status, 0);
    const duplicate = run("writer", "/modules/a.dm", "/modules/b.dm");
    assert.equal(duplicate.status, 1);
    assert.match(duplicate.stderr, /already written by \/modules\/a.dm:3/);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});
