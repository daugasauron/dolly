// fingers: SDL2's finger events from touch@0. Two fingers moving apart zoom the
// figure about their midpoint, each marked with its id while it is down; one
// finger moves it. Chromium's own touch events (CDP) and touch PointerEvents
// dispatched in Firefox. Usage: node demos/fingers/test/fingers-browser.mjs
import assert from "node:assert/strict";
import { demoTest } from "../../browser.mjs";

const background = [18, 18, 26];
// The markers' colours for ids 1 and 2, as fingers.c draws them.
const marker = { 1: [120, 230, 120], 2: [250, 120, 200] };

for (const browser of ["chromium", "firefox"]) {
  await demoTest("fingers", { image: "fingers", browser }, async ({ open }) => {
    const { page, text, prompt } = await open({ prompt: null, device: { hasTouch: true } });
    // The frame is the terminal's text area, once fingers has drawn it: the
    // figure's centre is the frame's. Positions below are its pixels.
    const { left, top, scaleX, scaleY, width, height } = await (await page.waitForFunction(() => {
      const canvas = document.querySelector("#display"), box = canvas.getBoundingClientRect();
      const colour = (x, y) => [...canvas.getContext("2d").getImageData(x, y, 1, 1).data].slice(0, 3).join();
      const x = Math.floor(canvas.width / 2), y = Math.floor(canvas.height / 2);
      return __dolly.transport.graphicsActive() && colour(x, y) === "214,92,52" && colour(x - 1, y) === "240,196,72" &&
        { left: box.left, top: box.top, scaleX: box.width / canvas.width, scaleY: box.height / canvas.height,
          width: canvas.width, height: canvas.height };
    })).jsonValue();
    const centre = [Math.floor(width / 2), Math.floor(height / 2)];
    const at = ([x, y], dx = 0, dy = 0) => [x + dx, y + dy];
    const css = ([x, y]) => [left + x * scaleX, top + y * scaleY];
    const pixel = async point => page.evaluate(([x, y]) =>
      [...document.querySelector("#display").getContext("2d").getImageData(x, y, 1, 1).data].slice(0, 3), point);
    const figure = async point => JSON.stringify(await pixel(point)) !== JSON.stringify(background);
    const shown = (point, expected) => page.waitForFunction(([x, y, expected]) => JSON.stringify(
      [...document.querySelector("#display").getContext("2d").getImageData(x, y, 1, 1).data].slice(0, 3)) === expected,
    [...point, JSON.stringify(expected)]);

    const cdp = browser === "chromium" && await page.context().newCDPSession(page);
    // Fingers by their frame positions, in the order they went down.
    async function fingers(type, points) {
      if (cdp) {
        await cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map((point, id) => {
          const [x, y] = css(point);
          return { x, y, id };
        }) });
        return;
      }
      await page.evaluate(([type, points]) => points.forEach(([x, y], id) => document.querySelector("#display").dispatchEvent(
        new PointerEvent(type, { pointerId: 30 + id, pointerType: "touch", isPrimary: id === 0, button: 0,
          buttons: type === "pointerup" ? 0 : 1, pressure: type === "pointerup" ? 0 : 0.5, clientX: x, clientY: y,
          bubbles: true, cancelable: true }))), [{ touchStart: "pointerdown", touchMove: "pointermove", touchEnd: "pointerup" }[type],
        points.map(css)]);
    }
    async function lift(points) {
      if (cdp) await fingers("touchEnd", []);
      else await fingers("touchEnd", points);
    }

    // The figure is 160 pixels square about the centre, a corner of its checks there.
    assert.ok(await figure(at(centre, 70)) && !await figure(at(centre, 120)), "the figure as drawn");

    // Two fingers 120 pixels apart move to 240: twice the size, about their midpoint.
    await fingers("touchStart", [at(centre, -60)]);
    await fingers("touchStart", [at(centre, -60), at(centre, 60)]);
    for (let step = 1; step <= 6; ++step) await fingers("touchMove", [at(centre, -60 - 10 * step), at(centre, 60 + 10 * step)]);
    const held = [at(centre, -120), at(centre, 120)];
    // Each finger is marked in its id's colour, and its id is drawn above it:
    // the middle row of "1" has its middle column, that of "2" has not. A
    // browser may deliver the last move with its next frame.
    const digit = (point, column, row) => at(point, -6 + column * 8 + 4, -36 - 50 + row * 8 + 4);
    await shown(held[0], marker[1]);
    await shown(held[1], marker[2]);
    await shown(digit(held[0], 1, 1), marker[1]);
    await shown(digit(held[1], 2, 1), marker[2]);
    assert.notDeepEqual(await pixel(digit(held[1], 1, 1)), marker[2]);
    await lift(held);
    await page.waitForFunction(([x, y]) => [...document.querySelector("#display").getContext("2d")
      .getImageData(x, y, 1, 1).data].slice(0, 3).join() !== "120,230,120", held[0]);
    assert.ok(await figure(at(centre, 120)) && await figure(at(centre, -150)) && !await figure(at(centre, 170)), "zoomed twice");

    // One finger moves it 100 to the right and 50 down.
    await fingers("touchStart", [centre]);
    for (let step = 1; step <= 5; ++step) await fingers("touchMove", [at(centre, 20 * step, 10 * step)]);
    await lift([at(centre, 100, 50)]);
    await page.waitForFunction(([[x, y], [right, below]]) => {
      const colour = (x, y) => [...document.querySelector("#display").getContext("2d").getImageData(x, y, 1, 1).data].slice(0, 3).join();
      return colour(x, y) === "18,18,26" && colour(right, below) !== "18,18,26";
    }, [at(centre, -120), at(centre, 250, 50)]);

    await page.keyboard.press("Escape");
    await prompt(/fingers has ended/);
    assert.match(await text(), new RegExp(`fingers: 3 fingers; the figure at ${centre[0] + 100} ${centre[1] + 50}, scale 2\\.00`));
  });
}
