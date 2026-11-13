// What a person meets when saving goes other than plainly: a session open in
// two tabs is not replaced by the other tab's save unasked, the sessions page
// renames a save, and a save the browser refuses says why and leaves the
// previous one to open.
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
  // Each tab's dialogs are counted and dismissed, or given the answer set for them.
  const asked = [], answers = [], tabs = [await context.newPage(), await context.newPage()];
  for (const [index, tab] of tabs.entries()) {
    tab.setDefaultTimeout(30000);
    tab.on("dialog", dialog => { asked.push(index); void (answers[index] === undefined ? dialog.dismiss() : dialog.accept(answers[index])); });
  }
  const [first, second] = tabs;
  await shell(first, `${server.origin}/system/`);
  assert.equal(await submit(first, "echo first > /workspace/first"), 0);
  assert.equal(await first.evaluate(name => __dolly.saveSession(name), name), name);
  // The save names the image build, which a rebuilt kernel keeps, so it opens on that kernel too.
  assert.equal(await first.evaluate(async name => (await (await import("/src/session-store.mjs")).loadStoredSession(name)).buildId ===
    (await import("/dist/dolly-image-build-id.mjs")).DOLLY_IMAGE_BUILD_ID, name), true);

  // The same session in a second tab: its save goes in unasked, the first
  // tab's then asks, and a refusal keeps the second tab's.
  await shell(second, `${server.origin}/session/?name=${name}`);
  assert.equal(await submit(second, "echo second > /workspace/second"), 0);
  assert.equal(await second.evaluate(() => __dolly.saveSession()), name);
  assert.equal(await first.evaluate(() => __dolly.saveSession()), null);
  assert.deepEqual(asked, [0]);
  await shell(first);
  assert.equal(await submit(first, "test -e /workspace/second"), 0);

  // The sessions page renames a save: it opens under the new name alone, and a taken name is refused.
  const other = `${name}-other`, renamed = `${name}-renamed`;
  assert.equal(await second.evaluate(other => __dolly.saveSession(other), other), other);
  await second.goto(`${server.origin}/sessions/`);
  const row = text => second.locator("#sessions li").filter({ has: second.getByText(text, { exact: true }) });
  for (const [answer, names] of [[other, [name, other]], [renamed, [other, renamed]]]) {
    answers[1] = answer;
    await row(name).getByRole("button", { name: "Rename" }).click();
    await second.waitForFunction(() => !document.querySelector("#import-session").disabled);
    assert.deepEqual(await second.locator("#sessions li > :first-child").allTextContents(), names);
  }
  await shell(second, new URL(await row(renamed).locator("a").getAttribute("href"), second.url()).href);
  assert.equal(await submit(second, "test -e /workspace/second"), 0);
  await second.goto(`${server.origin}/session/?name=${name}`);
  await second.waitForFunction(() => document.documentElement.dataset.dollyStatus === "failed");
  // The first tab still names the save it opened; saving there makes it again.
  assert.equal(await first.evaluate(() => __dolly.saveSession()), name);

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
