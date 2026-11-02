// A Worker the supervisor ends runs the program no further: a thread exits
// the process while the main thread joins it from a destructor, twenty times
// in a row, and the browser's processes keep about as many memory mappings as
// before. Before, the main thread's ended call came back as an exception that
// the destructor turned into abort, exit and a call again, each round deeper:
// Lean's compiles nested 508 fresh stacks that way, each left reserved by V8
// when the Worker ended, and the renderer died at Linux's vm.max_map_count
// (tasks/20261101-102515-retained-process-memory).
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { browserTest, composed } from "./browser.mjs";

const source = await readFile(new URL("fixtures/ended-worker.cpp", import.meta.url), "utf8");
const rounds = 20;
// A run left about 500 behind; Workers starting and ending move the count by tens.
const mappingsBound = 50 * rounds;

// Memory mappings of this process's descendants: the browser Playwright
// started under node, its renderers and their Workers.
function mappings() {
  const children = new Map();
  for (const name of readdirSync("/proc")) {
    if (!/^\d+$/.test(name)) continue;
    try {
      const parent = Number(readFileSync(`/proc/${name}/stat`, "utf8").split(") ").at(-1).split(" ")[1]);
      children.set(parent, [...children.get(parent) ?? [], Number(name)]);
    } catch { /* The process ended while the table was read. */ }
  }
  let count = 0;
  for (const pending = [process.pid]; pending.length;) {
    const pid = pending.pop();
    pending.push(...children.get(pid) ?? []);
    try { count += readFileSync(`/proc/${pid}/maps`, "utf8").split("\n").length - 1; } catch { /* Ended since. */ }
  }
  return count;
}

const settle = () => new Promise(resolve => setTimeout(resolve, 2500));

await browserTest("ended worker", { image: "system", timeout: 300_000 }, async ({ name, open }) => {
  const { submit, text } = await open(await composed(["stack"], ["stack-wrap"], { base: "system" }));
  const run = async command => assert.equal(await submit(command), 0, `${command}\n${await text()}`);
  await run(`printf '%s\\n' ${source.split("\n").map(line => `'${line.replaceAll("'", "'\\''")}'`).join(" ")} > /tmp/ended.cpp && ` +
    "c++ -O1 -pthread /tmp/ended.cpp -o /tmp/plain && stack-wrap /tmp/plain -o /tmp/ended && /tmp/ended");
  await settle();
  const before = mappings();
  for (let round = 0; round < rounds; ++round) await run("/tmp/ended");
  await settle();
  const after = mappings();
  console.log(`ended worker (${name}): ${before} mappings before ${rounds} runs, ${after} after`);
  assert.ok(after - before < mappingsBound, `${after - before} mappings left by ${rounds} runs`);
});
