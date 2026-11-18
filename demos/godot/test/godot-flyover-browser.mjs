// Voxel Flyover on gpu@0, on a real adapter, on the private X display DISPLAY names: Chrome on
// Vulkan, or the installed Firefox (docs/gpu.md). The front page lists godot-voxel-flyover among
// its applications, and its link starts the game on the page. A click gives the game the pointer
// and the player the board: the mouse pushed forward raises the board's nose and W opens the
// throttle, which the Q that leaves the shell prints. There the game flies itself through a
// morning and reports: its flyer flew through rings along their courses, so the ground the script
// flies over is the ground the shaders draw on the sphere, its frame has the sky along the top and
// a scene's worth of colours, and few of its frames took over twice the median, fewer over four
// times. Started before a course's last ring and headed against the course's way, it passes rings: a
// ring counts from either side. Then it leaves the planet by itself: it reports a height of over
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
    // A person's click captures the pointer; 240 pixels up then push the stick back (the nose rises), and W held
    // opens the throttle.
    const box = await page.locator("#display").boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2;
    await page.mouse.click(x, y);
    await page.waitForFunction(() => document.pointerLockElement?.id === "display", null, { timeout: 10_000 });
    await new Promise(resolve => setTimeout(resolve, 1000));
    await page.mouse.move(x, y - 240, { steps: 30 });
    await page.keyboard.down("w");
    await new Promise(resolve => setTimeout(resolve, 2000));
    await page.keyboard.up("w");
    await page.keyboard.press("q");
    await page.evaluate(() => __dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "shell"));
    const flight = await page.evaluate(() => __dolly.visibleTerminalText());
    const [, helm, pitch, throttle] = flight.match(/^FLYOVER flown \d+ rings \d+ score \d+ helm (\d) high -?\d+ heading -?\d+ pitch (-?\d+) bank -?\d+ speed \d+ throttle ([\d.]+) zoom [\d.]+ touches \d+$/m) ?? [];
    // A pixel of the motion the page is given pitches the nose 0.0024 radians, so 240 pixels raise it some 33 degrees
    // from the few the corgi flew at when the board was taken. Firefox gives the moves (2026-11-18: 216 of the 240) after
    // a jump that the game leaves (320 and 115 pixels for the first move of 8). The throttle opens by half of all of it a
    // second, so two seconds open it whole from where the corgi had it (2026-11-18 in Firefox: 0.14).
    assert.ok(helm === "1" && Number(pitch) >= 8 && Number(pitch) <= 80 && Number(throttle) >= 0.9, `the captured mouse and the keys fly the board: ${flight}`);
    assert.equal(await page.evaluate(() => document.pointerLockElement), null, "the pointer is the page's again once the game has quit");
    const run = async command => assert.equal(await page.evaluate(text => __dolly.submit(text), command), 0, command);
    const flown = async options => {
      await run(`voxel-flyover -- ${options} > /tmp/flyover.out 2>&1`);
      await run("! grep -qE 'refused a batch|SCRIPT ERROR|SHADER ERROR' /tmp/flyover.out");
      await run("clear; grep '^FLYOVER ' /tmp/flyover.out");
      return page.evaluate(() => __dolly.visibleTerminalText());
    };
    const passed = report => (report.match(/^FLYOVER seconds .* rings (\d+) against (\d+) score \d+ longest \d+$/m) ?? []).slice(1).map(Number);
    const report = await flown("--autopilot 30 --day 9");
    assert.match(report, /^FLYOVER adapter WebGPU forward_plus$/m);
    const [, fps, rings] = report.match(/^FLYOVER seconds [\d.]+ frames \d+ fps ([\d.]+) gpu [\d.]+ cpu [\d.]+ flown \d+ rings (\d+) against \d+ score \d+ longest \d+$/m) ?? [];
    const [, median, late, long] = report.match(/^FLYOVER frame times median ([\d.]+) p95 [\d.]+ p99 [\d.]+ max [\d.]+ over2x (\d+) over4x (\d+)$/m) ?? [];
    const [, sky, colours] = report.match(/^FLYOVER frame \d+x\d+ sky (\d+) colours (\d+)$/m) ?? [];
    // A frame low over the land had 500 colours and more; one that looked down through the haze after a chain that
    // climbed to 300 units had 65 (2026-11-18): over 60, as the tour asks of the planet seen from space.
    assert.ok(Number(fps) >= 10 && Number(rings) >= 1 && Number(sky) > 100 && Number(colours) > 60, `Voxel Flyover flies and draws: ${report}`);
    // Of some 1,700 frames, a display's frame apart on a quiet machine: one in six may miss a display's
    // frame on a loaded one, and few stand for four.
    assert.ok(Number(median) > 0 && Number(late) <= 300 && Number(long) <= 30, `Voxel Flyover's frames are even: ${report}`);
    // A ring counts from either side: the morning flight passes rings along their course's way (the climb by the
    // start), and a flight started before a course's last ring, headed through it against the course's way,
    // passes rings against it.
    const [morning, morningAgainst] = passed(report);
    const [, back] = passed(await flown("--autopilot 6 --day 9 --ring -1"));
    assert.ok(morning - morningAgainst >= 1 && back >= 1, `a ring counts from either side: the morning's ${morning} rings, ${morningAgainst} against; headed against, ${back}`);
    const tour = await flown("--autopilot 100 --day 9 --tour 2 --top 250000");
    const [, highest, anchors] = tour.match(/^FLYOVER highest (\d+) anchors (\d+)$/m) ?? [];
    const [, lit] = tour.match(/^FLYOVER frame \d+x\d+ sky \d+ colours (\d+)$/m) ?? [];
    assert.ok(Number(highest) > 150_000 && Number(anchors) >= 1 && Number(lit) > 60, `Voxel Flyover is left: ${tour}`);
    assert.deepEqual(errors, []);
    console.log(name, `pitch ${pitch} throttle ${throttle}; rings along ${morning - morningAgainst}, against ${back}`, ...report.match(/^FLYOVER (seconds|frame) .*$/gm), "tour:", ...tour.match(/^FLYOVER (seconds|frame|highest) .*$/gm));
    console.log(`godot-flyover: ${name} passed`);
  } finally {
    clearTimeout(deadline);
    await browser.close();
    await server.close();
  }
}
