// A tab whose session was saved or restored asks before it is left with
// changes no save holds, and only then: the kernel counts what processes
// change in the filesystem since the last capture (snapshot@0's changes word).
import assert from "node:assert/strict";
import { browserTest } from "./browser.mjs";

// Whether the page would ask: what its beforeunload listeners decide.
const asks = page => page.evaluate(() => !dispatchEvent(new Event("beforeunload", { cancelable: true })));
async function settles(page, expected, why) {
  await page.waitForFunction(expected => !dispatchEvent(new Event("beforeunload", { cancelable: true })) === expected, expected)
    .catch(() => assert.fail(why));
}

async function shell(page, address) {
  page.setDefaultTimeout(30000);
  await page.goto(address);
  await page.waitForFunction(() => ["ready", "failed"].includes(document.documentElement.dataset.dollyStatus));
  assert.equal(await page.evaluate(() => document.documentElement.dataset.dollyStatus), "ready",
    await page.locator("#bootstrap-log").textContent());
  await page.evaluate(() => __dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "session shell"));
  return command => page.evaluate(command => __dolly.submit(command), command);
}

await browserTest("session unsaved", { image: "system", timeout: 240_000 }, async ({ browser, server }) => {
  // A page of a context of its own: closing the one a browser makes for a page asks nothing.
  const name = `unsaved-${Date.now()}`, context = await browser.newContext(), page = await context.newPage();
  const submit = await shell(page, `${server.origin}/system/`);
  const prompts = [];
  page.on("dialog", dialog => { prompts.push(dialog.type()); void dialog.dismiss(); });

  // A tab that was never saved has nothing a reload would bring back: it does not ask.
  assert.equal(await submit("echo a > /workspace/a"), 0);
  await page.waitForTimeout(500);
  assert.equal(await asks(page), false);

  // After a save nothing is unsaved, and a program that only reads leaves it so
  // (a line typed at the shell goes into its history, a file).
  assert.equal(await submit("echo 'sleep 8; cat /etc/dolly/image' > /tmp/read.sh; slop /tmp/read.sh &"), 0);
  assert.equal(await page.evaluate(name => __dolly.saveSession(name), name), name);
  await settles(page, false, "the page asks after a save");
  await page.evaluate(async () => {
    while (!/\$ system/.test(await __dolly.visibleTerminalText())) await new Promise(resolve => setTimeout(resolve, 100));
  });
  await page.waitForTimeout(500);
  assert.equal(await asks(page), false);

  // A changed file is unsaved: the browser's own prompt, which keeps the tab when dismissed.
  assert.equal(await submit("echo b > /workspace/b"), 0);
  await settles(page, true, "the page does not ask after a file changed");
  const asked = page.waitForEvent("dialog");
  await page.close({ runBeforeUnload: true });
  await asked;
  assert.deepEqual([prompts, page.isClosed()], [["beforeunload"], false]);

  // Saved again, the tab closes without a word.
  assert.equal(await page.evaluate(() => __dolly.saveSession()), name);
  await settles(page, false, "the page asks after the second save");
  const closed = page.waitForEvent("close");
  await page.close({ runBeforeUnload: true });
  await closed;
  assert.equal(prompts.length, 1);

  // A restored session is as its save until a program changes a file.
  const restored = await context.newPage(), again = await shell(restored, `${server.origin}/session/?name=${name}`);
  await restored.waitForTimeout(500);
  assert.equal(await asks(restored), false);
  assert.equal(await again("test -e /workspace/b && rm /workspace/a"), 0);
  await settles(restored, true, "the page does not ask after a file was removed");
});
