// The x11-desktop image: Xsdl takes Dolly's display and twm frames xclock,
// xeyes and xterm in windows of their own. The page's pointer reaches them
// (xeyes' pupils follow it, a drag of a title bar moves the clock's window,
// twm's menu starts another xterm) and its keyboard reaches the shell in
// xterm, which starts Dear ImGui's
// example in a window of its own (SDL2's X11 driver), installs tmux with amy
// and runs a command in its pane, writes a file and ends the server; the
// terminal's shell then reads them and finds tmux's server. Prints the time to
// the first window, a drag's frames and ImGui's frames.
// Usage: node demos/x11/test/x11-browser.mjs [chromium|firefox ...]
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { delay, demoTest, shellPrompt } from "../../browser.mjs";

const evidence = new URL("../../../build/x11-evidence/", import.meta.url).pathname;
const width = 1600, height = 900;

// The frame's pixels in a box: how many are not the root window's black, and
// a digest that changes with any of them.
const region = (page, x, y, w, h) => page.evaluate(([x, y, w, h]) => {
  const data = document.querySelector("#display").getContext("2d").getImageData(x, y, w, h).data;
  let lit = 0, digest = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] + data[i + 1] + data[i + 2] > 0) lit++;
    digest = (digest * 31 + data[i] + 7 * data[i + 1] + 13 * data[i + 2]) >>> 0;
  }
  return { lit, digest };
}, [x, y, w, h]);
// Page coordinates of a frame pixel: the canvas is scaled to the page.
async function at(page, x, y) {
  const box = await page.locator("#display").boundingBox();
  return [box.x + (x + 0.5) * box.width / width, box.y + (y + 0.5) * box.height / height];
}
const frameSequence = page => page.evaluate(() => Number(document.documentElement.dataset.frameSequence ?? 0));
// Types text as a person does on a US keyboard: X maps keys, not characters,
// so a shifted character is Shift and its key.
const shifted = { ">": "Period", "$": "Digit4", "(": "Digit9", ")": "Digit0", "&": "Digit7", "?": "Slash" };
async function type(page, text) {
  for (const character of text) {
    if (shifted[character]) await page.keyboard.press(`Shift+${shifted[character]}`);
    else if (/[A-Z]/.test(character)) await page.keyboard.press(`Shift+Key${character}`);
    else await page.keyboard.press(character === " " ? "Space" : character === "\n" ? "Enter" : character);
  }
}

