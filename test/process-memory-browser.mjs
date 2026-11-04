// A process's memory goes when the process ends: twenty processes of 512 MiB
// in a row, with and without a thread, ending as their threads start or as
// they wait on a condition variable, and a
// build of thirty-two compiler processes leave the browser where it started,
// without waiting for a collector (tasks/20261101-102515-retained-process-memory).
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { browserTest } from "./browser.mjs";

const source = await readFile(new URL("fixtures/process-touch.c", import.meta.url), "utf8");
const mebibyte = 1024 * 1024;
const rounds = 20;
// Less than one dead process of 512 MiB would add.
const retainedBound = 256 * mebibyte;
// Four compilers at a time on <regex>, each some hundred MiB; a dead one kept would add as much.
const buildBound = 4 * 700 * mebibyte;

// Anonymous resident memory of this process's descendants: the browser that
// Playwright started under node, its renderers and their Workers.
function residentAnonymous() {
  const children = new Map();
  for (const name of readdirSync("/proc")) {
    if (!/^\d+$/.test(name)) continue;
    try {
      const parent = Number(readFileSync(`/proc/${name}/stat`, "utf8").split(") ").at(-1).split(" ")[1]);
      children.set(parent, [...children.get(parent) ?? [], Number(name)]);
    } catch { /* The process ended while the table was read. */ }
  }
  let bytes = 0;
  for (const pending = [process.pid]; pending.length;) {
    const pid = pending.pop();
    pending.push(...children.get(pid) ?? []);
    try {
      bytes += Number(/^RssAnon:\s+(\d+) kB/m.exec(readFileSync(`/proc/${pid}/status`, "utf8"))?.[1] ?? 0) * 1024;
    } catch { /* Ended since. */ }
  }
  return bytes;
}

const settle = () => new Promise(resolve => setTimeout(resolve, 2000));
const inMebibytes = bytes => Math.round(bytes / mebibyte);
// A Worker's teardown follows the shell's prompt by some milliseconds, more on
// a loaded machine: a sample has a second to come within the bound. A memory
// kept for a collection does not.
async function settledSample(baseline) {
  for (const deadline = performance.now() + 1000; ; await new Promise(resolve => setTimeout(resolve, 50))) {
    const sample = residentAnonymous();
    if (sample - baseline < retainedBound || performance.now() > deadline) return sample;
  }
}

await browserTest("process memory", { image: "system", timeout: 600_000 }, async ({ name, open }) => {
  const { submit, text } = await open();
  const run = async command => assert.equal(await submit(command), 0, `${command}\n${await text()}`);
  await run(`printf '%s\\n' ${source.split("\n").map(line => `'${line.replaceAll("'", "'\\''")}'`).join(" ")} > /tmp/touch.c && ` +
    "cc -O1 -pthread /tmp/touch.c -o /tmp/touch");
  // Thirty-two translation units heavy enough for a compiler to hold some hundred MiB.
  await run("mkdir /tmp/build && cd /tmp/build && printf 'all:' > Makefile && for i in $(seq 32); do " +
    "printf '#include <regex>\\n#include <map>\\n#include <vector>\\nint f%s(const char *s) { std::map<int, std::vector<int>> m; " +
    "m[%s].push_back(%s); return std::regex_search(s, std::regex(\"a+b*\")) + m.size(); }\\n' $i $i $i > f$i.cpp && " +
    "printf ' f%s.o' $i >> Makefile; done && echo >> Makefile");
  const failures = [];
  for (const variant of ["", " thread", " spawn", " idle"]) {
    const command = `/tmp/touch 512${variant}`;
    await run(command);
    await settle();
    const baseline = residentAnonymous();
    const samples = [];
    for (let round = 0; round < rounds; ++round) {
      await run(command);
      samples.push(await settledSample(baseline));
    }
    await settle();
    const after = residentAnonymous();
    const peak = Math.max(...samples);
    console.log(`process memory (${name}, ${command}): baseline ${inMebibytes(baseline)} MiB, after each run ` +
      `${samples.map(inMebibytes).join(" ")}, two seconds after the last ${inMebibytes(after)} MiB`);
    if (peak - baseline >= retainedBound) failures.push(`${inMebibytes(peak - baseline)} MiB over the baseline after a run of ${command}`);
    if (after - baseline >= retainedBound) failures.push(`${inMebibytes(after - baseline)} MiB over the baseline two seconds after the last ${command}`);
  }
  // A build: thirty-two compilers, four at a time, sampled while they run.
  await run("cd /tmp/build && make -j4 CXX=c++ CXXFLAGS=-O1 f1.o && rm f1.o");
  await settle();
  const baseline = residentAnonymous();
  const samples = [];
  const sampler = setInterval(() => samples.push(residentAnonymous()), 250);
  const started = performance.now();
  try { await run("cd /tmp/build && make -j4 CXX=c++ CXXFLAGS=-O1 && test $(ls *.o | wc -l) -eq 32"); } finally { clearInterval(sampler); }
  const elapsed = Math.round(performance.now() - started);
  await settle();
  const after = residentAnonymous();
  const peak = Math.max(...samples);
  console.log(`process memory (${name}, make -j4 of 32 files in ${elapsed} ms): baseline ${inMebibytes(baseline)} MiB, ` +
    `peak ${inMebibytes(peak)} MiB, two seconds after ${inMebibytes(after)} MiB`);
  if (peak - baseline >= buildBound) failures.push(`${inMebibytes(peak - baseline)} MiB over the baseline during make -j4`);
  if (after - baseline >= retainedBound) failures.push(`${inMebibytes(after - baseline)} MiB over the baseline two seconds after make -j4`);
  // Four distinct 96 MB executables in turn, of which the cache holds two: the
  // module the cache lets go goes too.
  const compilers = ["/usr/libexec/dolly/process-bin/compiler", "/tmp/compiler2", "/tmp/compiler3", "/tmp/compiler4"];
  await run(`for n in 2 3 4; do cp ${compilers[0]} /tmp/compiler$n && printf '\\000\\003\\002x'$n >> /tmp/compiler$n; done`);
  const launch = program => run(`${program} --dolly-toolchain-mode=c --version > /dev/null`);
  for (const program of compilers) await launch(program);
  await settle();
  const cached = residentAnonymous();
  const launches = [];
  for (const program of [...compilers, ...compilers]) {
    await launch(program);
    launches.push(await settledSample(cached));
  }
  console.log(`process memory (${name}, four compilers in turn): baseline ${inMebibytes(cached)} MiB, after each ` +
    `${launches.map(inMebibytes).join(" ")}`);
  if (Math.max(...launches) - cached >= retainedBound) {
    failures.push(`${inMebibytes(Math.max(...launches) - cached)} MiB over the baseline after a compiler the cache let go`);
  }
  assert.deepEqual(failures, [], "dead processes stayed resident");
});
