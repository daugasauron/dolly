import assert from "node:assert/strict";
import { chromium, firefox } from "playwright-core";
import { startBrowserServer } from "./browser-server.mjs";
import { runProcessSmoke } from "./fixtures/process-smoke.mjs";

const names = process.argv.slice(2);
if (!names.length) names.push("chromium", "firefox");
if (names.some(name => !["chromium", "firefox"].includes(name))) {
  throw new Error("usage: node test/core-browser.mjs [chromium|firefox ...]");
}
const projectDir = new URL("..", import.meta.url).pathname;
const server = await startBrowserServer(projectDir);
try {
  for (const name of names) {
    const started = performance.now();
    const browser = await ({ chromium, firefox })[name].launch(name === "chromium"
      ? { channel: "chrome", headless: true, args: ["--no-sandbox", "--disable-gpu"] }
      : { headless: true });
    let expired = false;
    const deadline = setTimeout(() => { expired = true; void browser.close(); }, 120000);
    try {
      const page = await browser.newPage();
      page.setDefaultTimeout(30000);
      await page.addInitScript(origin => {
        globalThis.DOLLY_HTTP_POLICY = { maxRequests: 256,
          rules: [{ origin, pathPrefix: "/fixture/", methods: ["GET"] }] };
      }, server.origin);
      await page.goto(`${server.origin}/default/`);
      await page.waitForFunction(() => ["ready", "failed"].includes(document.documentElement.dataset.dollyStatus));
      assert.equal(await page.evaluate(() => document.documentElement.dataset.dollyStatus), "ready",
        await page.locator("#bootstrap-log").textContent());
      await page.evaluate(() => __dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "shell"));
      const submit = command => page.evaluate(text => __dolly.submit(text), command);
      await runProcessSmoke(submit, server.origin);
      for (const command of [
        "sleep 30; echo bad > /tmp/core-interrupted",
        "sleep 30 | /bin/slop -c 'echo bad > /tmp/core-interrupted'",
        "(sleep 30) | /bin/slop -c 'echo bad > /tmp/core-interrupted'",
        'echo "$(sleep 30)" "$(echo bad > /tmp/core-interrupted)"',
        'for item in "$(sleep 30)" "$(echo bad > /tmp/core-interrupted)"; do echo bad > /tmp/core-interrupted; done',
      ]) {
        await page.evaluate(text => {
          globalThis.interruptedStatus = null;
          void __dolly.submit(text).then(status => { globalThis.interruptedStatus = status; });
        }, command);
        await page.waitForFunction(() => __dolly.transport.foregroundInterruptible());
        await page.locator("#keyboard").focus();
        await page.keyboard.press("Control+c");
        await page.waitForFunction(() => globalThis.interruptedStatus !== null, null, { timeout: 5000 });
        assert.equal(await page.evaluate(() => globalThis.interruptedStatus), 130, command);
        assert.equal(await submit("test ! -e /tmp/core-interrupted"), 0, command);
      }
      assert.equal(await submit(`mkdir /tmp/core-tar; curl -fsS ${server.origin}/fixture/root.tar -o /tmp/core.tar && tar -xf /tmp/core.tar -C /tmp/core-tar && test "$(cat /tmp/core-tar/file)" = 'root preserved' && rm -rf /tmp/core-tar /tmp/core.tar`), 0);
      assert.equal(await submit("printf 'needle\\n' > /tmp/core-search; rg -q needle /tmp/core-search && test \"$(fd --max-depth 1 '^core-search$' /tmp)\" = /tmp/core-search && rm /tmp/core-search"), 0);
      assert.notEqual(await submit(`curl -fsS ${server.origin}/denied`), 0);
      assert.equal(server.requests.has("/denied"), false, "denied userspace HTTP reached the host server");
      console.log(`core: ${name} passed process, filesystem, C/C++, rg/fd and denied HTTP checks in ${((performance.now() - started) / 1000).toFixed(1)}s`);
    } catch (error) {
      if (expired) throw new Error(`${name}: core browser checks exceeded 120 seconds`, { cause: error });
      throw new Error(`${name}: ${error.message}`, { cause: error });
    } finally {
      clearTimeout(deadline);
      await browser.close();
    }
  }
} finally {
  await server.close();
}
