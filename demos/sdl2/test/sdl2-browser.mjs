// The sdl2 package installed on `system`: a source build, RGB565 presentation,
// text and key input, clicks, pointer presence and blur. Usage: node demos/sdl2/test/sdl2-browser.mjs
import assert from "node:assert/strict";
import { demoTest, installProbe } from "../../browser.mjs";

await demoTest("sdl2", { image: "sdl2", timeout: 600_000,
  server: { fixtures: { "sdl2-probe.c": "demos/sdl2/test/fixtures/sdl2-probe.c" } } }, async ({ server, open }) => {
  const { page, run, start } = await open({ ...await installProbe("sdl2"),
    policy: { rules: [{ origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] }] } });
  // Keys with layout-specific text and repeats need Chrome's own key events.
  const cdp = await page.context().newCDPSession(page);
  const key = async ({ modifiers = 0, ...event }) => {
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", modifiers, ...event });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", modifiers, ...event, text: undefined });
  };
  const displayActive = () => page.waitForFunction(() => __dolly.transport.graphicsActive());
  await run(`mkdir /tmp/dolly-sdl2 && cd /tmp/dolly-sdl2 && curl -fsS ${server.origin}/fixture/sdl2-probe.c -o probe.c && cc -O0 -I/usr/include/SDL2 probe.c -o probe -lSDL2 -lm`);
  await run("./probe && ./probe");

  let probe = start("./probe input");
  await displayActive();
  await page.waitForFunction(() => {
    const canvas = document.querySelector("canvas");
    if (canvas.width !== 320 || canvas.height !== 240) return false;
    const context = canvas.getContext("2d");
    return JSON.stringify([[80, 60], [240, 60], [80, 180], [240, 180]].map(([x, y]) => [...context.getImageData(x, y, 1, 1).data]))
      === "[[255,0,0,255],[0,255,0,255],[0,0,255,255],[255,255,255,255]]";
  });
  const box = await page.locator("canvas").boundingBox();
  await page.mouse.click(box.x + box.width / 4, box.y + box.height / 4);
  await page.mouse.click(box.x + box.width / 4, box.y + box.height / 4, { button: "right" });
  await key({ key: "a", code: "KeyA", windowsVirtualKeyCode: 65 });
  for (const [text, code, modifiers] of [["B", "KeyB", 8], ["!", "Digit1", 8], ["é", "KeyE", 0], ["😀", "", 0]]) {
    await key({ key: text, code, modifiers, text });
  }
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "x", code: "KeyX", text: "x" });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "x", code: "KeyX", text: "x", autoRepeat: true });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "x", code: "KeyX" });
  // Shortcuts, dead keys and navigation produce no text.
  for (const [name, code, modifiers] of [["d", "KeyD", 2], ["k", "KeyK", 4], ["Dead", "Quote", 0], ["ArrowLeft", "ArrowLeft", 0]]) {
    await key({ key: name, code, modifiers });
  }
  await page.evaluate(() => {
    const keyboard = document.querySelector("#keyboard");
    keyboard.dispatchEvent(new KeyboardEvent("keydown", { key: "e", code: "KeyE", isComposing: true, bubbles: true }));
    keyboard.dispatchEvent(new KeyboardEvent("keyup", { key: "e", code: "KeyE", isComposing: true, bubbles: true }));
    keyboard.dispatchEvent(new CompositionEvent("compositionend", { data: "日本語" }));
  });
  assert.equal(await page.evaluate(() => __dolly.input(" ✓")), true);
  await page.keyboard.press("Escape");
  assert.equal(await probe.done, 0);
  assert.equal(await page.evaluate(() => __dolly.transport.graphicsActive()), false);

  probe = start("./probe presence");
  await displayActive();
  for (const x of [100, -10, 100]) await page.mouse.move(x, 100);
  await page.keyboard.down("ArrowRight");
  await page.mouse.down();
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.keyboard.press("Escape");
  assert.equal(await probe.done, 0, "focus loss must release held keys and buttons");
  await page.mouse.up();
  await page.keyboard.up("ArrowRight");
  await run("cd / && rm -rf /tmp/dolly-sdl2");
});
