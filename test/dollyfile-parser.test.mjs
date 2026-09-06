import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
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
    const prefix = "DOLLY 3\nMODULE probe\nREQUIRES TOOL cc\n";
    for (const row of [
      'SLOP "cc" input.c', "SLOP 'cc' input.c", "SLOP c\\c input.c",
      'SLOP "" argument', 'SLOP CWD / "" argument',
      'SLOP CWD "/workspace/project dir" "cc" "an input.c"',
      'SLOP "CWD" / "cc" ""', 'SLOP cc "unterminated', "SLOP CWD /workspace/ cc",
      "SLOP cc input.c", 'SLOP cc "東京 input.c" # comment',
      'EXPORTS ENV DOLLY_TEST_VALUE "APPEND literal"', "EXPORTS ENV DOLLY_TEST_VALUE APPEND",
      "EXPORTS ENV DOLLY_TEST_VALUE", "EXPORTS TOOL cc", "EXPORTS TOOL cc /bin/cc",
      "EXPORTS ENV DOLLY_TEST_VALUE APPEND extra words", "REQUIRES TOOL cc", "SLOP unknown ; another", "SLOP LABEL=value cc",
      "SLOP cc; unknown", "EXPORTS FILE future", `EXPORTS TOOL ${"a".repeat(129)}`,
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
    for (const type of ["FILE", "FOLDER", "HEADER", "LIB"]) {
      const declaration = `EXPORTS ${type} value /usr/share/value\n`;
      const source = prefix + declaration;
      assert.doesNotThrow(() => inspectDollyfile(source));
      await writeFile(recipe, source);
      assert.equal(run("parse", recipe).status, 0, type);
      for (const earlier of ["", declaration]) {
        const invalid = prefix + earlier + `EXPORTS ${type} value\n`;
        assert.throws(() => inspectDollyfile(invalid), new RegExp(`invalid ${type} export`));
        await writeFile(recipe, invalid);
        const actual = run("parse", recipe);
        assert.notEqual(actual.status, 0, type);
        assert.match(actual.stderr, /EXPORTS failed/);
      }
    }
    await writeFile(recipe, 'DOLLY 3\nMODULE "probe"\n');
    assert.equal(run("parse", recipe).status, 0, "quoted module identity");
    for (const raw of ['cc "" "a b" c\\ d', "'cc' 'a\\b' \"東京\"", "cc input name.c"]) {
      const expected = inspectDollyfile(prefix + "SLOP " + raw + "\n").slops[0].command;
      assert.deepEqual(run("words", raw).stdout.split("\0").slice(0, -1), expected);
    }
    for (const locator of ["/Dollyfile", "/Dollyfile-pi", "/Dollyfile-python-pi", "/Dollyfile-", "/Dollyfile-/bad",
      `/Dollyfile-${"a".repeat(32)}`, `/Dollyfile-${"a".repeat(33)}`]) {
      let accepted = true;
      try { inspectDollyfile(`DOLLY 3\nIMAGE check\nFROM HOST ${locator} ${"0".repeat(64)}\nENTRY /bin/slop\n`); }
      catch { accepted = false; }
      assert.equal(run("image-locator", locator).status === 0, accepted, locator);
    }
    await writeFile(recipe, 'DOLLY 3\nMODULE probe\nEXPORTS ENV DOLLY_TEST_VALUE "a\\nb"\n');
    assert.match(run("parse", recipe).stdout, /ENV-VALUE:a\\nb/);
    for (const path of ["/", "/usr", "/usr/bin", "/usr/bin/tool", "/explicit"]) {
      assert.equal(run("artifact-path", path).status, 0, path);
    }
    for (const path of ["/u", "/usr/bin/tools", "/absent"]) assert.equal(run("artifact-path", path).status, 1, path);
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
    const child = "DOLLY 3\nMODULE child\nEXPORTS ENV DOLLY_TEST_VALUE new\n";
    const childPath = resolve(scratch, "child.dm");
    await writeFile(childPath, child);
    await writeFile(recipe, `DOLLY 3\nIMAGE check\nEXPORTS ENV DOLLY_TEST_VALUE old\nUSE HOST /modules/child.dm ${createHash("sha256").update(child).digest("hex")}\nENTRY /bin/slop\n`);
    const overridden = run("environment", recipe, childPath);
    assert.equal(overridden.status, 0, overridden.stderr);
    assert.equal(overridden.stdout, "ENV-VALUE:new\nENV-EXPORT:new\n");
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});
