// Runs the demos' browser tests in headless Chrome: npm run test:demos
// [-- DEMO...]. A demo's tests are every *-browser.mjs in a test/ directory of
// it. DISPLAY is not passed on, so no test opens a window on the desktop of
// whoever runs this.
//
//   node demos/run-browser-tests.mjs --display=:N [--lock=FILE] [DEMO...]
// runs instead the tests that need a GPU window, those of `display` below, one
// after another on the X display :N, each under flock(1) on FILE when given, so
// that nothing else uses the GPU while it runs.
//
// The tests of the demos named in `together` run `limit` side by side, the
// longest first, since the run is as long as its longest test; they were
// measured so. Every other test runs alone, after them.
//
// A test that needs what such a run cannot give is not started: it is named
// below with what it needs, printed as skipped and counted, never as passed.
// A test that finds its own need unmet says "skipped: needs ..." and exits
// with status 77, which counts the same.
import { existsSync, readdirSync } from "node:fs";
import { runSideBySide } from "../test/side-by-side.mjs";

const limit = 4;
// classicube compares the game's pixels and failed one of four runs beside three others.
const together = ["python", "rts", "pi", "closed-source-agent", "codex", "javascript", "cmake", "tmux", "emacs", "neovim", "sdl2"];
const both = "a GPU window on a hardware adapter, in Chrome and the installed Firefox";
const display = new Map([
  ["deep-hedger/test/deep-hedger-browser.mjs", both],
  ["godot/test/godot-airtime-browser.mjs", both],
  ["godot/test/godot-flyover-browser.mjs", both],
  ["godot/test/godot-flyover-touch-browser.mjs", both],
  ["godot/test/godot-gpu-browser.mjs", both],
  ["godot/test/godot-projects-browser.mjs", both],
  ["godot/test/godot-x11-browser.mjs", both],
  ["local-llm/test/local-llm-browser.mjs", both],
  ["mojo/test/mojo-browser.mjs", both],
  ["photocraft/test/photocraft-gpu-browser.mjs", both],
  ["photocraft/test/photocraft-x11-browser.mjs", both],
  ["photocraft/test/photocraft-touch-browser.mjs", "a GPU window on a hardware adapter, in Chrome"],
  ["slopyard/test/slopyard-browser.mjs", "a GPU window"],
  ["xonotic/test/xonotic-browser.mjs", "a GPU window in Chrome"],
  ["zero-ad/test/0ad-graphics-browser.mjs", "a GPU window"],
  ["zero-ad/test/0ad-menu-browser.mjs", "a GPU window"],
]);
// Display tests that also run here, on their software path alone.
const withoutDisplayToo = ["xonotic/test/xonotic-browser.mjs"];
const onDemand = new Map([
  ["zero-ad/test/0ad-large-match-browser.mjs", "a GPU window for thirty minutes: it is run on demand"],
]);

const options = Object.fromEntries(process.argv.slice(2).filter(word => word.startsWith("--"))
  .map(word => word.slice(2).split("=")));
const named = process.argv.slice(2).filter(word => !word.startsWith("--"));
const root = new URL(".", import.meta.url).pathname;
const tests = demo => !existsSync(root + demo) ? [] : readdirSync(root + demo, { recursive: true })
  .filter(path => /(?:^|\/)test\/[^/]+-browser\.mjs$/.test(path)).sort().map(path => `${demo}/${path}`);
const place = demo => together.includes(demo) ? together.indexOf(demo) : together.length;
const demos = (named.length ? named
  : readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort())
  .sort((left, right) => place(left) - place(right));
const { DISPLAY, ...environment } = process.env;
const passed = [], skipped = [], failed = [], started = [];
for (const demo of demos) {
  const found = tests(demo);
  // A demo that was asked for by name has tests.
  if (!found.length && named.length && !options.display) failed.push(`${demo} (no browser test)`);
  for (const test of found) {
    if (options.display ? display.has(test) : !onDemand.has(test) && (!display.has(test) || withoutDisplayToo.includes(test))) {
      started.push(test);
      continue;
    }
    if (options.display) continue;
    console.log(`skipped: demos/${test} needs ${onDemand.get(test) ?? `${display.get(test)}: run with --display`}`);
    skipped.push(test);
  }
}
const statuses = await runSideBySide(started.map(test => root + test), options.display
  ? { limit: 1, alone: started.map(test => root + test), env: { ...environment, DISPLAY: options.display },
    prefix: options.lock ? ["flock", options.lock] : [] }
  : { limit, alone: started.filter(test => place(test.split("/")[0]) === together.length).map(test => root + test), env: environment });
for (const [index, test] of started.entries()) (statuses[index] === 0 ? passed : statuses[index] === 77 ? skipped : failed).push(test);
console.log(`demo browser tests${options.display ? ` on ${options.display}` : ""}: ${passed.length} passed, ` +
  `${skipped.length} skipped, ${failed.length} failed${failed.length ? `: ${failed.join(" ")}` : ""}`);
process.exitCode = failed.length ? 1 : 0;
