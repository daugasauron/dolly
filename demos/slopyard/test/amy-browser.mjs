// This demo's packages, each installed alone into a default session and used (amy-cases.json).
import assert from "node:assert/strict";
import { amyCases } from "../../../test/amy-sessions.mjs";

await amyCases(new URL("./amy-cases.json", import.meta.url), { async raylib(session, name) {
    // The program holds the display, so its line does not show: press Space once it runs.
    const keys = session.submit("/tmp/amy-raylib-keys");
    await session.page.locator("#keyboard").focus();
    await session.page.waitForTimeout(3000);
    await session.page.keyboard.press("Space");
    assert.equal(await keys, 0, await session.text());
    // Two fingers down on raylib's window, then up: CDP's touches in Chromium, a
    // touchscreen's PointerEvents in Firefox, as test/touch-browser.mjs.
    const touches = session.submit("/tmp/amy-raylib-touch");
    await session.page.waitForTimeout(3000);
    const { x, y } = await session.page.locator("#display").boundingBox(), points = [[x + 60, y + 60], [x + 120, y + 60]];
    if (name === "chromium") {
      const cdp = await session.page.context().newCDPSession(session.page);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
      await session.page.waitForTimeout(500);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    } else {
      const fingers = type => session.page.evaluate(([type, points]) => points.forEach(([x, y], id) => document.querySelector("#display").dispatchEvent(
        new PointerEvent(type, { pointerId: 20 + id, pointerType: "touch", isPrimary: id === 0, button: 0, buttons: type === "pointerup" ? 0 : 1,
          pressure: type === "pointerup" ? 0 : 0.5, clientX: x, clientY: y, bubbles: true, cancelable: true }))), [type, points]);
      await fingers("pointerdown");
      await session.page.waitForTimeout(500);
      await fingers("pointerup");
    }
    assert.equal(await touches, 0, await session.text());
  } });
