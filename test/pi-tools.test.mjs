import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { posix as path } from "node:path";
import test from "node:test";

test("Pi's Slop tool streams output and reports nonzero exits as tool errors", async () => {
  const source = await readFile(new URL("../src/pi/dolly-tools.js", import.meta.url), "utf8");
  const registered = new Map();
  let status = 0;
  runInNewContext(source.replace("export default function", "function") + "\ndollyTools(pi);", {
    TextDecoder,
    __janisBuiltin: name => name === "fs" ? { existsSync: () => false } : {},
    __janisShellStream: (_command, stdout, stderr) => {
      stdout(new TextEncoder().encode("output β\n"));
      stderr(new TextEncoder().encode("diagnostic\n"));
      return { status };
    },
    pi: { on() {}, registerTool(tool) { registered.set(tool.name, tool); } },
  });
  const updates = [];
  const run = () => registered.get("bash").execute("call", { command: "probe" },
    new AbortController().signal, update => updates.push(update), { cwd: "/workspace" });
  const result = await run();
  assert.equal(result.details.status, 0);
  assert.equal(result.content[0].text, "output β\ndiagnostic\n");
  assert.equal(updates.length, 2);
  status = 7;
  await assert.rejects(run, /output β\ndiagnostic\n\nCommand exited with code 7/);
  status = 130;
  await assert.rejects(run, /Command exited with code 130/);
});

test("Pi edits require a unique nonempty match and a real change before writing", async () => {
  const source = await readFile(new URL("../src/pi/dolly-tools.js", import.meta.url), "utf8");
  const registered = new Map();
  let contents = "", writes = 0;
  runInNewContext(source.replace("export default function", "function") + "\ndollyTools(pi);", {
    __janisBuiltin: name => name === "path" ? path : { existsSync: () => false },
    Dolly: {
      readFile(target) { assert.equal(target, "/workspace/file"); return contents; },
      writeFile(target, value) { assert.equal(target, "/workspace/file"); writes++; contents = value; },
    },
    pi: { on() {}, registerTool(tool) { registered.set(tool.name, tool); } },
  });
  const edit = (old_text, new_text) => registered.get("edit").execute("call",
    { path: "file", old_text, new_text }, undefined, undefined, { cwd: "/workspace" });
  for (const [original, old, replacement, error] of [
    ["one", "one", "one", /No changes/],
    ["", "", "insert", /old_text must not be empty/],
    ["aaa", "aa", "b", /more than once/],
    ["one one", "one", "two", /more than once/],
    ["one", "missing", "two", /not found/],
  ]) {
    contents = original;
    await assert.rejects(() => edit(old, replacement), error);
    assert.equal(contents, original);
    assert.equal(writes, 0);
  }
  contents = "\uFEFFα\r\nold\r\n😀\r\n";
  assert.match((await edit("old", "$& new")).content[0].text, /Edited/);
  assert.equal(contents, "\uFEFFα\r\n$& new\r\n😀\r\n");
  assert.equal(writes, 1);
  await edit(contents, "");
  assert.equal(contents, "");
  assert.equal(writes, 2);
});
