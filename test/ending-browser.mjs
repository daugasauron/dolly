// When the ENTRY process ends, the page says how in its own element over the
// display and offers a restart: after the last shell exits, after Ctrl+C ends
// a program, and after a program traps (which is not a page failure).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { browserTest } from "./browser.mjs";
import { CANONICAL_ORIGIN } from "../src/static-asset.mjs";

const { DOLLY_IMAGES } = await import("../dist/dolly-images.mjs");
const hosts = (await readFile(new URL("../Dollyfile-system", import.meta.url), "utf8")).match(/^REQUIRES HOST .*$/gm);
const recipe = rows => ["DOLLY 6", "APPLICATION ending", ...hosts,
  `FROM ${CANONICAL_ORIGIN}/Dollyfile-system ${DOLLY_IMAGES.find(({ image }) => image === "system").sha256}`, ...rows, ""].join("\n");
const ended = async page => {
  await page.waitForFunction(() => ["exited", "failed"].includes(document.documentElement.dataset.dollyStatus), null, { timeout: 90_000 });
  return page.evaluate(() => ({ status: document.documentElement.dataset.dollyStatus,
    notice: document.querySelector("#image-ended")?.textContent ?? "",
    visible: document.querySelector("#image-ended")?.getBoundingClientRect().height > 0,
    log: document.querySelector("#bootstrap-log").hidden ? "" : document.querySelector("#bootstrap-log").textContent }));
};

await browserTest("ending", { image: "system", timeout: 300_000 }, async ({ browser, server, open }) => {
  const { page } = await open();
  await page.keyboard.type("exit 7\n");
  let end = await ended(page);
  assert.deepEqual([end.status, end.visible, end.log], ["exited", true, ""], end.notice);
  assert.match(end.notice, /\b7\b/);
  // The first link starts the image again.
  await page.locator("#image-ended a").first().click();
  await page.waitForFunction(() => document.documentElement.dataset.dollyStatus === "ready");
  assert.equal(await page.locator("#image-ended").count(), 0);
  await page.close();

  const custom = async rows => {
    const page = await browser.newPage();
    await page.addInitScript(source => sessionStorage.setItem("dolly-custom-source", source), recipe(rows));
    await page.goto(server.origin + "/custom/rebuild/");
    return page;
  };
  const loop = await custom(["FILE /etc/dolly/loop.slop", "    while :; do :; done", "ENTRY /bin/slop /etc/dolly/loop.slop"]);
  await loop.waitForFunction(() => globalThis.__dolly?.terminal.foregroundInterruptible(), null, { timeout: 90_000 });
  await loop.keyboard.press("Control+c");
  end = await ended(loop);
  assert.deepEqual([end.status, end.visible, end.log], ["exited", true, ""], end.notice);
  assert.match(end.notice, /SIGINT/);
  await loop.close();

  // SIGKILL never reaches the program: the kernel ends the process itself, as
  // it ends one that Ctrl+C finds before its program has entered.
  const killed = await custom(["FILE /etc/dolly/kill.slop", "    kill -9 $$", "ENTRY /bin/slop /etc/dolly/kill.slop"]);
  end = await ended(killed);
  assert.deepEqual([end.status, end.visible, end.log], ["exited", true, ""], end.notice);
  assert.match(end.notice, /SIGKILL/);
  await killed.close();

  const trap = await custom(["FILE /tmp/trap.c", "    int main(void) { __builtin_trap(); }",
    "SLOP cc /tmp/trap.c -o /usr/bin/trap", "EXPORTS TOOL trap", "ENTRY /usr/bin/trap"]);
  end = await ended(trap);
  assert.deepEqual([end.status, end.visible, end.log], ["exited", true, ""], end.notice);
  assert.match(end.notice, /unreachable/);
});
