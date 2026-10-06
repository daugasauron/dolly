// A custom image that declares snapshot@0 and no http@0 has no network policy
// to inherit: it opens, saves a session and restores it.
import assert from "node:assert/strict";
import { browserTest, composed } from "./browser.mjs";

await browserTest("session without http", { timeout: 240_000 }, async ({ open }) => {
  const name = `offline-${Date.now()}`;
  const built = await open(await composed(["runtime", "display", "snapshot"], ["core", "display"]));
  assert.equal(await built.submit("echo kept > $HOME/kept"), 0, await built.text());
  await built.page.evaluate(name => __dolly.saveSession(name), name);
  assert.equal(await built.page.evaluate(() => document.documentElement.dataset.sessionStatus), "saved");
  // The saved session is in this page's browser storage: the same page loads it.
  await built.page.goto(new URL(`/session/?name=${name}`, built.page.url()).href);
  await built.page.waitForFunction(() => ["ready", "failed"].includes(document.documentElement.dataset.dollyStatus));
  assert.equal(await built.page.evaluate(() => document.documentElement.dataset.dollyStatus), "ready",
    await built.page.locator("#bootstrap-log").textContent());
  await built.page.evaluate(() => __dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "session shell"));
  assert.equal(await built.submit('test "$(cat $HOME/kept)" = kept'), 0, await built.text());
});
