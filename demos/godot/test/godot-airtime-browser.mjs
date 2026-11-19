// Airtime's mouse look on gpu@0, on a real adapter, on the private X display DISPLAY names: Chrome
// on Vulkan, or the installed Firefox (docs/gpu.md). The front page's link starts the game; a click
// on the crosshair, where a HUD control once took the captured mouse's motion, gives the game the
// pointer, the mouse then turns the view, and Q prints how far and leaves the shell.
// Usage: node demos/godot/test/godot-airtime-browser.mjs [chromium|firefox ...]
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { launchInstalledFirefox } from "../../../test/browser.mjs";
import { startBrowserServer } from "../../../test/browser-server.mjs";

const browsers = process.argv.length > 2 ? process.argv.slice(2) : ["chromium", "firefox"];
for (const name of browsers) {
  assert.ok(["chromium", "firefox"].includes(name));
  const server = await startBrowserServer(new URL("../../..", import.meta.url).pathname, "godot-airtime");
  const browser = name === "firefox"
    ? await launchInstalledFirefox()
    : await chromium.launch({ channel: "chrome", headless: false,
      args: ["--no-sandbox", "--ozone-platform=x11", "--enable-unsafe-webgpu", "--use-angle=vulkan", "--enable-features=Vulkan,VulkanFromANGLE",
        "--disable-vulkan-surface"] });
  const deadline = setTimeout(() => void browser.close(), 600_000);
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } }), errors = [];
    page.setDefaultTimeout(0);
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.text().startsWith("Dolly GPU:")) errors.push(message.text()); });
    await page.goto(`${server.origin}/`);
    await page.locator('tr[data-image="godot-airtime"] th a').click();
    await page.waitForURL(`${server.origin}/godot-airtime/`);
    await page.waitForFunction(() => window.__dolly?.gpu?.active && __dolly.gpu.stats.frames > 120, null, { polling: 250, timeout: 300_000 });
    assert.equal(await page.evaluate(() => __dolly.gpu.isFallbackAdapter), false);
    // The crosshair is the display's middle; 300 pixels to the right then turn the view 19 degrees
    // (0.0011 rad a pixel) and 100 up 6.
    const box = await page.locator("#display").boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2;
    await page.mouse.click(x, y);
    await page.waitForFunction(() => document.pointerLockElement?.id === "display", null, { timeout: 10_000 });
    await new Promise(resolve => setTimeout(resolve, 1000));
    await page.mouse.move(x + 300, y - 100, { steps: 30 });
    await new Promise(resolve => setTimeout(resolve, 1500));
    await page.keyboard.press("q");
    await page.evaluate(() => __dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "shell"));
    const text = await page.evaluate(() => __dolly.visibleTerminalText());
    const [, right, up] = text.match(/^AIRTIME view (-?\d+) (-?\d+)$/m) ?? [];
    // What Firefox reports of Playwright's moves to a captured pointer varies from run to run, as
    // in godot-flyover-browser.mjs: there two thirds to five thirds of the motion.
    const [least, most] = name === "firefox" ? [2 / 3, 5 / 3] : [0.9, 1.1];
    for (const [turned, expected] of [[right, 19], [up, 6]]) {
      assert.ok(Number(turned) >= expected * least - 1 && Number(turned) <= expected * most + 1, `the captured mouse turns the view: ${text}`);
    }
    assert.equal(await page.evaluate(() => document.pointerLockElement), null, "the pointer is the page's again once the game has quit");
    assert.deepEqual(errors, []);
    console.log(name, `view ${right} ${up}`);
    console.log(`godot-airtime: ${name} passed`);
  } finally {
    clearTimeout(deadline);
    await browser.close();
    await server.close();
  }
}
