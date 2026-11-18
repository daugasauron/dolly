// Voxel Flyover on gpu@0, on a real adapter, on the private X display DISPLAY names: Chrome on
// Vulkan, or the installed Firefox (docs/gpu.md). The front page lists godot-voxel-flyover among
// its applications, and its link starts the game on the page. Enter gives the player the board, a click the game the
// pointer, and the mouse then turns the view and leaves the heading; L gives the pointer back. A click again, and D
// turns the board right and W raises its nose to almost straight up, which the Q that leaves the shell prints, with the
// view. There the game flies itself through a
// morning from before a chain's first cloud and reports: its flyer flew through it, so the ground the
// script flies over is the ground the shaders draw on the sphere, its frame has the sky along the top
// and a scene's worth of colours, and few of its frames took over twice the median, fewer over four
// times. Flying on through the chain as a quick hand would, it chains five clouds or six and is over
// the air (50,000 units). It flies by itself to the moon, low over its ground, and back to the
// planet's. Then it leaves the planet by itself: it reports a height of over
// 150,000 units, a chart whose anchor moved on the way, and a frame with a scene's worth of colours
// (the planet under it). Chrome shows its frames on the X display by copies
// (--disable-vulkan-surface): its Vulkan swapchain there shows a full-screen page at half the
// display's rate, whatever the page draws.
// Usage: [DOLLY_BROWSER=firefox] node demos/godot/test/godot-flyover-browser.mjs
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { launchInstalledFirefox } from "../../../test/browser.mjs";
import { startBrowserServer } from "../../../test/browser-server.mjs";
import { browsers } from "../../browsers.mjs";

for (const name of browsers) {
  assert.ok(["chromium", "firefox"].includes(name));
  const server = await startBrowserServer(new URL("../../..", import.meta.url).pathname, "godot-voxel-flyover");
  const browser = name === "firefox"
    ? await launchInstalledFirefox()
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
    // Enter takes the board, and the corgi's turn wears off. A person's click captures the pointer, the mouse moves
    // 300 pixels right, and L gives the pointer back: the game prints the heading and the view at each change of hands.
    const box = await page.locator("#display").boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2;
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const capture = async () => {
      await page.mouse.click(x, y);
      await page.waitForFunction(() => document.pointerLockElement?.id === "display", null, { timeout: 10_000 });
      await sleep(1000);
    };
    await page.keyboard.press("Enter");
    await sleep(3000);
    await capture();
    await page.mouse.move(x + 300, y, { steps: 30 });
    await sleep(1000);
    await page.keyboard.press("l");
    await page.waitForFunction(() => document.pointerLockElement === null, null, { timeout: 10_000 });
    await sleep(1500);
    // A click again, D held for two seconds, and W for three, until the Q.
    await capture();
    await page.keyboard.down("d");
    await sleep(2000);
    await page.keyboard.up("d");
    await page.keyboard.down("w");
    await sleep(3000);
    await page.keyboard.press("q");
    await page.keyboard.up("w");
    await page.evaluate(() => __dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "shell"));
    const flight = await page.evaluate(() => __dolly.visibleTerminalText());
    const hands = [...flight.matchAll(/^FLYOVER helm (\d) pointer (\d) heading (-?\d+) pitch -?\d+ view (-?\d+) -?\d+$/gm)]
      .map(([, helm, pointer, heading, view]) => ({ helm, pointer, heading: Number(heading), view: Number(view) }));
    const [, helm, heading, pitch] = flight.match(/^FLYOVER flown \d+ clouds \d+ score \d+ helm (\d) high -?\d+ heading (-?\d+) pitch (-?\d+) view -?\d+ -?\d+ speed \d+ zoom [\d.]+ touches \d+$/m) ?? [];
    const turned = (from, to) => ((to - from) % 360 + 540) % 360 - 180;
    // The view turns 0.0035 radians a pixel of the motion the page is given: 60 degrees for the 300 pixels, less in
    // Firefox, which gives the moves (2026-11-18: 216 of 240) after a jump that the game leaves (320 and 115 pixels for
    // the first move of 8). The heading the mouse leaves as it was.
    const taken = hands.find(change => change.pointer === "1"), freed = hands.slice(hands.indexOf(taken)).find(change => change.helm === "0");
    assert.ok(taken && freed && freed.view >= 40 && freed.view <= 65 && Math.abs(turned(taken.heading, freed.heading)) <= 2,
      `the mouse turns the view, not the heading: ${flight}`);
    // From the board taken again, D turns the heading right, 0.55 radians a second once the turn is in (some 60 degrees
    // for the two seconds); W raises the nose to 86 degrees, no further.
    const retaken = hands.slice(hands.indexOf(freed)).find(change => change.helm === "1"), right = retaken && turned(retaken.heading, Number(heading));
    assert.ok(helm === "1" && right >= 30 && right <= 90 && Number(pitch) >= 80 && Number(pitch) <= 86,
      `D turns the board and W raises its nose to almost straight up: ${flight}`);
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
    // The moon: out toward it, a crossing into its chart, down to fly low over its ground, out again, a crossing
    // back, and down to the planet's.
    const voyage = await flown("--autopilot 80 --day 9 --moon 2");
    const [, crossed, overMoon, overHome] = voyage.match(/^FLYOVER moon crossings (\d+) lowest (\d+) home (\d+)$/m) ?? [];
    assert.ok(Number(crossed) === 2 && Number(overMoon) < 200 && Number(overHome) < 200, `the moon is flown to and back: ${voyage}`);
    const tour = await flown("--autopilot 100 --day 9 --tour 2 --top 250000");
    const [, highest, anchors] = tour.match(/^FLYOVER highest (\d+) anchors (\d+)$/m) ?? [];
    const [, lit] = tour.match(/^FLYOVER frame \d+x\d+ sky \d+ colours (\d+)$/m) ?? [];
    assert.ok(Number(highest) > 150_000 && Number(anchors) >= 1 && Number(lit) > 60, `Voxel Flyover is left: ${tour}`);
    assert.deepEqual(errors, []);
    console.log(name, `view ${freed.view}, heading ${taken.heading} to ${freed.heading}, turned right ${right}, pitch ${pitch}; clouds ${clouds}, chain of ${longest} to ${chainTop}; moon: crossings ${crossed}, over it ${overMoon}, over home ${overHome}`, ...report.match(/^FLYOVER (seconds|frame) .*$/gm), "tour:", ...tour.match(/^FLYOVER (seconds|frame|highest) .*$/gm));
    console.log(`godot-flyover: ${name} passed`);
  } finally {
    clearTimeout(deadline);
    await browser.close();
    await server.close();
  }
}
