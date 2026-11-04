// A save keeps each path's modification time: after a restore a file is as old
// as it was, and make rebuilds exactly the target whose source was edited after
// its build.
import assert from "node:assert/strict";
import { browserTest } from "./browser.mjs";

await browserTest("session times", { image: "system", timeout: 240_000 }, async ({ server, open }) => {
  const name = `times-${Date.now()}`;
  const { page, submit, text } = await open();
  const check = async command => assert.equal(await submit(command), 0, `${command}\n${await text()}`);
  await check("mkdir /workspace/times && cd /workspace/times");
  await check("touch -t 200001020304.05 old && touch -t 201006070809.10 newer");
  await check("stat -c %Y old newer > /workspace/times-saved");
  await check("printf 'all: a.out b.out\\n%%.out: %%.in\\n\\tcp $< $@\\n' > Makefile && echo a > a.in && echo b > b.in && make");
  await check("echo edited > a.in && make -n > /workspace/make-saved");
  await check('test "$(cat /workspace/make-saved)" = "cp a.in a.out"');
  assert.equal(await page.evaluate(name => __dolly.saveSession(name), name), name);

  await page.goto(`${server.origin}/session/?name=${name}`);
  await page.waitForFunction(() => ["ready", "failed"].includes(document.documentElement.dataset.dollyStatus));
  assert.equal(await page.evaluate(() => document.documentElement.dataset.dollyStatus), "ready",
    await page.locator("#bootstrap-log").textContent());
  await page.evaluate(() => __dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "session shell"));
  await check("cd /workspace/times");
  await check('test "$(stat -c %Y old newer)" = "$(cat /workspace/times-saved)"');
  await check('test "$(make)" = "cp a.in a.out" && test "$(cat a.out)" = edited');
});
