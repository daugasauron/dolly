// clipboard@0: a foreground program holding the clipboard and the input lease
// copies at Ctrl+C into the browser's clipboard, and at Ctrl+V reads what the
// user pasted from there, which reaches it as the chord's keys, not as typed
// text. A copy made with no key press or click moments before stays in Dolly.
// A process beside the foreground program is refused; a descendant takes the
// clipboard over and its holder has it back.
// Usage: node test/clipboard-browser.mjs [chromium|firefox ...]
import assert from "node:assert/strict";
import { browserTest, composed } from "./browser.mjs";

const fixtures = { "clipboard.c": "test/fixtures/clipboard.c" };

await browserTest("clipboard", { image: "system", server: { fixtures }, timeout: 300_000 }, async ({ name, server, open }) => {
  const image = await composed(["clipboard"], ["libdolly-clipboard"], { base: "system" });
  const { page, submit, text, waitForText } = await open({ ...image,
    policy: { rules: [{ origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] }] },
    async setup(page) {
      await image.setup(page);
      if (name === "chromium") await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    } });
  const run = async command => assert.equal(await submit(command), 0, await text());
  await run(`curl -fsS ${server.origin}/fixture/clipboard.c -o /tmp/clipboard.c && cc /tmp/clipboard.c -o /tmp/clipboard`);
  await run("/tmp/clipboard refuse");
  assert.match(await text(), /CLIPBOARD_REFUSALS_OK/);
  await run("/tmp/clipboard busy & foreground /tmp/clipboard idle");
  await waitForText(/CLIPBOARD-BUSY/);
  await run("/tmp/clipboard nest");
  assert.match(await text(), /CLIPBOARD-NESTED-OK/);

  const browserClipboard = () => page.evaluate(() => navigator.clipboard.readText());
  // The copies above: the evaluations that typed the commands were user gestures to Chromium.
  const copied = () => page.evaluate(() => { delete document.documentElement.dataset.clipboardCopy; });
  const copying = submit("/tmp/clipboard copy COPIED-IN-DOLLY");
  copying.catch(() => {});
  await page.waitForFunction(() => __dolly.inputTransport.leased());
  await copied();
  await page.keyboard.press("Control+c");
  await page.waitForFunction(() => document.documentElement.dataset.clipboardCopy === "copied");
  assert.equal(await browserClipboard(), "COPIED-IN-DOLLY");
  await page.evaluate(() => navigator.clipboard.writeText("PASTED-FROM-THE-BROWSER"));
  await page.keyboard.press("Control+v");
  assert.equal(await copying, 0, await text());
  assert.match(await text(), /CLIPBOARD-PASTE PASTED-FROM-THE-BROWSER/);
  assert.doesNotMatch(await text(), /CLIPBOARD-TEXT/, "the paste is not typed text too");

  // Nothing the user did in the last seconds: the copy stays in Dolly.
  await copied();
  await run("/tmp/clipboard unprompted UNPROMPTED-COPY");
  await page.waitForFunction(() => document.documentElement.dataset.clipboardCopy === "inactive");
  assert.equal(await browserClipboard(), "PASTED-FROM-THE-BROWSER");
});
