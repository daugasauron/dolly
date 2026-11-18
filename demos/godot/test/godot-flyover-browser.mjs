// Voxel Flyover on gpu@0, on a real adapter, on the private X display DISPLAY names: Chrome on
// Vulkan, or the installed Firefox (docs/gpu.md). The front page lists godot-voxel-flyover among
// its applications, and its link starts the game on the page. A click gives the game the pointer, L gives it back
// and a click again gives the player the board, and the mouse then steers: pushed forward, the board noses up to almost
// straight up, which the Q that leaves the shell prints. There the game flies itself through a
// morning from before a chain's first cloud and reports: its flyer flew through it, so the ground the
// script flies over is the ground the shaders draw on the sphere, its frame has the sky along the top
// and a scene's worth of colours, and few of its frames took over twice the median, fewer over four
// times. Flying on through the chain as a quick hand would, it chains five clouds or six and is over
// the air (50,000 units). Then it leaves the planet by itself: it reports a height of over
// 150,000 units, a chart whose anchor moved on the way, and a frame with a scene's worth of colours
// (the planet under it).
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
      args: ["--no-sandbox", "--ozone-platform=x11", "--enable-unsafe-webgpu", "--use-angle=vulkan", "--enable-features=Vulkan,VulkanFromANGLE",
        "--disable-vulkan-surface"] });
  const deadline = setTimeout(() => void browser.close(), 1_200_000);
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
    // A person's click captures the pointer, L gives it back, and a click captures it again; 900 pixels up then
    // raise the board's nose to almost straight up.
    const box = await page.locator("#display").boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2;
    const capture = async () => {
      await page.mouse.click(x, y);
      await page.waitForFunction(() => document.pointerLockElement?.id === "display", null, { timeout: 10_000 });
      await new Promise(resolve => setTimeout(resolve, 1000));
    };
    await capture();
    await page.keyboard.press("l");
    await page.waitForFunction(() => document.pointerLockElement === null, null, { timeout: 10_000 });
    await new Promise(resolve => setTimeout(resolve, 1500));
    await capture();
    await page.mouse.move(x, y - 900, { steps: 90 });
    await new Promise(resolve => setTimeout(resolve, 1500));
    await page.keyboard.press("q");
    await page.evaluate(() => __dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "shell"));
    const flight = await page.evaluate(() => __dolly.visibleTerminalText());
    const [, helm, pitch] = flight.match(/^FLYOVER flown \d+ clouds \d+ score \d+ helm (\d) high -?\d+ heading -?\d+ pitch (-?\d+) speed \d+ zoom [\d.]+ touches \d+$/m) ?? [];
    // The heading turns 0.0025 radians a pixel of the motion the page is given, so 900 pixels would raise the nose 129
    // degrees, and it stops at 86. Firefox gives the moves (2026-11-18: 216 of 240) after
    // a jump that the game leaves (320 and 115 pixels for the first move of 8).
    assert.ok(helm === "1" && Number(pitch) >= 80 && Number(pitch) <= 86, `the captured mouse steers the board to almost straight up: ${flight}`);
    assert.equal(await page.evaluate(() => document.pointerLockElement), null, "the pointer is the page's again once the game has quit");
    const run = async command => assert.equal(await page.evaluate(text => __dolly.submit(text), command), 0, command);
    const flown = async options => {
      await run(`voxel-flyover -- ${options} > /tmp/flyover.out 2>&1`);
      await run("! grep -qE 'refused a batch|SCRIPT ERROR|SHADER ERROR' /tmp/flyover.out");
      await run("clear; grep '^FLYOVER ' /tmp/flyover.out");
      return page.evaluate(() => __dolly.visibleTerminalText());
    };
    const report = await flown("--autopilot 30 --day 9 --cloud 1");
    assert.match(report, /^FLYOVER adapter WebGPU forward_plus$/m);
    const [, fps, clouds] = report.match(/^FLYOVER seconds [\d.]+ frames \d+ fps ([\d.]+) gpu [\d.]+ cpu [\d.]+ flown \d+ clouds (\d+) score \d+ longest \d+$/m) ?? [];
    const [, median, late, long] = report.match(/^FLYOVER frame times median ([\d.]+) p95 [\d.]+ p99 [\d.]+ max [\d.]+ over2x (\d+) over4x (\d+)$/m) ?? [];
    const [, sky, colours] = report.match(/^FLYOVER frame \d+x\d+ sky (\d+) colours (\d+)$/m) ?? [];
    // A frame low over the land had 500 colours and more; one that looked down through the haze after a chain that
    // climbed to 300 units had 65 (2026-11-18): over 60, as the tour asks of the planet seen from space.
    assert.ok(Number(fps) >= 10 && Number(clouds) >= 1 && Number(sky) > 100 && Number(colours) > 60, `Voxel Flyover flies and draws: ${report}`);
    // Of some 1,700 frames, a display's frame apart on a quiet machine: one in six may miss a display's
    // frame on a loaded one, and few stand for four.
    assert.ok(Number(median) > 0 && Number(late) <= 300 && Number(long) <= 30, `Voxel Flyover's frames are even: ${report}`);
    // A chain flown through by a quick hand (the corgi with --chain: most of a turn in an eighth of a second) is over
    // the air by its fifth or sixth cloud, each boosting twice the last.
    const chained = await flown("--autopilot 35 --day 9 --cloud 1 --chain 1");
    const [, longest] = chained.match(/^FLYOVER seconds .* clouds \d+ score \d+ longest (\d+)$/m) ?? [];
    const [, chainTop] = chained.match(/^FLYOVER highest (\d+) anchors \d+$/m) ?? [];
    assert.ok(Number(longest) >= 5 && Number(chainTop) > 50_000, `a chain of clouds leaves the air: ${chained}`);
    const tour = await flown("--autopilot 100 --day 9 --tour 2 --top 250000");
    const [, highest, anchors] = tour.match(/^FLYOVER highest (\d+) anchors (\d+)$/m) ?? [];
    const [, lit] = tour.match(/^FLYOVER frame \d+x\d+ sky \d+ colours (\d+)$/m) ?? [];
    assert.ok(Number(highest) > 150_000 && Number(anchors) >= 1 && Number(lit) > 60, `Voxel Flyover is left: ${tour}`);
    assert.deepEqual(errors, []);
    console.log(name, `pitch ${pitch}; clouds ${clouds}, chain of ${longest} to ${chainTop}`, ...report.match(/^FLYOVER (seconds|frame) .*$/gm), "tour:", ...tour.match(/^FLYOVER (seconds|frame|highest) .*$/gm));
    console.log(`godot-flyover: ${name} passed`);
  } finally {
    clearTimeout(deadline);
    await browser.close();
    await server.close();
  }
}
