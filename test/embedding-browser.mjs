// An embedding's page around Dolly's element is left alone: its own text
// field keeps the keys typed into it (neither the shell nor a module's chord
// takes them) and the modules' controls lie inside the element, not on the
// embedder's page. The terminal still reads the keys typed into it.
import assert from "node:assert/strict";
import { browserTest } from "./browser.mjs";

await browserTest("embedding", { image: "system" }, async ({ open }) => {
  const { page, result, submit, waitForText } = await open({ setup: page => page.addInitScript(() =>
    document.addEventListener("DOMContentLoaded", () => {
      document.head.append(Object.assign(document.createElement("style"), { textContent:
        "#terminal { position: absolute; left: 0; top: 60px; width: 640px; height: 400px; } #outside { position: absolute; top: 10px; left: 10px; }" }));
      document.body.append(Object.assign(document.createElement("input"), { id: "outside" }));
    })) });
  await page.click("#outside");
  await page.keyboard.type("hello");
  // snapshot@0's Ctrl+Shift+S would open the save dialog.
  await page.keyboard.press("Control+Shift+S");
  assert.equal(await page.inputValue("#outside"), "hello");
  assert.equal(await page.locator("#session-dialog").evaluate(dialog => dialog.open), false);
  await page.locator("#keyboard").focus();
  assert.equal(await result(() => page.keyboard.type("echo TYPED-$((40 + 2))\n")), 0);
  await waitForText(/^TYPED-42$/m);

  // snapshot@0's Save button and download@0's offer, each inside the element.
  assert.equal(await submit("download /etc/dolly/Dollyfile"), 0);
  const outside = await page.evaluate(() => {
    const box = document.querySelector("#terminal").getBoundingClientRect();
    return ["#session-open", "#downloads"].filter(selector => {
      const { left, top, right, bottom } = document.querySelector(selector).getBoundingClientRect();
      return left < box.left || top < box.top || right > box.right || bottom > box.bottom;
    });
  });
  assert.deepEqual(outside, []);
});
