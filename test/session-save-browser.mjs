// What a person meets when saving goes other than plainly: a session open in
// two tabs is not replaced by the other tab's save unasked, and a save the
// browser refuses says why and leaves the previous one to open.
import assert from "node:assert/strict";
import { browserTest } from "./browser.mjs";

async function shell(page, address) {
  await (address ? page.goto(address) : page.reload());
  await page.waitForFunction(() => ["ready", "failed"].includes(document.documentElement.dataset.dollyStatus));
  assert.equal(await page.evaluate(() => document.documentElement.dataset.dollyStatus), "ready",
    await page.locator("#bootstrap-log").textContent());
  await page.evaluate(() => __dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "session shell"));
}
const submit = (page, command) => page.evaluate(command => __dolly.submit(command), command);

await browserTest("session save", { image: "system", timeout: 240_000 }, async ({ browser, server }) => {
  const name = `save-${Date.now()}`, context = await browser.newContext();
  const asked = [], tabs = [await context.newPage(), await context.newPage()];
  for (const [index, tab] of tabs.entries()) {
    tab.setDefaultTimeout(30000);
    tab.on("dialog", dialog => { asked.push(index); void dialog.dismiss(); });
  }
  const [first, second] = tabs;
  await shell(first, `${server.origin}/system/`);
  assert.equal(await submit(first, "echo first > /workspace/first"), 0);
  assert.equal(await first.evaluate(name => __dolly.saveSession(name), name), name);

  // The same session in a second tab: its save goes in unasked, the first
  // tab's then asks, and a refusal keeps the second tab's.
  await shell(second, `${server.origin}/session/?name=${name}`);
  assert.equal(await submit(second, "echo second > /workspace/second"), 0);
  assert.equal(await second.evaluate(() => __dolly.saveSession()), name);
  assert.equal(await first.evaluate(() => __dolly.saveSession()), null);
  assert.deepEqual(asked, [0]);
  await shell(first);
  assert.equal(await submit(first, "test -e /workspace/second"), 0);

  // The browser's store is full: the save fails with a reason, and the previous one is whole.
  await first.evaluate(() => {
    IDBObjectStore.prototype.put = function () { throw new DOMException("", "QuotaExceededError"); };
  });
  assert.equal(await submit(first, "echo third > /workspace/third"), 0);
  await assert.rejects(first.evaluate(() => __dolly.saveSession()));
  assert.equal(await first.evaluate(() => document.documentElement.dataset.sessionStatus), "failed");
  const reason = await first.locator("#session-status").textContent();
  assert.ok(reason.length > "Save failed: QuotaExceededError".length, reason);
  await shell(first);
  assert.equal(await submit(first, "test -e /workspace/second && test ! -e /workspace/third"), 0);
});
