import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { startBrowserServer } from "../../../test/browser-server.mjs";
import { imageFile } from "./fixtures/image-file.mjs";

const server = await startBrowserServer(new URL("../../../", import.meta.url).pathname,
  "default", { fixtures: { "openal.wasm": await imageFile("zero-ad-deps", "/usr/libexec/zero-ad/openal-check", "openal-check.wasm") } });
let browser, deadline, page;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true,
    args: ["--no-sandbox", "--disable-gpu"] });
  deadline = setTimeout(() => void browser.close(), 120000);
  page = await browser.newPage();
  page.on("pageerror", error => console.error(error.message));
  await page.addInitScript(origin => {
    globalThis.DOLLY_HTTP_POLICY = { maxRequests: 4,
      rules: [{ origin, pathPrefix: "/fixture/", methods: ["GET"] }] };
  }, server.origin);
  await page.goto(`${server.origin}/default/`);
  await page.waitForFunction(() => ["ready", "failed"].includes(document.documentElement.dataset.dollyStatus));
  assert.equal(await page.evaluate(() => document.documentElement.dataset.dollyStatus), "ready",
    await page.locator("#bootstrap-log").textContent());
  await page.evaluate(() => __dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "shell"));
  const submit = command => page.evaluate(text => __dolly.submit(text), command);
  assert.equal(await submit(`curl -fsS ${server.origin}/fixture/openal.wasm -o /tmp/openal`), 0);
  for (let run = 0; run < 2; run++) {
    const started = performance.now();
    assert.equal(await submit("/tmp/openal"), 0);
    console.log(`OpenAL wasm64 browser run ${run + 1}: ${Math.round(performance.now() - started)} ms`);
  }
  assert.equal(await submit("printf 'shell survived\\n' > /tmp/openal-result && test -s /tmp/openal-result"), 0);
  console.log(await page.evaluate(() => __dolly.visibleTerminalText()));
} catch (error) {
  if (page && !page.isClosed()) {
    console.error(await page.locator("#bootstrap-log").textContent().catch(() => ""));
    console.error(await page.evaluate(() => __dolly.visibleTerminalText()).catch(() => ""));
  }
  throw error;
} finally {
  clearTimeout(deadline);
  await browser?.close();
  await server.close();
}
