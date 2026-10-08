// Wine in the wine image. The image's ENTRY starts Notepad: its window must
// appear on the Dolly display, take a click and typed text, ask about the
// unsaved text and quit. Then, from the shell: a console program that uses
// files, a thread and an event through wineserver, and WineMine.
// Usage: node demos/wine/test/wine-browser.mjs
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { delay, demoTest, shellPrompt } from "../../browser.mjs";

const evidence = new URL("../../../build/wine-evidence/", import.meta.url).pathname;
const desktop = [58, 110, 165];  // Wine's default desktop colour

// The colour of one frame pixel, and how many pixels of a rectangle are dark (text).
const pixel = (page, x, y) => page.evaluate(([x, y]) =>
  [...document.querySelector("#display").getContext("2d").getImageData(x, y, 1, 1).data].slice(0, 3), [x, y]);
const dark = (page, x, y, width, height) => page.evaluate(([x, y, width, height]) => {
  const data = document.querySelector("#display").getContext("2d").getImageData(x, y, width, height).data;
  let count = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] < 200) count++;
  return count;
}, [x, y, width, height]);
// A click at a frame pixel: the canvas may be shown at another size than the frame.
async function click(page, x, y) {
  const box = await page.locator("#display").boundingBox();
  const size = await page.evaluate(() => [document.querySelector("#display").width, document.querySelector("#display").height]);
  await page.mouse.click(box.x + (x + 0.5) * box.width / size[0], box.y + (y + 0.5) * box.height / size[1]);
}
// Waits for a window whose client area is `colour` at (x, y), over the desktop.
const windowAt = (page, x, y, colour) => page.waitForFunction(([x, y, colour, desktop]) => {
  if (!__dolly.transport.graphicsActive()) return false;
  const canvas = document.querySelector("#display"), context = canvas.getContext("2d");
  const at = (x, y) => [...context.getImageData(x, y, 1, 1).data].slice(0, 3).join();
  return at(x, y) === colour.join() && at(canvas.width - 8, canvas.height - 8) === desktop.join();
}, [x, y, colour, desktop], { timeout: 120_000, polling: 250 });

await demoTest("wine", { image: "wine", timeout: 600_000 }, async ({ open }) => {
  const { page, prompt, start, waitText } = await open({ prompt: null });
  await mkdir(evidence, { recursive: true });

  await windowAt(page, 100, 100, [255, 255, 255]);
  assert.equal(await dark(page, 12, 49, 400, 30), 0, "Notepad's text area starts empty");
  await click(page, 100, 100);
  await page.keyboard.type("Dolly runs Wine: (4.0.4) [wasm64]", { delay: 20 });
  await page.waitForFunction(() => {
    const data = document.querySelector("#display").getContext("2d").getImageData(12, 49, 400, 30).data;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] < 200) count++;
    return count > 300;
  }, null, { timeout: 30_000, polling: 250 });
  const [red, , blue] = await pixel(page, 200, 12);
  assert.ok(blue > red + 40, "the clicked window has the active caption");
  await page.screenshot({ path: `${evidence}notepad.png` });
  console.log(`wine: Notepad drew its window and ${await dark(page, 12, 49, 400, 30)} dark pixels of typed text`);

  // Alt+F4 with unsaved text: Notepad asks, N answers "No", and the image's entry script goes on to the shell.
  await page.keyboard.press("Alt+F4");
  await delay(2000);
  await page.keyboard.press("n");
  await prompt(shellPrompt);
  await waitText(/Notepad exited/);
  assert.equal(await page.evaluate(() => __dolly.transport.graphicsActive()), false, "the display is released");

  const hello = start("wine hello");
  await waitText(/Hello from C:\\windows\\system32\\hello\.exe, Windows \d+\.\d+, page size 65536, \d+ processors\s+file: written through wineserver \(26 bytes\)\s+thread: wait 0, exit code 7\s+VirtualAlloc: ok, CreateProcess: refused/);
  assert.equal(await hello.done, 0);
  console.log("wine: a console program used a file, a thread and an event through wineserver; CreateProcess is refused");

  // WineMine: its counters are black with green digits; a click on the field uncovers squares, which turns them grey.
  const mines = start("wine winemine");
  await windowAt(page, 60, 50, [0, 0, 0]);
  const covered = await pixel(page, 80, 130);
  await click(page, 80, 130);
  await delay(1500);
  assert.notDeepEqual(await pixel(page, 80, 130), covered, "a click changes the square");
  await page.screenshot({ path: `${evidence}winemine.png` });
  await page.keyboard.press("Alt+F4");
  assert.equal(await mines.done, 0, "WineMine quits back to the shell");
  console.log("wine: WineMine drew its field, took a click and quit");
});
