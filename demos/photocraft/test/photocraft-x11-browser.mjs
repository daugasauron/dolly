// PhotoCraft on x11-desktop, on a real adapter, on the private X display DISPLAY names: Chrome on
// Vulkan, or the installed Firefox (docs/gpu.md). From a fresh x11-desktop, amy installs
// PhotoCraft in xterm's shell, and it opens the Great Wave in a window of its own on the X server,
// its frames read back from gpu@0; the window takes the pointer (a menu opens) and keys (Ctrl+I
// inverts the picture), moves with its title bar and closes at twm's Delete. The server ends, and
// the terminal's shell reads what it printed.
// Usage: [DOLLY_BROWSER=firefox] node demos/photocraft/test/photocraft-x11-browser.mjs
import assert from "node:assert/strict";
import { chromium, firefox } from "playwright-core";
import { startBrowserServer } from "../../../test/browser-server.mjs";
import { browsers } from "../../browsers.mjs";
import { snapshotDisplay, waitForDisplay } from "../../browser.mjs";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
// Types text as a person does on a US keyboard: X maps keys, not characters.
const shifted = { ">": "Period", "$": "Digit4", "(": "Digit9", ")": "Digit0", "&": "Digit7", "|": "Backslash", "_": "Minus", "?": "Slash" };
async function type(page, text) {
  for (const character of text) {
    if (shifted[character]) await page.keyboard.press(`Shift+${shifted[character]}`);
    else if (/[A-Z]/.test(character)) await page.keyboard.press(`Shift+Key${character}`);
    else await page.keyboard.press(character === " " ? "Space" : character === "\n" ? "Enter" : character);
  }
}
// A box of the X server's frame: how many pixels are not black, and a digest of them all.
const region = (page, x, y, width, height) => snapshotDisplay(page).then(() => page.evaluate(([x, y, width, height]) => {
  const data = displaySnapshot.getContext("2d").getImageData(x, y, width, height).data;
  let lit = 0, digest = 0;
  for (let i = 0; i < data.length; i += 4) {
    lit += data[i] + data[i + 1] + data[i + 2] > 30;
    digest = (digest * 31 + data[i] + 7 * data[i + 1] + 13 * data[i + 2]) >>> 0;
  }
  return { lit, digest };
}, [x, y, width, height]));
// Where the page shows the X frame's pixel (x, y).
const at = (page, x, y) => page.evaluate(([x, y]) => {
  const canvas = document.querySelector("#display"), bounds = canvas.getBoundingClientRect();
  const scale = Math.min(bounds.width / canvas.width, bounds.height / canvas.height);
  return [bounds.left + (bounds.width - canvas.width * scale) / 2 + (x + 0.5) * scale,
    bounds.top + (bounds.height - canvas.height * scale) / 2 + (y + 0.5) * scale];
}, [x, y]);
// Until a box of the frame changes from what it was.
async function changes(page, box, before, timeout) {
  const started = performance.now();
  for (;;) {
    const now = await region(page, ...box);
    if (now.digest !== before.digest) return now;
    assert.ok(performance.now() - started < timeout, `the frame changes at ${box}`);
    await sleep(500);
  }
}

