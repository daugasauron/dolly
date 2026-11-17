// Runs every core browser test (test/*-browser.mjs) and reports the failures;
// arguments (chromium, firefox) pass through to each test.
//   node test/browser-tests.mjs --display=:N [--lock=FILE] [chromium|firefox ...]
// runs instead the tests that need a hardware adapter in a window (docs/gpu.md),
// once per browser (both by default), one after another on the X display :N,
// each under flock(1) on FILE when given, so that nothing else uses the GPU.
import { readdirSync } from "node:fs";
import { runSideBySide } from "./side-by-side.mjs";

// A file keeps two cores busy and holds 1 to 3 GB. Measured on 16 cores beside
// a catalog build (2026-10-13): four side by side take 40% of the time of one
// after another. Six and eight take 10% and 16% less again and stretch every
// test by 23% and 38%; at eight the microphone test lost blocks of its recording.
const limit = 4;
// fs-growth fills 8 GiB of kernel memory and times its appends; session-large-file holds a file over 2 GiB.
const alone = ["fs-growth-browser.mjs", "session-large-file-browser.mjs"];
const hardware = ["gpu-render-browser.mjs", "gpu-explicit-browser.mjs", "pointer-browser.mjs"];

const started = performance.now();
const options = Object.fromEntries(process.argv.slice(2).filter(word => word.startsWith("--"))
  .map(word => word.slice(2).split("=")));
const browsers = process.argv.slice(2).filter(word => !word.startsWith("--"));
const path = name => `${import.meta.dirname}/${name}`;
const failed = [];
if (options.display) {
  const env = { ...process.env, DISPLAY: options.display }, prefix = options.lock ? ["flock", options.lock] : [];
  for (const browser of browsers.length ? browsers : ["chromium", "firefox"]) {
    const statuses = await runSideBySide(hardware.map(path), { limit: 1, alone: hardware.map(path), arguments: [browser], env, prefix });
    failed.push(...hardware.filter((name, index) => statuses[index] !== 0).map(name => `${name} ${browser}`));
  }
} else {
  const names = readdirSync(import.meta.dirname)
    .filter(name => name.endsWith("-browser.mjs") && !hardware.includes(name)).sort();
  for (const name of hardware) console.log(`skipped: test/${name} needs a hardware adapter in a window: run with --display`);
  const statuses = await runSideBySide(names.map(path), { limit, alone: alone.map(path), arguments: browsers });
  failed.push(...names.filter((name, index) => statuses[index] !== 0));
}
console.log(`browser tests${options.display ? ` on ${options.display}` : ""}: ` +
  `${failed.length ? `FAILED ${failed.join(", ")}` : "all passed"} in ${((performance.now() - started) / 1000).toFixed(0)}s`);
process.exitCode = failed.length ? 1 : 0;
