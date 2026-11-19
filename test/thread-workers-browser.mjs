// Threads started and ended in turn, each a Worker: fifteen processes of 200, in Chrome or the
// installed Firefox on the private X display DISPLAY names. In Firefox 159 a Worker's new Worker()
// could wait for good while Workers it made ended, after a thousand threads or so
// (tasks/20261117-122407-godot-firefox-start).
//   node test/thread-workers-browser.mjs chromium|firefox
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { launchInstalledFirefox, putFixture } from "./browser.mjs";
import { startBrowserServer } from "./browser-server.mjs";

const name = process.argv[2] ?? "chromium";
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
  const started = performance.now();
  for (let run = 0; run < 15; run++) assert.equal(await submit("/tmp/churn 100"), 0, await screen());
  assert.match(await screen(), /^200 threads started and ended$/m);
  console.log(`thread workers: ${name} passed, 3000 threads in ${((performance.now() - started) / 1000).toFixed(1)}s`);
} finally {
  clearTimeout(deadline);
  await browser.close();
  await server.close();
}
