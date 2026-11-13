// A saved session opens without a network: the save keeps the site's runtime in
// the browser (src/offline.mjs), and once the server answers nothing its page,
// the runtime and the files all come from there. A page that was not kept fails.
import assert from "node:assert/strict";
import { browserTest } from "./browser.mjs";

let down = false;
const server = { handle(request) { if (down) request.socket.destroy(); return down; } };
await browserTest("session offline", { image: "system", timeout: 240_000, server }, async ({ server, open }) => {
  const name = `offline-${Date.now()}`;
  const { page, submit, text } = await open();
  assert.equal(await submit("echo kept > /workspace/kept"), 0, await text());
  assert.equal(await page.evaluate(name => __dolly.saveSession(name), name), name);
  await page.waitForFunction(() => document.documentElement.dataset.sessionOffline, null, { timeout: 60_000 });
  assert.equal(await page.evaluate(() => document.documentElement.dataset.sessionOffline), "kept");
  down = true;
  try {
    await page.goto(`${server.origin}/session/?name=${name}`);
    await page.waitForFunction(() => ["ready", "failed"].includes(document.documentElement.dataset.dollyStatus));
    assert.equal(await page.evaluate(() => document.documentElement.dataset.dollyStatus), "ready",
      await page.locator("#bootstrap-log").textContent());
    await page.evaluate(() => __dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "session shell"));
    // The entry's shell runs the image's programs, each a new process Worker.
    assert.equal(await submit('test "$(cat /workspace/kept)" = kept && echo "int main(void) { return 7; }" > /tmp/seven.c && ' +
      "cc /tmp/seven.c -o /tmp/seven; /tmp/seven; test $? = 7"), 0, await text());
    await page.goto(`${server.origin}/sessions/`);
    await page.waitForFunction(() => document.documentElement.dataset.sessionsStatus === "ready");
    assert.equal(await page.locator("#sessions li a", { hasText: name }).count(), 1);
    await assert.rejects(page.goto(`${server.origin}/system/`));
  } finally {
    down = false;
  }
});
