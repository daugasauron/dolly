// PhotoCraft on a touchscreen with no fine pointer, 900 by 900, on gpu@0 on a real adapter in
// Chrome, on the private X display DISPLAY names (docs/gpu.md). Its window keeps the size it took
// at the start, and the page shows no bar: PhotoCraft shows no buttons, and Paste comes only beside
// a program's. A tap lands on the window's pixel under the finger: one on a field of the colour
// panel focuses the field, whose Ctrl+A and Ctrl+C then give the browser's clipboard its text: the
// hex field's 000000, then the red field's 0. Firefox through WebDriver BiDi has no touch to give;
// the bar over gpu@0 is test/pointer-browser.mjs's. The page is narrower than half the display, where the X server's pointer rests: a window
// under it is told a mouse is there, as a laptop's.
// Usage: node demos/photocraft/test/photocraft-touch-browser.mjs
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { startBrowserServer } from "../../../test/browser-server.mjs";

// The centres of the hex and red fields, in the window's pixels: the colour panel keeps to the
// right edge.
const hex = [660, 162], red = [726, 162];
const server = await startBrowserServer(new URL("../../..", import.meta.url).pathname, "photocraft-photos");
const browser = await chromium.launch({ channel: "chrome", headless: false,
  args: ["--no-sandbox", "--ozone-platform=x11", "--enable-unsafe-webgpu", "--use-angle=vulkan", "--enable-features=Vulkan,VulkanFromANGLE"] });
const deadline = setTimeout(() => void browser.close(), 400_000);
try {
  const context = await browser.newContext({ viewport: { width: 900, height: 900 }, hasTouch: true });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: server.origin });
  const page = await context.newPage(), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(server.origin + "/photocraft-photos/");
  await page.waitForFunction(() => window.__dolly?.gpu?.active, null, { polling: 250, timeout: 180_000 });
  // It has drawn the picture once it has decoded and uploaded it.
  await page.waitForTimeout(30_000);
  // A tap where the canvas shows the window's pixel, which egui reads in a frame of its own.
  async function tap([x, y]) {
    const point = await page.evaluate(([x, y]) => {
      // gpu@0's box, the canvas's parent, fits the frame at its own shape, centred.
      const box = document.querySelector("#gpu-display").parentElement.getBoundingClientRect(), { width, height } = __dolly.gpu;
      const scale = Math.min(box.width / width, box.height / height);
      return [box.x + (box.width - width * scale) / 2 + x * scale, box.y + (box.height - height * scale) / 2 + y * scale];
    }, [x, y]);
    await page.touchscreen.tap(...point);
    await page.waitForTimeout(500);
  }
  // What the focused field gives the clipboard.
  async function copied() {
    await page.evaluate(() => navigator.clipboard.writeText("before"));
    for (const keys of ["Control+a", "Control+c"]) {
      await page.keyboard.press(keys);
      await page.waitForTimeout(500);
    }
    return page.evaluate(() => navigator.clipboard.readText());
  }
  await tap(hex);
  assert.equal(await copied(), "000000", "the hex field");
  await tap(red);
  assert.equal(await copied(), "0", "the red field");
  assert.equal(await page.locator("#buttons").isHidden(), true, "a bar without a program's buttons");
  assert.deepEqual(errors, []);
  console.log("photocraft-touch: chromium passed");
} finally {
  clearTimeout(deadline);
  await browser.close();
  await server.close();
}
