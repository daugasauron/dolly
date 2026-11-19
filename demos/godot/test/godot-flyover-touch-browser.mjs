// Voxel Flyover's touch controls on gpu@0, on a real adapter, on the private X display DISPLAY
// names: Chrome on Vulkan with its own touch events (CDP), or the installed Firefox with the touch
// PointerEvents its touchscreen sends a page. A phone's screen held sideways: a tap takes the
// board; the left thumb holds the stick up and to the right while another finger drags the view
// round, so two fingers are down at once, and the board climbs (its nose up, the longer the steeper) and
// turns; two fingers moving apart zoom in. Then the phone upright: a tap takes the board and the ring at the top right
// gives it back. No key is pressed but the Q that ends each flight, whose report says what the
// fingers did (the game counts its touches: none is the page's pointer).
// Usage: node demos/godot/test/godot-flyover-touch-browser.mjs [chromium|firefox ...]
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { launchInstalledFirefox } from "../../../test/browser.mjs";
import { startBrowserServer } from "../../../test/browser-server.mjs";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const browsers = process.argv.length > 2 ? process.argv.slice(2) : ["chromium", "firefox"];
for (const name of browsers) {
  assert.ok(["chromium", "firefox"].includes(name));
  const server = await startBrowserServer(new URL("../../..", import.meta.url).pathname, "godot-voxel-flyover");
  const browser = name === "firefox"
    ? await launchInstalledFirefox()
    : await chromium.launch({ channel: "chrome", headless: false,
      args: ["--no-sandbox", "--ozone-platform=x11", "--enable-unsafe-webgpu", "--use-angle=vulkan", "--enable-features=Vulkan,VulkanFromANGLE",
        "--disable-vulkan-surface"] });
  const deadline = setTimeout(() => void browser.close(), 900_000);
  try {
    // One flight on a screen of that size: `play` moves the fingers, and the report is what Q prints.
    async function flight(viewport, play) {
      const context = await browser.newContext({ viewport, hasTouch: true }), page = await context.newPage(), errors = [];
      page.setDefaultTimeout(0);
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => { if (message.text().startsWith("Dolly GPU:")) errors.push(message.text()); });
      await page.goto(`${server.origin}/godot-voxel-flyover/`);
      await page.waitForFunction(() => window.__dolly?.gpu?.active && __dolly.gpu.stats.frames > 120, null, { polling: 250, timeout: 400_000 });
      assert.equal(await page.evaluate(() => __dolly.gpu.isFallbackAdapter), false);
      // The frame in the page: a screen on its side shows the game's 1920 by 1080 fitted into it; upright, the game fills it.
      const canvas = await page.locator("#display").boundingBox(), shape = viewport.width > viewport.height ? 1920 / 1080 : canvas.width / canvas.height;
      const wide = Math.min(canvas.width, canvas.height * shape), box = { x: canvas.x + (canvas.width - wide) / 2, y: canvas.y + (canvas.height - wide / shape) / 2, width: wide, height: wide / shape };
      const unit = Math.min(box.width, box.height);
      const cdp = name === "chromium" && await context.newCDPSession(page);
      // The fingers that are down, by their places in the page, in the order they went down.
      let down = [];
      async function fingers(next) {
        if (!next.length && !down.length) return;
        if (cdp) {
          const type = next.length > down.length ? "touchStart" : next.length < down.length ? "touchEnd" : "touchMove";
          await cdp.send("Input.dispatchTouchEvent", { type, touchPoints: next.map(([x, y], id) => ({ x, y, id })) });
        } else {
          const send = (type, [x, y], id) => page.evaluate(([type, x, y, id]) => document.querySelector("#display").dispatchEvent(
            new PointerEvent(type, { pointerId: 40 + id, pointerType: "touch", isPrimary: id === 0, button: 0, buttons: type === "pointerup" ? 0 : 1,
              pressure: type === "pointerup" ? 0 : 0.5, clientX: x, clientY: y, bubbles: true, cancelable: true })), [type, x, y, id]);
          for (let id = 0; id < Math.max(next.length, down.length); id++) {
            if (id >= down.length) await send("pointerdown", next[id], id);
            else if (id >= next.length) await send("pointerup", down[id], id);
            else if (next[id][0] !== down[id][0] || next[id][1] !== down[id][1]) await send("pointermove", next[id], id);
          }
        }
        down = next;
      }
      const at = (x, y) => [box.x + box.width * x, box.y + box.height * y];
      await play({ fingers, at, unit, sleep, shot: async label => process.env.DOLLY_TOUCH_SHOTS && void await page.screenshot({ path: `${process.env.DOLLY_TOUCH_SHOTS}/${name}-${viewport.width}-${label}.png` }) });
      await fingers([]);
      await page.keyboard.press("q");
      await page.evaluate(() => __dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "shell"));
      const report = await page.evaluate(() => __dolly.visibleTerminalText());
      const [, taken] = report.match(/^FLYOVER helm 1 pointer 0 heading (-?\d+) /m) ?? [];
      const [, helm, high, heading, view, zoom, touches] = report.match(
        /^FLYOVER flown \d+ clouds \d+ score \d+ helm (\d) high (-?\d+) heading (-?\d+) pitch -?\d+ view (-?\d+) -?\d+ speed \d+ zoom ([\d.]+) touches (\d+)$/m) ?? [];
      assert.deepEqual(errors, []);
      await context.close();
      // The heading's turn since the board was taken, the short way round.
      const turned = ((Number(heading) - Number(taken)) % 360 + 540) % 360 - 180;
      return { helm: Number(helm), high: Number(high), turned, zoom: Number(zoom), touches: Number(touches), view: Number(view), report };
    }

    // Sideways: the stick up and to the right for five seconds, and meanwhile a second finger drags the view.
    const sideways = await flight({ width: 844, height: 390 }, async ({ fingers, at, unit, sleep, shot }) => {
      await sleep(3000);
      await fingers([at(0.5, 0.5)]);
      await fingers([]);
      await sleep(500);
      const thumb = at(0.2, 0.7), pushed = [thumb[0] + unit * 0.08, thumb[1] - unit * 0.1];
      await fingers([thumb]);
      for (let step = 1; step <= 5; step++) await fingers([[thumb[0] + unit * 0.016 * step, thumb[1] - unit * 0.02 * step]]);
      await sleep(2500);
      const gaze = at(0.7, 0.5);
      await fingers([pushed, gaze]);
      for (let step = 1; step <= 10; step++) {
        await fingers([pushed, [gaze[0] + unit * 0.04 * step, gaze[1]]]);
        await sleep(40);
      }
      await sleep(2500);
      await shot("stick");
      await fingers([pushed]);
      await fingers([]);
      // Two fingers apart: closer in.
      const one = at(0.6, 0.5), two = at(0.7, 0.5);
      await fingers([one, two]);
      for (let step = 1; step <= 8; step++) {
        await fingers([[one[0] - unit * 0.03 * step, one[1]], [two[0] + unit * 0.03 * step, two[1]]]);
        await sleep(40);
      }
      await sleep(600);
    });
    // The stick's push right turns the board (0.34 radians a second at its push, some 100 degrees in the five
    // seconds), its push up climbs it from some 50 units, the drag turned the view, and the fingers apart zoomed in from 1.
    assert.ok(sideways.helm === 1 && sideways.high > 120 && sideways.turned >= 40 && sideways.turned <= 160 && Math.abs(sideways.view) >= 5 && sideways.zoom < 0.95 && sideways.touches >= 5,
      `fingers fly the board on a phone held sideways: ${sideways.report}`);

    // Upright: a tap takes the board, and the ring gives it back.
    const upright = await flight({ width: 390, height: 844 }, async ({ fingers, at, unit, sleep, shot }) => {
      await sleep(3000);
      await fingers([at(0.5, 0.5)]);
      await fingers([]);
      await sleep(1500);
      await shot("helm");
      await fingers([[at(1, 0)[0] - unit * 0.1, at(1, 0)[1] + unit * 0.1]]);
      await fingers([]);
      await sleep(1000);
    });
    assert.ok(upright.helm === 0 && upright.touches === 2, `the ring gives the board back on a phone held upright: ${upright.report}`);
    console.log(name, `sideways: high ${sideways.high} turned ${sideways.turned} view ${sideways.view} zoom ${sideways.zoom} touches ${sideways.touches}; upright: touches ${upright.touches}`);
    console.log(`godot-flyover-touch: ${name} passed`);
  } finally {
    clearTimeout(deadline);
    await browser.close();
    await server.close();
  }
}
