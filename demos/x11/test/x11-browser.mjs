// The x11-desktop image: Xsdl takes Dolly's display, twm frames xclock and
// xeyes in windows of their own, and the page's pointer reaches them: xeyes'
// pupils follow it and a drag of a title bar moves the clock's window.
// Prints the time to the first window, a drag's frames and the time a frame
// takes to reach the page. Usage: node demos/x11/test/x11-browser.mjs
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { delay, demoTest } from "../../browser.mjs";

const evidence = new URL("../../../build/x11-evidence/", import.meta.url).pathname;
const width = 1024, height = 768;

// The frame's pixels in a box: how many are not the root window's black, and
// a digest that changes with any of them.
const region = (page, x, y, w, h) => page.evaluate(([x, y, w, h]) => {
  const data = document.querySelector("#display").getContext("2d").getImageData(x, y, w, h).data;
  let lit = 0, digest = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] + data[i + 1] + data[i + 2] > 0) lit++;
    digest = (digest * 31 + data[i] + 7 * data[i + 1] + 13 * data[i + 2]) >>> 0;
  }
  return { lit, digest };
}, [x, y, w, h]);
// Page coordinates of a frame pixel: the canvas is scaled to the page.
async function at(page, x, y) {
  const box = await page.locator("#display").boundingBox();
  return [box.x + (x + 0.5) * box.width / width, box.y + (y + 0.5) * box.height / height];
}
const frameSequence = page => page.evaluate(() => Number(document.documentElement.dataset.frameSequence ?? 0));

await demoTest("x11", { image: "x11-desktop", timeout: 600_000 }, async ({ open }) => {
  await mkdir(evidence, { recursive: true });
  const started = performance.now();
  const { page } = await open({ prompt: null });
  const booted = performance.now();
  // The server's frame: 1024x768 once it holds the display.
  await page.waitForFunction(([width, height]) => __dolly.transport.graphicsActive() &&
    document.querySelector("#display").width === width && document.querySelector("#display").height === height,
  [width, height], { timeout: 120_000, polling: 50 });
  const server = performance.now();
  // xclock's window, framed by twm at +40+40: its face is drawn inside.
  await page.waitForFunction(() => {
    const data = document.querySelector("#display").getContext("2d").getImageData(60, 80, 140, 140).data;
    let lit = 0;
    for (let i = 0; i < data.length; i += 4) lit += data[i] + data[i + 1] + data[i + 2] > 0;
    return lit > 1000;
  }, null, { timeout: 120_000, polling: 50 });
  const firstWindow = performance.now();
  // Both windows are up: xeyes' at +260+40 has its eyes drawn too.
  await page.waitForFunction(() => {
    const data = document.querySelector("#display").getContext("2d").getImageData(270, 70, 220, 120).data;
    let lit = 0;
    for (let i = 0; i < data.length; i += 4) lit += data[i] + data[i + 1] + data[i + 2] > 0;
    return lit > 4000;
  }, null, { timeout: 60_000, polling: 50 });
  await page.screenshot({ path: `${evidence}desktop.png` });
  console.log(`x11: page ready ${((booted - started) / 1000).toFixed(1)}s, X server's frame ` +
    `${((server - started) / 1000).toFixed(1)}s, first window ${((firstWindow - started) / 1000).toFixed(1)}s after navigation`);

  // The pointer reaches the server: xeyes' pupils follow it.
  const eyes = await region(page, 270, 70, 220, 120);
  const moved = performance.now();
  await page.mouse.move(...await at(page, 900, 600), { steps: 4 });
  await page.waitForFunction(([before]) => {
    const data = document.querySelector("#display").getContext("2d").getImageData(270, 70, 220, 120).data;
    let digest = 0;
    for (let i = 0; i < data.length; i += 4) digest = (digest * 31 + data[i] + 7 * data[i + 1] + 13 * data[i + 2]) >>> 0;
    return digest !== before;
  }, [eyes.digest], { timeout: 30_000, polling: 10 });
  console.log(`x11: xeyes followed the pointer in ${(performance.now() - moved).toFixed(0)} ms`);

  // A drag of xclock's title bar: twm draws the outline while the button is
  // held and moves the window on release.
  const clockBefore = await region(page, 60, 80, 140, 140);
  assert.ok(clockBefore.lit > 1000);
  await page.mouse.move(...await at(page, 150, 51));
  await page.mouse.down();
  const frames = await frameSequence(page);
  const dragStarted = performance.now();
  for (let step = 1; step <= 30; step++) {
    await page.mouse.move(...await at(page, 150 + step * 15, 51 + step * 10));
    await delay(16);
  }
  const dragFrames = await frameSequence(page) - frames, dragSeconds = (performance.now() - dragStarted) / 1000;
  await page.screenshot({ path: `${evidence}drag.png` });
  const released = performance.now();
  await page.mouse.up();
  // The clock's face is drawn 450 px right and 300 px down.
  await page.waitForFunction(() => {
    const data = document.querySelector("#display").getContext("2d").getImageData(510, 380, 140, 140).data;
    let lit = 0;
    for (let i = 0; i < data.length; i += 4) lit += data[i] + data[i + 1] + data[i + 2] > 0;
    return lit > 1000;
  }, null, { timeout: 30_000, polling: 10 });
  const placed = performance.now() - released;
  assert.ok((await region(page, 60, 80, 140, 140)).lit < 100, "the clock's old place is the root's again");
  await page.screenshot({ path: `${evidence}moved.png` });
  console.log(`x11: a 2-second drag showed ${dragFrames} frames (${(dragFrames / dragSeconds).toFixed(0)}/s); ` +
    `the window was drawn in its new place ${placed.toFixed(0)} ms after release`);
});
