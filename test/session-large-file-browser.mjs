// A save holds files up to its own size limit, not an image's: a session with
// a file over 2 GiB restores.
import assert from "node:assert/strict";
import { browserTest } from "./browser.mjs";

await browserTest("session large file", { image: "system", timeout: 300_000 }, async ({ server, open }) => {
  const name = `large-${Date.now()}`;
  const { page, submit, text } = await open();
  assert.equal(await submit("dd if=/dev/zero of=/workspace/large bs=1048576 count=2049 2>/dev/null && echo end >> /workspace/large"), 0, await text());
  assert.equal(await page.evaluate(name => __dolly.saveSession(name), name), name);
  await page.goto(`${server.origin}/session/?name=${name}`);
  await page.waitForFunction(() => ["ready", "failed"].includes(document.documentElement.dataset.dollyStatus), null, { timeout: 120_000 });
  assert.equal(await page.evaluate(() => document.documentElement.dataset.dollyStatus), "ready",
    await page.locator("#bootstrap-log").textContent());
  await page.evaluate(() => __dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "session shell"));
  assert.equal(await submit(`test "$(stat -c %s /workspace/large)" = ${2049 * 1048576 + 4} && test "$(tail -c 4 /workspace/large)" = end`), 0, await text());
});
