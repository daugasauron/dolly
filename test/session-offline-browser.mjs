// A saved session opens without a network: the save keeps the site's runtime in
// the browser (src/offline.mjs), and once the server answers nothing its page,
// the runtime and the files all come from there. A page that was not kept fails.
import assert from "node:assert/strict";
import { browserTest, composed } from "./browser.mjs";

let down = false;
const server = { handle(request) { if (down) request.socket.destroy(); return down; } };
await browserTest("session offline", { image: "system", timeout: 240_000, server }, async ({ server, open }) => {
  // An image of the catalog, then one the page built, which another Worker restores.
  for (const [name, options] of [["offline-system"], ["offline-built", await composed(["runtime", "display", "input", "snapshot"], ["core", "display"])]]) {
    const { page, submit, text } = await open(options);
    assert.equal(await submit("echo kept > $HOME/kept"), 0, await text());
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
      assert.equal(await submit('test "$(cat $HOME/kept)" = kept'), 0, await text());
      if (name === "offline-system") {
        assert.equal(await submit('echo "int main(void) { return 7; }" > /tmp/seven.c && cc /tmp/seven.c -o /tmp/seven; /tmp/seven; test $? = 7'), 0, await text());
      }
      await page.goto(`${server.origin}/sessions/`);
      await page.waitForFunction(() => document.documentElement.dataset.sessionsStatus === "ready");
      assert.equal(await page.locator("#sessions li a", { hasText: name }).count(), 1);
      await assert.rejects(page.goto(`${server.origin}/system/`));
    } finally {
      down = false;
    }
    await page.close();
  }
});
