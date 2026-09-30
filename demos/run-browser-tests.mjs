// Runs demo browser tests, demos/DEMO/test/DEMO-browser.mjs, one after another
// in headless Chrome: npm run test:demos [-- DEMO...]. Tests that need a GPU
// window skip here; run them directly with a DISPLAY.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";

const test = demo => new URL(`${demo}/test/${demo}-browser.mjs`, import.meta.url).pathname;
const demos = process.argv.length > 2 ? process.argv.slice(2)
  : readdirSync(new URL(".", import.meta.url)).filter(demo => existsSync(test(demo))).sort();
const { DISPLAY, ...environment } = process.env;
const failed = demos.filter(demo => spawnSync(process.execPath, [test(demo)], { stdio: "inherit", env: environment }).status !== 0);
if (failed.length) {
  console.error(`demo browser tests failed: ${failed.join(" ")}`);
  process.exit(1);
}
