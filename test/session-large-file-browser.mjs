// A save holds files up to its own size limit, not an image's: a session with
// a file over 2 GiB restores, and Recover files takes it.
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

  // Recover files takes the same save, as one of another build has no other way in.
  await page.evaluate(async name => {
    const store = await import("/src/session-store.mjs");
    await store.saveStoredSession({ ...await store.loadStoredSession(name), name: `${name}-old`, buildId: "another-build" });
  }, name);
  await page.goto(`${server.origin}/session/?name=${name}-old&recover=1`);
  await page.waitForFunction(() => ["ready", "failed"].includes(document.documentElement.dataset.dollyStatus), null, { timeout: 120_000 });
  assert.equal(await page.evaluate(() => document.documentElement.dataset.dollyStatus), "ready",
    await page.locator("#bootstrap-log").textContent());
  await page.evaluate(() => __dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "recovery shell"));
  assert.equal(await submit(`cd /workspace/recovered-${name}-old/workspace && test "$(stat -c %s large)" = ${2049 * 1048576 + 4} && ` +
    'test "$(tail -c 4 large)" = end && test ! -e /workspace/large'), 0, await text());
});
