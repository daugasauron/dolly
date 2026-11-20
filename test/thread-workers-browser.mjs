// Threads started and ended in turn, each a Worker: fifteen processes of 200, in Chrome or the
// installed Firefox on the private X display DISPLAY names. In Firefox 159 a Worker's new Worker()
// could wait for good while Workers it made ended, after a thousand threads or so
// (tasks/20261117-122407-godot-firefox-start). Then, on Linux, once more with the browser's data
// limited to 6 GiB (prlimit), as Chrome's sandbox limits a renderer's on a machine of about that
// much memory: a threaded program gets what the browser commits, and its threads start
// (tasks/20261120-091037-photocraft-thread-eagain).
//   node test/thread-workers-browser.mjs chromium|firefox
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright-core";
import { launchInstalledFirefox, putFixture } from "./browser.mjs";
import { startBrowserServer } from "./browser-server.mjs";

const [name = "chromium", limited] = process.argv.slice(2);
assert.ok(["chromium", "firefox"].includes(name));
const server = await startBrowserServer(new URL("..", import.meta.url).pathname, "system");
const browser = name === "firefox" ? await launchInstalledFirefox({ "dom.webgpu.enabled": false })
  : await chromium.launch({ channel: "chrome", headless: false, args: ["--no-sandbox", "--ozone-platform=x11"] });
const deadline = setTimeout(() => void browser.close(), 300_000);
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(0);
  await page.goto(`${server.origin}/system/`);
  await page.waitForFunction(() => window.__dolly?.waitForInteractiveTerminal, null, { polling: 250 });
  await page.evaluate(() => __dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "shell"));
  const submit = command => page.evaluate(text => __dolly.submit(text), command);
  const screen = () => page.evaluate(() => __dolly.visibleTerminalText());
  await putFixture(submit, "/tmp/churn.c", "test/fixtures/thread-churn.c");
  assert.equal(await submit("cc -O1 -pthread /tmp/churn.c -o /tmp/churn"), 0, await screen());
  const started = performance.now(), runs = limited ? 1 : 15;
  for (let run = 0; run < runs; run++) assert.equal(await submit("/tmp/churn 100"), 0, await screen());
  assert.match(await screen(), /^200 threads started and ended$/m);
  console.log(`thread workers: ${name}${limited ? " with 6 GiB of data" : ""} passed, ${runs * 200} threads in ` +
    `${((performance.now() - started) / 1000).toFixed(1)}s`);
} finally {
  clearTimeout(deadline);
  await browser.close();
  await server.close();
}
if (!limited && process.platform === "linux") {
  execFileSync("prlimit", [`--data=${6 * 2 ** 30}`, process.execPath, process.argv[1], name, "limited"], { stdio: "inherit" });
}
