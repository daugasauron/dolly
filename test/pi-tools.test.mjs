import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
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