const browsers = process.argv.length > 2 ? process.argv.slice(2) : ["chromium"];
for (const browser of browsers) await demoTest("x11", { image: "x11-desktop", timeout: 600_000, browser }, async ({ server: site, open }) => {
  await mkdir(evidence, { recursive: true });
  const started = performance.now();
  const { page, run, prompt } = await open({ prompt: null,
    policy: { rules: [{ origin: site.origin, path: "/amy-index.txt", methods: ["GET"] }] } });
  const booted = performance.now();
  // The server's frame: 1600x900 once it holds the display.
  await page.waitForFunction(([width, height]) => __dolly.transport.graphicsActive() &&
    document.querySelector("#display").width === width && document.querySelector("#display").height === height,
  [width, height], { timeout: 120_000, polling: 50 });
  const server = performance.now();
  // xclock's window, framed by twm at +40+40: its face is drawn inside.
  await page.waitForFunction(() => {
    const data = document.querySelector("#display").getContext("2d").getImageData(60, 80, 140, 140).data;
    let lit = 0;
    for (let i = 0; i < data.length; i += 4) lit += data[i] + data[i + 1] + data[i + 2] > 0;
    return lit > 1000;
  }, null, { timeout: 120_000, polling: 50 });
  const firstWindow = performance.now();
  // Both windows are up: xeyes' at +260+40 has its eyes drawn too.
  await page.waitForFunction(() => {
    const data = document.querySelector("#display").getContext("2d").getImageData(270, 70, 220, 120).data;
    let lit = 0;
    for (let i = 0; i < data.length; i += 4) lit += data[i] + data[i + 1] + data[i + 2] > 0;
    return lit > 4000;
  }, null, { timeout: 60_000, polling: 50 });
  await page.screenshot({ path: `${evidence}${browser}-desktop.png` });
  console.log(`x11 ${browser}: page ready ${((booted - started) / 1000).toFixed(1)}s, X server's frame ` +
    `${((server - started) / 1000).toFixed(1)}s, first window ${((firstWindow - started) / 1000).toFixed(1)}s after navigation`);

  // The pointer reaches the server: xeyes' pupils follow it.
  const eyes = await region(page, 270, 70, 220, 120);
  const moved = performance.now();
  await page.mouse.move(...await at(page, 900, 600), { steps: 4 });
  await page.waitForFunction(([before]) => {
    const data = document.querySelector("#display").getContext("2d").getImageData(270, 70, 220, 120).data;
    let digest = 0;
    for (let i = 0; i < data.length; i += 4) digest = (digest * 31 + data[i] + 7 * data[i + 1] + 13 * data[i + 2]) >>> 0;
    return digest !== before;
  }, [eyes.digest], { timeout: 30_000, polling: 10 });
  console.log(`x11 ${browser}: xeyes followed the pointer in ${(performance.now() - moved).toFixed(0)} ms`);

  // A drag of xclock's title bar: twm draws the outline while the button is
  // held and moves the window 600 pixels right on release.
  const clockBefore = await region(page, 60, 80, 140, 140);
  assert.ok(clockBefore.lit > 1000);
  await page.mouse.move(...await at(page, 150, 51));
  await page.mouse.down();
  const frames = await frameSequence(page);
  const dragStarted = performance.now();
  for (let step = 1; step <= 30; step++) {
    await page.mouse.move(...await at(page, 150 + step * 20, 51));
    await delay(16);
  }
  const dragFrames = await frameSequence(page) - frames, dragSeconds = (performance.now() - dragStarted) / 1000;
  await page.screenshot({ path: `${evidence}${browser}-drag.png` });
  const released = performance.now();
  await page.mouse.up();
  await page.waitForFunction(() => {
    const data = document.querySelector("#display").getContext("2d").getImageData(660, 80, 140, 140).data;
    let lit = 0;
    for (let i = 0; i < data.length; i += 4) lit += data[i] + data[i + 1] + data[i + 2] > 0;
    return lit > 1000;
  }, null, { timeout: 30_000, polling: 10 });
  const placed = performance.now() - released;
  assert.ok((await region(page, 60, 80, 140, 140)).lit < 100, "the clock's old place is the root's again");
  await page.screenshot({ path: `${evidence}${browser}-moved.png` });
  console.log(`x11 ${browser}: a ${dragSeconds.toFixed(1)}-second drag showed ${dragFrames} frames (${(dragFrames / dragSeconds).toFixed(0)}/s); ` +
    `the window was drawn in its new place ${placed.toFixed(0)} ms after release`);

  // The keyboard: twm gives xterm the focus under the pointer, and its shell
  // runs what is typed, then ends the X server.
  await page.mouse.move(...await at(page, 200, 450));
  await delay(300);
  // A key's echo: from the press to the frame that shows it.
  const line = await region(page, 40, 320, 500, 20);
  const pressed = performance.now();
  await page.keyboard.press("e");
  await page.waitForFunction(([before]) => {
    const data = document.querySelector("#display").getContext("2d").getImageData(40, 320, 500, 20).data;
    let digest = 0;
    for (let i = 0; i < data.length; i += 4) digest = (digest * 31 + data[i] + 7 * data[i + 1] + 13 * data[i + 2]) >>> 0;
    return digest !== before;
  }, [line.digest], { timeout: 30_000, polling: 10 });
  console.log(`x11 ${browser}: a key typed into xterm was shown ${(performance.now() - pressed).toFixed(0)} ms after its press`);
  await type(page, "cho typed in xterm > /tmp/xterm-typed\n");
  await page.screenshot({ path: `${evidence}${browser}-xterm.png` });

  // twm's root menu starts another xterm (upstream's "exec xterm &"), which
  // outlives the shell that started it; twm places it where the pointer clicks.
  await page.mouse.move(...await at(page, 1200, 100));
  await page.mouse.down();
  await delay(1000);
  await page.mouse.move(...await at(page, 1200, 306), { steps: 10 });
  await delay(300);
  await page.mouse.up();
  await page.mouse.move(...await at(page, 900, 450), { steps: 10 });
  await page.waitForFunction(() => {
    const data = document.querySelector("#display").getContext("2d").getImageData(895, 500, 10, 240).data;
    for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] > 0) return true;
    return false;
  }, null, { timeout: 60_000, polling: 50 });
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForFunction(() => {
    const data = document.querySelector("#display").getContext("2d").getImageData(950, 520, 300, 200).data;
    let white = 0;
    for (let i = 0; i < data.length; i += 4) white += data[i] + data[i + 1] + data[i + 2] === 765;
    return white > 50000;
  }, null, { timeout: 30_000, polling: 50 });
  await page.mouse.move(...await at(page, 1100, 650));
  await delay(300);
  await type(page, "echo from the menu > /tmp/menu-xterm\n");
  await page.screenshot({ path: `${evidence}${browser}-menu-xterm.png` });

  // ImGui's example, centred, 1280x800: its clear colour (0.45, 0.55, 0.60)
  // fills what its own windows leave, below the first of them.
  await type(page, "imgui-x11 &\n");
  await page.waitForFunction(() => {
    const data = document.querySelector("#display").getContext("2d").getImageData(300, 500, 300, 150).data;
    let clear = 0;
    for (let i = 0; i < data.length; i += 4) {
      clear += Math.abs(data[i] - 115) < 3 && Math.abs(data[i + 1] - 140) < 3 && Math.abs(data[i + 2] - 153) < 3;
    }
    return clear > 40000;
  }, null, { timeout: 120_000, polling: 100 });
  const imguiFrames = await frameSequence(page);
  await delay(2000);
  console.log(`x11 ${browser}: ImGui's window showed ${((await frameSequence(page) - imguiFrames) / 2).toFixed(0)} frames/s`);
  await page.screenshot({ path: `${evidence}${browser}-imgui.png` });
  // xterm's left edge stays out from under ImGui's window: the focus follows the pointer there.
  await page.mouse.move(...await at(page, 100, 450));
  await delay(300);
  // amy installs a package from xterm's shell.
  await type(page, "amy install tmux > /tmp/amy-tmux 2>&1; echo $? >> /tmp/amy-tmux\n");
  await page.waitForFunction(() => __dolly.inputTransport.inputIdle(), null, { timeout: 60_000 });
  await delay(15000);
  // tmux starts its own server and runs a shell in its pane in xterm; the
  // server outlives the client detached from it.
  await type(page, "tmux\n");
  await delay(10000);
  await type(page, "echo in tmux > /tmp/in-tmux\n");
  await delay(3000);
  await page.screenshot({ path: `${evidence}${browser}-tmux.png` });
  await page.keyboard.press("Control+KeyB");
  await page.keyboard.press("d");
  await delay(2000);
  await type(page, "kill $(cat /tmp/.X0-pid)\n");
  await prompt(shellPrompt);
  await run("grep -qx 'typed in xterm' /tmp/xterm-typed && grep -q 'tmux installed' /tmp/amy-tmux && tail -n 1 /tmp/amy-tmux | grep -qx 0");
  await run("grep -qx 'in tmux' /tmp/in-tmux && tmux has-session && grep -qx 'from the menu' /tmp/menu-xterm");
});
