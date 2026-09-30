import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import dollyTools, { slop } from "../dolly-tools.js";

// The host stand-in for Dolly's Slop is found on PATH exactly like /bin/slop.
const root = await mkdtemp(join(tmpdir(), "dolly-pi-tools-"));
await writeFile(join(root, "slop"), '#!/bin/sh\nexec /bin/sh "$@"\n');
await chmod(join(root, "slop"), 0o755);
process.env.PATH = `${root}:${process.env.PATH}`;
test.after(() => rm(root, { recursive: true, force: true }));

const tools = new Map();
dollyTools({ on() {}, registerTool: (tool) => tools.set(tool.name, tool) });
const context = { cwd: root, sessionManager: { getSessionId: () => "test", getSessionFile() {} } };
const run = (name, input, signal) => tools.get(name).execute("call", input, signal, undefined, context);

test("Pi's Slop tool keeps upstream truncation and its full-output file", async () => {
  const result = await run("bash", { command: "seq 1 3000" });
  const [, fullOutput] = result.content[0].text.match(/\[Showing lines 1001-3000 of 3000\. Full output: (.+)\]$/);
  try {
    assert.equal(await readFile(fullOutput, "utf8"), Array.from({ length: 3000 }, (_, index) => `${index + 1}\n`).join(""));
  } finally { await rm(fullOutput); }
});

test("Pi's Slop tool reports exit status, cancellation and timeout after partial output", async () => {
  await assert.rejects(run("bash", { command: "printf partial; exit 7" }), /^Error: partial\n\nCommand exited with code 7$/);
  await assert.rejects(run("bash", { command: "printf partial; exec sleep 5" }, AbortSignal.timeout(300)),
    /^Error: partial\n\nCommand aborted$/);
  await assert.rejects(run("bash", { command: "printf partial; exec sleep 5", timeout: 0.3 }),
    /^Error: partial\n\nCommand timed out after 0.3 seconds$/);
});

test("Slop output decodes interleaved stdout and stderr scalars independently", async () => {
  let output = "";
  const command = String.raw`printf '\343'; sleep .05; printf '\360\237' >&2; sleep .05; printf '\201\202'; sleep .05; printf '\230\200' >&2`;
  const { exitCode } = await slop.exec(command, root, { onData: (data) => { output += data; } });
  assert.equal(exitCode, 0);
  assert.deepEqual([...output].sort(), ["あ", "😀"]);
});

test("Pi's edit refuses non-UTF-8 files and follows the session cwd", async () => {
  const latin1 = Buffer.from("café old\n", "latin1");
  await writeFile(join(root, "latin1.txt"), latin1);
  await assert.rejects(run("edit", { path: "latin1.txt", edits: [{ oldText: "old", newText: "new" }] }), /utf-8/i);
  assert.deepEqual(await readFile(join(root, "latin1.txt")), latin1);
  await writeFile(join(root, "text.txt"), "\uFEFFα\r\nold\r\n😀\r\n");
  await run("edit", { path: "text.txt", edits: [{ oldText: "old", newText: "$& new" }] });
  assert.equal(await readFile(join(root, "text.txt"), "utf8"), "\uFEFFα\r\n$& new\r\n😀\r\n");
});
