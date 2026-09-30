// Runs every core browser test (test/*-browser.mjs) in sequence and reports the
// failures; arguments (chromium, firefox) pass through to each test. The GPU
// render test needs a hardware adapter: DISPLAY=:1 node test/gpu-render-browser.mjs.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";

const started = performance.now();
const failed = readdirSync(import.meta.dirname)
  .filter(name => name.endsWith("-browser.mjs") && name !== "gpu-render-browser.mjs").sort()
  .filter(name => spawnSync(process.execPath, [`${import.meta.dirname}/${name}`, ...process.argv.slice(2)],
    { stdio: "inherit" }).status !== 0);
console.log(`browser tests: ${failed.length ? `FAILED ${failed.join(", ")}` : "all passed"} in ` +
  `${((performance.now() - started) / 1000).toFixed(0)}s`);
process.exitCode = failed.length ? 1 : 0;
