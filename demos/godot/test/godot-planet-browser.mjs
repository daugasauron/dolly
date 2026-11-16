// Voxel Planet on gpu@0, on a real adapter, on the private X display DISPLAY names: Chrome on
// Vulkan, or the installed Firefox (docs/gpu.md). The front page lists godot-voxel-planet among
// its applications, and its link starts the game on the page. A click gives the game the pointer
// and the player the board, and the mouse then turns the view: Q prints how far it was turned,
// and leaves the shell. There the game flies itself through a morning and reports: its flyer
// reached a beacon, so the ground the script flies over is the ground the shaders draw on the
// sphere, its frame has the sky along the top and a scene's worth of colours, and few of its
// frames took over twice the median. Then it leaves the planet by itself: it reports a height
// of over 150,000 units, a chart whose anchor moved on the way, and a frame with a scene's
// worth of colours (the planet under it).
// Usage: node demos/godot/test/godot-planet-browser.mjs [chromium|firefox ...]
import assert from "node:assert/strict";
import { chromium, firefox } from "playwright-core";
import { startBrowserServer } from "../../../test/browser-server.mjs";

const browsers = process.argv.length > 2 ? process.argv.slice(2) : ["chromium", "firefox"];
for (const name of browsers) {
  assert.ok(["chromium", "firefox"].includes(name));
  const server = await startBrowserServer(new URL("../../..", import.meta.url).pathname, "godot-voxel-planet");
  const browser = name === "firefox"
    ? await firefox.launch({ channel: "moz-firefox", headless: false, firefoxUserPrefs: { "dom.webgpu.enabled": true } })
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
    await page.locator('tr[data-image="godot-voxel-planet"] th a').click();
    await page.waitForURL(`${server.origin}/godot-voxel-planet/`);
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
    const [, view] = flight.match(/^PLANET flown \d+ beacons \d+ view (-?\d+) -?\d+$/m) ?? [];
    // The view turns 0.0035 rad a pixel of the motion the page is given: 300 pixels are 60 degrees in
    // Chrome. Firefox re-centres a captured pointer, and what it reports of Playwright's moves varies from
    // run to run on a quiet machine too (45 to 92 degrees were seen for the same moves): not explained.
    const [least, most] = name === "firefox" ? [40, 100] : [57, 63];
    assert.ok(Number(view) >= least && Number(view) <= most, `the captured mouse turns the view: ${flight}`);
    assert.equal(await page.evaluate(() => document.pointerLockElement), null, "the pointer is the page's again once the game has quit");
    const run = async command => assert.equal(await page.evaluate(text => __dolly.submit(text), command), 0, command);
    await run("voxel-planet -- --autopilot 30 --day 9 > /tmp/planet.out 2>&1");
    await run("! grep -qE 'refused a batch|SCRIPT ERROR|SHADER ERROR' /tmp/planet.out");
    await run("clear; grep '^PLANET ' /tmp/planet.out");
    const report = await page.evaluate(() => __dolly.visibleTerminalText());
    assert.match(report, /^PLANET adapter WebGPU forward_plus$/m);
    const [, fps, beacons] = report.match(/^PLANET seconds [\d.]+ frames \d+ fps ([\d.]+) gpu [\d.]+ cpu [\d.]+ flown \d+ beacons (\d+)$/m) ?? [];
    const [, hitches] = report.match(/^PLANET frame times median [\d.]+ p99 [\d.]+ max [\d.]+ hitches (\d+)$/m) ?? [];
    const [, sky, colours] = report.match(/^PLANET frame \d+x\d+ sky (\d+) colours (\d+)$/m) ?? [];
    assert.ok(Number(fps) >= 10 && Number(beacons) >= 1 && Number(sky) > 100 && Number(colours) > 150, `Voxel Planet flies and draws: ${report}`);
    // Of some 1,700 frames; a loaded machine drops a few.
    assert.ok(hitches !== undefined && Number(hitches) <= 60, `Voxel Planet's frames are even: ${report}`);
    await run("voxel-planet -- --autopilot 100 --day 9 --tour 2 --top 250000 > /tmp/planet.out 2>&1");
    await run("! grep -qE 'refused a batch|SCRIPT ERROR|SHADER ERROR' /tmp/planet.out");
    await run("clear; grep '^PLANET ' /tmp/planet.out");
    const tour = await page.evaluate(() => __dolly.visibleTerminalText());
    const [, highest, anchors] = tour.match(/^PLANET highest (\d+) anchors (\d+)$/m) ?? [];
    const [, lit] = tour.match(/^PLANET frame \d+x\d+ sky \d+ colours (\d+)$/m) ?? [];
    assert.ok(Number(highest) > 150_000 && Number(anchors) >= 1 && Number(lit) > 60, `Voxel Planet is left: ${tour}`);
    assert.deepEqual(errors, []);
    console.log(name, `view ${view}`, ...report.match(/^PLANET (seconds|frame) .*$/gm), "tour:", ...tour.match(/^PLANET (seconds|frame|highest) .*$/gm));
    console.log(`godot-planet: ${name} passed`);
  } finally {
    clearTimeout(deadline);
    await browser.close();
    await server.close();
  }
}
