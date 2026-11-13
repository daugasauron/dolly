// Godot on x11-desktop, on a real adapter, on the private X display DISPLAY names: Chrome on
// Vulkan, or the installed Firefox (docs/gpu.md). From a fresh x11-desktop, amy installs the
// editor and Lantern Drift in xterm's shell; the game opens a window of its own on the X server,
// its frames read back from gpu@0 in their own colours, takes keys, and closes at twm's Delete.
// The editor opens the game's project in another window, which takes the pointer and closes the
// same way. The server ends, and the terminal's shell reads what they printed.
// Usage: node demos/godot/test/godot-x11-browser.mjs [chromium|firefox ...]
import assert from "node:assert/strict";
import { chromium, firefox } from "playwright-core";
import { startBrowserServer } from "../../../test/browser-server.mjs";
import { snapshotDisplay, waitForDisplay } from "../../browser.mjs";

const browsers = process.argv.length > 2 ? process.argv.slice(2) : ["chromium", "firefox"];
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
// How many pixels of a box of the X server's frame are not black.
const lit = (page, x, y, width, height) => snapshotDisplay(page).then(() => page.evaluate(([x, y, width, height]) => {
  const data = displaySnapshot.getContext("2d").getImageData(x, y, width, height).data;
  let count = 0;
  for (let i = 0; i < data.length; i += 4) count += data[i] + data[i + 1] + data[i + 2] > 30;
  return count;
}, [x, y, width, height]));
// The page shows the X frame scaled to the canvas: where it shows the frame's pixel (x, y).
const at = (page, x, y) => page.evaluate(([x, y]) => {
  const canvas = document.querySelector("#display"), bounds = canvas.getBoundingClientRect();
  const scale = Math.min(bounds.width / canvas.width, bounds.height / canvas.height);
  return [bounds.left + (bounds.width - canvas.width * scale) / 2 + (x + 0.5) * scale,
    bounds.top + (bounds.height - canvas.height * scale) / 2 + (y + 0.5) * scale];
}, [x, y]);
// twm's root menu, pressed on the root window: Delete, then a click on the window to close.
async function twmDelete(page, x, y) {
  await page.mouse.move(...await at(page, 1500, 60));
  await page.mouse.down();
  await sleep(1000);
  await page.mouse.move(...await at(page, 1500, 60 + 258), { steps: 10 });
  await sleep(300);
  await page.mouse.up();
  await sleep(500);
  await page.mouse.click(...await at(page, x, y));
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
    // xterm's window at +40+300 is drawn; the keyboard goes to the window under the pointer.
    await waitForDisplay(page, () => {
      const data = displaySnapshot.getContext("2d").getImageData(50, 330, 300, 100).data;
      let white = 0;
      for (let i = 0; i < data.length; i += 4) white += data[i] + data[i + 1] + data[i + 2] === 765;
      return white > 10000;
    }, null, { timeout: 120_000, polling: 100 });
    await page.mouse.move(...await at(page, 200, 450));
    await sleep(500);
    await type(page, "amy install godot-editor lantern-drift > /tmp/amy 2>&1; echo $? >> /tmp/amy; lantern-drift > /tmp/drift 2>&1 &\n");
    // The game's window, 1152 by 648, centred: its sky fills it once it draws.
    const started = performance.now();
    for (;;) {
      if (await lit(page, 300, 200, 1000, 500) > 300_000) break;
      assert.ok(performance.now() - started < 600_000, "Lantern Drift's window shows");
      await sleep(2000);
    }
    console.log(`godot-x11: ${name}: Lantern Drift's window drew ${((performance.now() - started) / 1000).toFixed(0)} s after the command`);
    // Its boot splash first, then the title over the islands.
    await sleep(60_000);
    const frames = () => page.evaluate(() => Number(document.documentElement.dataset.frameSequence ?? 0));
    const before = await frames();
    await sleep(5000);
    const rate = (await frames() - before) / 5;
    console.log(`godot-x11: ${name}: the X server showed ${rate.toFixed(1)} frames a second of the game`);
    if (name === "chromium") await page.screenshot({ path: `build/godot-x11-drift-${name}.png` });
    // Its sunset is warm: red and blue the way round Godot drew them.
    const [red, blue] = await snapshotDisplay(page).then(() => page.evaluate(() => {
      const data = displaySnapshot.getContext("2d").getImageData(300, 200, 1000, 500).data;
      let red = 0, blue = 0;
      for (let i = 0; i < data.length; i += 4) [red, blue] = [red + data[i], blue + data[i + 2]];
      return [red, blue];
    }));
    console.log(`godot-x11: ${name}: the game's window has ${(red / blue).toFixed(2)} times as much red as blue`);
    assert.ok(red > blue, "the game's colours are its own");
    // Keys reach it under the pointer: Enter starts the flight from the title.
    await page.mouse.move(...await at(page, 800, 450));
    await page.keyboard.press("Enter");
    await sleep(10_000);
    if (name === "chromium") await page.screenshot({ path: `build/godot-x11-flight-${name}.png` });
    await twmDelete(page, 800, 450);
    await sleep(10_000);

    // The editor on the game's project, in a window of its own.
    await page.mouse.move(...await at(page, 200, 450));
    await sleep(500);
    await type(page, "cp -r /usr/share/lantern-drift/project /tmp/drift-project; godot-editor -e --path /tmp/drift-project > /tmp/editor 2>&1 &\n");
    const opened = performance.now();
    for (;;) {
      if (await lit(page, 300, 200, 1000, 500) > 300_000) break;
      assert.ok(performance.now() - opened < 300_000, "the editor's window shows");
      await sleep(2000);
    }
    await sleep(45_000);
    console.log(`godot-x11: ${name}: the editor's window drew ${((performance.now() - opened) / 1000).toFixed(0)} s after the command`);
    if (name === "chromium") await page.screenshot({ path: `build/godot-x11-editor-${name}.png` });
    await twmDelete(page, 800, 450);
    await sleep(15_000);
    await page.mouse.move(...await at(page, 200, 450));
    await sleep(500);
    await type(page, "kill $(cat /tmp/.X0-pid)\n");
    await page.evaluate(() => __dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "shell"));
    const run = async command => assert.equal(await page.evaluate(text => __dolly.submit(text), command), 0, command);
    await run("grep -q 'godot-editor installed' /tmp/amy && tail -n 1 /tmp/amy | grep -qx 0");
    await run("grep -q '^Godot Engine v' /tmp/drift && grep -q '^Godot Engine v' /tmp/editor");
    await run("! grep -E '^ERROR' /tmp/drift /tmp/editor");
    assert.deepEqual(errors, [], `${name}: no WebGPU or page errors`);
    console.log(`godot-x11: ${name} passed`);
  } finally {
    clearTimeout(deadline);
    await browser.close();
    await server.close();
  }
}
