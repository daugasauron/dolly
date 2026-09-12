import assert from "node:assert/strict";
import { firefox } from "playwright-core";

const url = process.argv[2];
if (!url) throw new Error("usage: node test/firefox-process-io.mjs DOLLY_SHELL_URL");
const browser = await firefox.launch({ headless: true });
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(120000);
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.dollyStatus === "ready" && globalThis.__dolly);
  assert.equal(await page.evaluate(() => __dolly.graphicsActive), false, "start with a shell image");
  await page.evaluate(() => __dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "shell"));
  await page.evaluate(() => {
    globalThis.uploadStatus = null;
    void __dolly.submit("upload /tmp/process-io-stress.c").then(code => uploadStatus = code);
  });
  await page.locator("#file-upload input").setInputFiles(new URL("./fixtures/process-io-stress.c", import.meta.url).pathname);
  await page.waitForFunction(() => uploadStatus !== null);
  assert.equal(await page.evaluate(() => uploadStatus), 0);
  assert.equal(await page.evaluate(() => __dolly.submit("cc -O2 /tmp/process-io-stress.c -o /tmp/process-io-stress-bin")), 0);
  const status = await page.evaluate(() => __dolly.submit("/tmp/process-io-stress-bin"));
  const terminal = await page.evaluate(() => __dolly.visibleTerminalText());
  console.log(terminal);
  assert.equal(status, 0, terminal);
  assert.match(terminal, /80000 concurrent IO cycles passed/);
} finally {
  await browser.close();
}
