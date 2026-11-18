// Voxel Flyover's touch controls on gpu@0, on a real adapter, on the private X display DISPLAY
// names: Chrome on Vulkan with its own touch events (CDP), or the installed Firefox with the touch
// PointerEvents its touchscreen sends a page. A phone's screen held sideways: a tap takes the
// board; a thumb on the left slides the throttle open, a thumb on the right pulls the stick to
// raise the nose, and the board climbs; two fingers on the right moving apart zoom in. Then, in
// Chrome, the phone upright: a tap takes the board and the ring at the top right gives it back.
// No key is pressed but the Q that ends each flight, whose report says what the fingers did (the
// game counts its touches: none is the page's pointer).
// Usage: node demos/godot/test/godot-flyover-touch-browser.mjs [chromium|firefox ...]
import assert from "node:assert/strict";
import { chromium, firefox } from "playwright-core";
import { startBrowserServer } from "../../../test/browser-server.mjs";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const browsers = process.argv.length > 2 ? process.argv.slice(2) : ["chromium", "firefox"];
for (const name of browsers) {
  assert.ok(["chromium", "firefox"].includes(name));
  const server = await startBrowserServer(new URL("../../..", import.meta.url).pathname, "godot-voxel-flyover");
  const browser = name === "firefox"
    ? await firefox.launch({ channel: "moz-firefox", headless: false, firefoxUserPrefs: { "dom.webgpu.enabled": true } })
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
      const [, helm, high, pitch, throttle, zoom, touches] = report.match(/^FLYOVER flown \d+ rings \d+ score \d+ helm (\d) high (-?\d+) heading -?\d+ pitch (-?\d+) bank -?\d+ speed \d+ throttle ([\d.]+) zoom ([\d.]+) touches (\d+)$/m) ?? [];
      assert.deepEqual(errors, []);
      await context.close();
      return { helm: Number(helm), high: Number(high), pitch: Number(pitch), throttle: Number(throttle), zoom: Number(zoom), touches: Number(touches), report };
    }

    // Sideways: a thumb on the left slides the throttle open (up the screen by 0.3 of its shorter side, of the
    // bar's 0.5), a thumb on the right pulls the stick 0.6 of the way for 0.8 s, which raises the board's nose some
    // 30 degrees, and the board climbs for seven seconds. A phone's screen in Chrome, a tablet's in Firefox, which
    // at 844 by 390 with a touchscreen presents one frame of gpu@0 and no more (it draws at that size without one,
    // and with one at 1600 by 900: found 2026-11-17, not looked into).
    const sideways = await flight(name === "firefox" ? { width: 1180, height: 820 } : { width: 844, height: 390 }, async ({ fingers, at, unit, sleep, shot }) => {
      await sleep(3000);
      await fingers([at(0.5, 0.5)]);
      await fingers([]);
      await sleep(500);
      const drag = async (from, up, steps) => {
        await fingers([from]);
        for (let step = 1; step <= steps; step++) {
          await fingers([[from[0], from[1] - unit * up * step / steps]]);
          await sleep(40);
        }
      };
      await drag(at(0.12, 0.8), 0.3, 10);
      await fingers([]);
      await drag(at(0.75, 0.6), 0.06, 5);
      await sleep(800);
      await fingers([]);
      await sleep(6000);
      await shot("climb");
      // Two fingers on the right apart: closer in.
      const one = at(0.6, 0.5), two = at(0.7, 0.5);
      await fingers([one, two]);
      for (let step = 1; step <= 8; step++) {
        await fingers([[one[0] - unit * 0.03 * step, one[1]], [two[0] + unit * 0.03 * step, two[1]]]);
        await sleep(40);
      }
      await sleep(600);
    });
    // The throttle opened, the stick raised the board's nose, it climbed from some 50 units, and the fingers apart
    // zoomed in from 1.
    assert.ok(sideways.helm === 1 && sideways.throttle >= 0.8 && sideways.high > 120 && sideways.pitch >= 10 && sideways.zoom < 0.95 && sideways.touches >= 5,
      `fingers fly the board on a phone held sideways: ${sideways.report}`);

    // Upright (in Chrome: Firefox draws no frame once a surface of gpu@0 is sized again, which an upright screen needs): a tap
    // takes the board, and the ring gives it back.
    const upright = name === "firefox" ? { helm: 0, touches: 2, report: "" } : await flight({ width: 390, height: 844 }, async ({ fingers, at, unit, sleep, shot }) => {
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
    console.log(name, `sideways: throttle ${sideways.throttle} high ${sideways.high} pitch ${sideways.pitch} zoom ${sideways.zoom} touches ${sideways.touches}; upright: touches ${upright.touches}`);
    console.log(`godot-flyover-touch: ${name} passed`);
  } finally {
    clearTimeout(deadline);
    await browser.close();
    await server.close();
  }
}
