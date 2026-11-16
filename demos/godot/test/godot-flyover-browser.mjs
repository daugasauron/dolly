// Voxel Flyover on gpu@0, on a real adapter, on the private X display DISPLAY names: Chrome on
// Vulkan, or the installed Firefox (docs/gpu.md). The front page lists godot-voxel-flyover among
// its applications, and its link starts the game on the page. A click gives the game the pointer
// and the player the board, and the mouse then turns the view: Q prints how far it was turned,
// and leaves the shell, where the game flies itself through a morning and reports: its flyer
// reached a beacon, so the ground the script flies over is the ground the shaders draw, its
// frame has the sky along the top and a scene's worth of colours, and few of its frames took
// over twice the median. Chrome shows its frames on the X display by copies
// (--disable-vulkan-surface): its Vulkan swapchain there shows a full-screen page at half the
// display's rate, whatever the page draws.
// Usage: node demos/godot/test/godot-flyover-browser.mjs [chromium|firefox ...]
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { launchInstalledFirefox } from "../../../test/browser.mjs";
import { startBrowserServer } from "../../../test/browser-server.mjs";

const browsers = process.argv.length > 2 ? process.argv.slice(2) : ["chromium", "firefox"];
for (const name of browsers) {
  assert.ok(["chromium", "firefox"].includes(name));
  const server = await startBrowserServer(new URL("../../..", import.meta.url).pathname, "godot-voxel-flyover");
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
    // From the front page, where the application is listed.
    await page.goto(`${server.origin}/`);
    await page.locator('tr[data-image="godot-voxel-flyover"] th a').click();
    await page.waitForURL(`${server.origin}/godot-voxel-flyover/`);
    await page.waitForFunction(() => window.__dolly?.gpu?.active && __dolly.gpu.stats.frames > 120, null, { polling: 250, timeout: 300_000 });
    assert.equal(await page.evaluate(() => __dolly.gpu.isFallbackAdapter), false);
    // A person's click captures the pointer; 300 pixels to the right then turn the view 60 degrees.
    const box = await page.locator("#display").boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2;
    await page.mouse.click(x, y);
    await page.waitForFunction(() => document.pointerLockElement?.id === "display", null, { timeout: 10_000 });
    await new Promise(resolve => setTimeout(resolve, 1000));
    await page.mouse.move(x + 300, y, { steps: 30 });
    await new Promise(resolve => setTimeout(resolve, 1500));
    await page.keyboard.press("q");
    await page.evaluate(() => __dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "shell"));
    const flight = await page.evaluate(() => __dolly.visibleTerminalText());
    const [, view] = flight.match(/^FLYOVER flown \d+ beacons \d+ view (-?\d+) -?\d+$/m) ?? [];
    // The view turns 0.0035 rad a pixel of the motion the page is given: 300 pixels are 60 degrees in
    // Chrome. Firefox re-centres a captured pointer, and what it reports of Playwright's moves varies from
    // run to run on a quiet machine too (45 to 92 degrees were seen for the same moves): not explained.
    const [least, most] = name === "firefox" ? [40, 100] : [57, 63];
    assert.ok(Number(view) >= least && Number(view) <= most, `the captured mouse turns the view: ${flight}`);
    assert.equal(await page.evaluate(() => document.pointerLockElement), null, "the pointer is the page's again once the game has quit");
    const run = async command => assert.equal(await page.evaluate(text => __dolly.submit(text), command), 0, command);
    await run("voxel-flyover -- --autopilot 30 --day 9 > /tmp/flyover.out 2>&1");
    await run("! grep -qE 'refused a batch|SCRIPT ERROR|SHADER ERROR' /tmp/flyover.out");
    await run("clear; grep '^FLYOVER ' /tmp/flyover.out");
    const report = await page.evaluate(() => __dolly.visibleTerminalText());
    assert.match(report, /^FLYOVER adapter WebGPU forward_plus$/m);
    const [, fps, beacons] = report.match(/^FLYOVER seconds [\d.]+ frames \d+ fps ([\d.]+) gpu [\d.]+ cpu [\d.]+ flown \d+ beacons (\d+)$/m) ?? [];
    const [, hitches] = report.match(/^FLYOVER frame times median [\d.]+ p99 [\d.]+ max [\d.]+ hitches (\d+)$/m) ?? [];
    const [, sky, colours] = report.match(/^FLYOVER frame \d+x\d+ sky (\d+) colours (\d+)$/m) ?? [];
    assert.ok(Number(fps) >= 10 && Number(beacons) >= 1 && Number(sky) > 100 && Number(colours) > 150, `Voxel Flyover flies and draws: ${report}`);
    // Of some 1,700 frames; a loaded machine drops a few.
    assert.ok(hitches !== undefined && Number(hitches) <= 60, `Voxel Flyover's frames are even: ${report}`);
    assert.deepEqual(errors, []);
    console.log(name, `view ${view}`, ...report.match(/^FLYOVER (seconds|frame) .*$/gm));
    console.log(`godot-flyover: ${name} passed`);
  } finally {
    clearTimeout(deadline);
    await browser.close();
    await server.close();
  }
}
