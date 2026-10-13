// Runs the demos' browser tests in headless Chrome: npm run test:demos
// [-- DEMO...]. A demo's tests are every *-browser.mjs in a test/ directory of
// it. DISPLAY is not passed on, so no test opens a window on the desktop of
// whoever runs this.
//
// The tests of the demos named in `together` run `limit` side by side, the
// longest first, since the run is as long as its longest test; they were
// measured so. Every other test runs alone, after them.
//
// A test that needs what such a run cannot give is not started: it is named
// below with what it needs, printed as skipped and counted, never as passed.
// Run it directly once it has that. A test that finds its own need unmet
// says "skipped: needs ..." and exits with status 77, which counts the same.
import { existsSync, readdirSync } from "node:fs";
import { runSideBySide } from "../test/side-by-side.mjs";

const limit = 4;
const together = ["python", "classicube", "rts", "bhop", "pi", "closed-source-agent", "codex", "javascript", "cmake", "tmux", "emacs", "neovim", "sdl2"];
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
const place = demo => together.includes(demo) ? together.indexOf(demo) : together.length;
const demos = (process.argv.length > 2 ? process.argv.slice(2)
  : readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort())
  .sort((left, right) => place(left) - place(right));
const { DISPLAY, ...environment } = process.env;
const passed = [], skipped = [], failed = [], started = [];
for (const demo of demos) {
  const found = tests(demo);
  // A demo that was asked for by name has tests.
  if (!found.length && process.argv.length > 2) failed.push(`${demo} (no browser test)`);
  for (const test of found) {
    if (!needs.has(test)) { started.push(test); continue; }
    console.log(`skipped: demos/${test} needs ${needs.get(test)}`);
    skipped.push(test);
  }
}
const statuses = await runSideBySide(started.map(test => root + test),
  { limit, alone: started.filter(test => place(test.split("/")[0]) === together.length).map(test => root + test), env: environment });
for (const [index, test] of started.entries()) (statuses[index] === 0 ? passed : statuses[index] === 77 ? skipped : failed).push(test);
console.log(`demo browser tests: ${passed.length} passed, ${skipped.length} skipped, ${failed.length} failed` +
  `${failed.length ? `: ${failed.join(" ")}` : ""}`);
process.exitCode = failed.length ? 1 : 0;
