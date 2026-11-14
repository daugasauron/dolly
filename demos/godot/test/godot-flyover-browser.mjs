// Voxel Flyover on gpu@0, on a real adapter, on the private X display DISPLAY names: Chrome on
// Vulkan, or the installed Firefox (docs/gpu.md). godot-voxel-flyover starts the game on the
// page; Q leaves the shell, where the game flies itself from noon and reports: its airship
// reached a beacon, so the ground the script flies over is the ground the shaders draw, and its
// frame has the sky along the top and a scene's worth of colours.
// Usage: node demos/godot/test/godot-flyover-browser.mjs [chromium|firefox ...]
import assert from "node:assert/strict";
import { chromium, firefox } from "playwright-core";
import { startBrowserServer } from "../../../test/browser-server.mjs";

const browsers = process.argv.length > 2 ? process.argv.slice(2) : ["chromium", "firefox"];
for (const name of browsers) {
  assert.ok(["chromium", "firefox"].includes(name));
  const server = await startBrowserServer(new URL("../../..", import.meta.url).pathname, "godot-voxel-flyover");
  const browser = name === "firefox"
    ? await firefox.launch({ channel: "moz-firefox", headless: false, firefoxUserPrefs: { "dom.webgpu.enabled": true } })
    : await chromium.launch({ channel: "chrome", headless: false,
      args: ["--no-sandbox", "--ozone-platform=x11", "--enable-unsafe-webgpu", "--use-angle=vulkan", "--enable-features=Vulkan,VulkanFromANGLE"] });
  const deadline = setTimeout(() => void browser.close(), 600_000);
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } }), errors = [];
    page.setDefaultTimeout(0);
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.text().startsWith("Dolly GPU:")) errors.push(message.text()); });
    await page.goto(`${server.origin}/godot-voxel-flyover/`);
    await page.waitForFunction(() => window.__dolly?.gpu?.active, null, { polling: 250, timeout: 180_000 });
    assert.equal(await page.evaluate(() => __dolly.gpu.isFallbackAdapter), false);
    // The game takes Q once its scene runs.
    while (await page.evaluate(() => __dolly.gpu.active)) {
      await page.keyboard.press("q");
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    await page.evaluate(() => __dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "shell"));
    const run = async command => assert.equal(await page.evaluate(text => __dolly.submit(text), command), 0, command);
    await run("voxel-flyover -- --autopilot 30 --day 12 > /tmp/flyover.out 2>&1");
    await run("! grep -qE 'refused a batch|SCRIPT ERROR|SHADER ERROR' /tmp/flyover.out");
    await run("clear; grep '^FLYOVER ' /tmp/flyover.out");
    const report = await page.evaluate(() => __dolly.visibleTerminalText());
    assert.match(report, /^FLYOVER adapter WebGPU forward_plus$/m);
    const [, fps, beacons] = report.match(/^FLYOVER seconds [\d.]+ frames \d+ fps ([\d.]+) flown \d+ beacons (\d+)$/m) ?? [];
    const [, sky, colours] = report.match(/^FLYOVER frame \d+x\d+ sky (\d+) colours (\d+)$/m) ?? [];
    assert.ok(Number(fps) >= 10 && Number(beacons) >= 1 && Number(sky) > 100 && Number(colours) > 150, `Voxel Flyover flies and draws: ${report}`);
    assert.deepEqual(errors, []);
    console.log(name, report.match(/^FLYOVER seconds .*$/m)?.[0], report.match(/^FLYOVER frame .*$/m)?.[0]);
    console.log(`godot-flyover: ${name} passed`);
  } finally {
    clearTimeout(deadline);
    await browser.close();
    await server.close();
  }
}
