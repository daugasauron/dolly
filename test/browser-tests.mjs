// Runs every core browser test (test/*-browser.mjs) and reports the failures;
// arguments (chromium, firefox) pass through to each test. The GPU render test
// needs a hardware adapter: DISPLAY=:1 node test/gpu-render-browser.mjs.
import { readdirSync } from "node:fs";
import { runSideBySide } from "./side-by-side.mjs";

// A file keeps two cores busy and holds 1 to 3 GB. Measured on 16 cores beside
// a catalog build (2026-10-13): four side by side take 40% of the time of one
// after another. Six and eight take 10% and 16% less again and stretch every
// test by 23% and 38%; at eight the microphone test lost blocks of its recording.
const limit = 4;
// fs-growth fills 8 GiB of kernel memory and times its appends.
const alone = ["fs-growth-browser.mjs"];

const started = performance.now();
const names = readdirSync(import.meta.dirname)
  .filter(name => name.endsWith("-browser.mjs") && name !== "gpu-render-browser.mjs").sort();
const path = name => `${import.meta.dirname}/${name}`;
const statuses = await runSideBySide(names.map(path), { limit, alone: alone.map(path), arguments: process.argv.slice(2) });
const failed = names.filter((name, index) => statuses[index] !== 0);
console.log(`browser tests: ${failed.length ? `FAILED ${failed.join(", ")}` : "all passed"} in ` +
  `${((performance.now() - started) / 1000).toFixed(0)}s`);
process.exitCode = failed.length ? 1 : 0;
