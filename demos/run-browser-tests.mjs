// Runs the demos' browser tests in headless Chrome, one after another:
// npm run test:demos [-- DEMO...]. A demo's tests are every *-browser.mjs in
// a test/ directory of it. DISPLAY is not passed on, so no test opens a
// window on the desktop of whoever runs this.
//
// A test that needs what such a run cannot give is not started: it is named
// below with what it needs, printed as skipped and counted, never as passed.
// Run it directly once it has that. A test that finds its own need unmet
// says "skipped: needs ..." and exits with status 77, which counts the same.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";

const window = "DISPLAY: a GPU window";
const needs = new Map([
  ["gpu-fluid/test/gpu-fluid-browser.mjs", window],
  ["llvm/test/stage2-browser.mjs", "about 50 minutes and 7 GB: it is run on demand"],
  ["mojo/target/test/mojo-target-browser.mjs", "the objects of demos/mojo/target/cross-compile.sh, which a native Mojo compiler writes"],
  ["slopyard/test/slopyard-browser.mjs", window],
  ["zero-ad/test/0ad-graphics-browser.mjs", window],
  ["zero-ad/test/0ad-menu-browser.mjs", window],
]);

const root = new URL(".", import.meta.url).pathname;
const tests = demo => !existsSync(root + demo) ? [] : readdirSync(root + demo, { recursive: true })
  .filter(path => /(?:^|\/)test\/[^/]+-browser\.mjs$/.test(path)).sort().map(path => `${demo}/${path}`);
const demos = process.argv.length > 2 ? process.argv.slice(2)
  : readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
const { DISPLAY, ...environment } = process.env;
const passed = [], skipped = [], failed = [];
for (const demo of demos) {
  const found = tests(demo);
  // A demo that was asked for by name has tests.
  if (!found.length && process.argv.length > 2) failed.push(`${demo} (no browser test)`);
  for (const test of found) {
    const status = needs.has(test) ? 77 : spawnSync(process.execPath, [root + test], { stdio: "inherit", env: environment }).status;
    if (needs.has(test)) console.log(`skipped: demos/${test} needs ${needs.get(test)}`);
    (status === 0 ? passed : status === 77 ? skipped : failed).push(test);
  }
}
console.log(`demo browser tests: ${passed.length} passed, ${skipped.length} skipped, ${failed.length} failed` +
  `${failed.length ? `: ${failed.join(" ")}` : ""}`);
process.exitCode = failed.length ? 1 : 0;
