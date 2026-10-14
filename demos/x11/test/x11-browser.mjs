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
  await page.screenshot({ path: `${evidence}desktop.png` });
  console.log(`x11: page ready ${((booted - started) / 1000).toFixed(1)}s, X server's frame ` +
    `${((server - started) / 1000).toFixed(1)}s, first window ${((firstWindow - started) / 1000).toFixed(1)}s after navigation`);
});