for (const name of browsers) {
  assert.ok(["chromium", "firefox"].includes(name));
  const server = await startBrowserServer(new URL("../../..", import.meta.url).pathname, "x11-desktop");
  const browser = name === "firefox"
    ? await firefox.launch({ channel: "moz-firefox", headless: false, firefoxUserPrefs: { "dom.webgpu.enabled": true } })
    : await chromium.launch({ channel: "chrome", headless: false,
      args: ["--no-sandbox", "--ozone-platform=x11", "--enable-unsafe-webgpu", "--use-angle=vulkan", "--enable-features=Vulkan,VulkanFromANGLE"] });
  const deadline = setTimeout(() => void browser.close(), 1_200_000);
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } }), errors = [];
    page.setDefaultTimeout(0);
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.text().startsWith("Dolly GPU:")) errors.push(message.text()); });
    await page.addInitScript(policy => { globalThis.DOLLY_HTTP_POLICY = policy; },
      { rules: [{ origin: server.origin, path: "/amy-index.txt", methods: ["GET"] }] });
    await page.goto(`${server.origin}/x11-desktop/`);
    await page.waitForFunction(() => document.documentElement.dataset.dollyStatus === "ready", null, { timeout: 180_000 });
    await page.waitForFunction(() => __dolly.transport.graphicsActive() && document.querySelector("#display").width === 1600,
      null, { timeout: 120_000, polling: 100 });
    await waitForDisplay(page, () => {
      const data = displaySnapshot.getContext("2d").getImageData(50, 330, 300, 100).data;
      let white = 0;
      for (let i = 0; i < data.length; i += 4) white += data[i] + data[i + 1] + data[i + 2] === 765;
      return white > 10000;
    }, null, { timeout: 120_000, polling: 100 });
    await page.mouse.move(...await at(page, 200, 450));
    await sleep(500);
    await type(page, "amy install photocraft > /tmp/amy 2>&1; echo $? >> /tmp/amy; photocraft /usr/share/photocraft/pictures/great-wave.jpg > /tmp/photocraft 2>&1 &\n");
    // Its window, 1440 by 900 at the screen's top, under twm's title bar: the picture fills its
    // middle once it draws.
    const picture = [560, 300, 480, 300];
    const started = performance.now();
    for (;;) {
      if ((await region(page, ...picture)).lit > 100_000) break;
      assert.ok(performance.now() - started < 900_000, "PhotoCraft's window shows");
      await sleep(2000);
    }
    await sleep(15_000);
    console.log(`photocraft-x11: ${name}: PhotoCraft's window drew ${((performance.now() - started) / 1000).toFixed(0)} s after the command`);
    if (name === "chromium") await page.screenshot({ path: `build/photocraft-x11-${name}.png` });
    // Keys reach it under the pointer: Ctrl+I inverts the picture.
    await page.mouse.move(...await at(page, 800, 450));
    const shown = await region(page, ...picture);
    const pressed = performance.now();
    await page.keyboard.press("Control+i");
    await changes(page, picture, shown, 60_000);
    console.log(`photocraft-x11: ${name}: the inverted picture showed ${(performance.now() - pressed).toFixed(0)} ms after Ctrl+I`);
    // A drag of its title bar moves it 200 pixels left.
    await page.mouse.move(...await at(page, 800, 10));
    await page.mouse.down();
    for (let step = 1; step <= 20; step++) {
      await page.mouse.move(...await at(page, 800 - step * 10, 10));
      await sleep(30);
    }
    await page.mouse.up();
    await sleep(3000);
    if (name === "chromium") await page.screenshot({ path: `build/photocraft-x11-moved-${name}.png` });
    // twm's Delete closes it: the window manager asks, and PhotoCraft asks whether to save.
    await page.mouse.move(...await at(page, 1550, 60));
    await page.mouse.down();
    await sleep(1000);
    await page.mouse.move(...await at(page, 1550, 60 + 258), { steps: 10 });
    await sleep(300);
    await page.mouse.up();
    await sleep(500);
    await page.mouse.click(...await at(page, 600, 450));
    await sleep(5000);
    await page.keyboard.press("n");
    await sleep(10_000);
    await page.mouse.move(...await at(page, 200, 450));
    await sleep(500);
    await type(page, "kill $(cat /tmp/.X0-pid)\n");
    await page.evaluate(() => __dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "shell"));
    const run = async command => assert.equal(await page.evaluate(text => __dolly.submit(text), command), 0, command);
    await run("grep -q 'photocraft installed' /tmp/amy && tail -n 1 /tmp/amy | grep -qx 0");
    await run("! grep -q panicked /tmp/photocraft");
    assert.deepEqual(errors, [], `${name}: no WebGPU or page errors`);
    console.log(`photocraft-x11: ${name} passed`);
  } finally {
    clearTimeout(deadline);
    await browser.close();
    await server.close();
  }
}
