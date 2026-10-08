// Wine in the wine image. The image's ENTRY starts the desktop: a taskbar
// with a Start menu, from which Paint, then Notepad and WineMine side by side,
// are started. The test reads the frame's pixels and, after Shut Down, the list of
// windows the desktop printed whenever it changed. Then, from the shell, a
// console program that uses files, a thread and an event through wineserver.
// Usage: node demos/wine/test/wine-browser.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { delay, demoTest, shellPrompt } from "../../browser.mjs";

const projectDir = new URL("../../..", import.meta.url).pathname;
const evidence = new URL("../../../build/wine-evidence/", import.meta.url).pathname;
// An x86-64 Windows program nobody here compiled: Ange Albertini's hand-assembled "normal" PE32+ from
// corkami/pocs, 1,024 bytes that call msvcrt's printf and kernel32's ExitProcess. Fetched for the test only.
const sample = ".cache/corkami-normal64-d526f32e.exe";
execFileSync("bash", ["scripts/fetch-verified-file.sh",
  "https://raw.githubusercontent.com/corkami/pocs/af2e1a071fffc3d52d079bdf355513e930ec4c0a/PE/bin/normal64.exe",
  "d526f32ec97c10f9cef71132c89d457b388711b4a4eb4168da3896fb4d45b6d0", sample], { cwd: projectDir });
const desktop = [58, 110, 165], face = [212, 208, 200], white = [255, 255, 255], black = [0, 0, 0];

const frameSize = page => page.evaluate(() => [document.querySelector("#display").width, document.querySelector("#display").height]);
// Waits until the frame pixel (x, y) has (or, with `not`, no longer has) a colour.
const pixelIs = (page, x, y, colour, not = false) => page.waitForFunction(([x, y, colour, not]) => {
  if (!__dolly.transport.graphicsActive()) return false;
  const data = document.querySelector("#display").getContext("2d").getImageData(x, y, 1, 1).data;
  return ([...data].slice(0, 3).join() === colour.join()) !== not;
}, [x, y, colour, not], { timeout: 60_000, polling: 200 });
const dark = (page, x, y, width, height) => page.evaluate(([x, y, width, height]) => {
  const data = document.querySelector("#display").getContext("2d").getImageData(x, y, width, height).data;
  let count = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] < 200) count++;
  return count;
}, [x, y, width, height]);
// Page coordinates of a frame pixel: the canvas may be shown at another size than the frame.
async function at(page, x, y) {
  const box = await page.locator("#display").boundingBox();
  const [width, height] = await frameSize(page);
  return [box.x + (x + 0.5) * box.width / width, box.y + (y + 0.5) * box.height / height];
}
const click = async (page, x, y) => page.mouse.click(...await at(page, x, y));

await demoTest("wine", { image: "wine", timeout: 600_000, server: { fixtures: { "normal64.exe": sample } } }, async ({ server, open }) => {
  const { page, prompt, start, waitText } = await open({ prompt: null,
    policy: { rules: [{ origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] }] } });
  await mkdir(evidence, { recursive: true });
  try { await run(page, prompt, start, waitText, server); }
  catch (error) { await page.screenshot({ path: `${evidence}failure.png` }); throw error; }
});

async function run(page, prompt, start, waitText, server) {
  await page.waitForFunction(() => __dolly.transport.graphicsActive(), null, { timeout: 120_000 });
  const [width, height] = await frameSize(page);
  // Start menu: the key of a program's name starts it.
  const startMenu = async key => { await click(page, 30, height - 14); await delay(700); await page.keyboard.press(key); };

  // The desktop: its colour, and the taskbar along the bottom.
  await pixelIs(page, width >> 1, height >> 1, desktop);
  await pixelIs(page, width >> 1, height - 6, face);

  // Paint (ReactOS's): a pencil line dragged across its image, saved through the file dialog, closed.
  await startMenu("p");
  await pixelIs(page, 364, 350, white);       // the window opens at 100,100 with a white 400x300 image
  await page.mouse.move(...await at(page, 200, 230));
  await page.mouse.down();
  await page.mouse.move(...await at(page, 500, 450), { steps: 15 });
  await page.mouse.up();
  await page.waitForFunction(() => {
    const data = document.querySelector("#display").getContext("2d").getImageData(170, 200, 390, 290).data;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] < 200) count++;
    return count > 150;
  }, null, { timeout: 30_000, polling: 250 });
  await page.screenshot({ path: `${evidence}paint.png` });
  console.log(`wine: Paint drew ${await dark(page, 170, 200, 390, 290)} dark pixels along a dragged pencil line`);
  await page.keyboard.press("Control+s");
  await delay(1500);
  await page.keyboard.type("C:\\dolly.bmp", { delay: 20 });
  await page.keyboard.press("Enter");
  await delay(1500);
  await page.keyboard.press("Alt+F4");
  await pixelIs(page, 364, 350, desktop);

  // Notepad, typed into.
  await startMenu("n");
  await pixelIs(page, 100, 100, white);
  await click(page, 100, 100);
  await page.keyboard.type("Dolly runs Wine: (4.0.4) [wasm64]", { delay: 20 });
  await page.waitForFunction(() => {
    const data = document.querySelector("#display").getContext("2d").getImageData(12, 49, 400, 30).data;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] < 200) count++;
    return count > 300;
  }, null, { timeout: 30_000, polling: 250 });
  console.log(`wine: Notepad started from the Start menu and drew ${await dark(page, 12, 49, 400, 30)} dark pixels of typed text`);

  // WineMine beside it: it opens over Notepad's corner and is dragged away by its caption.
  await startMenu("w");
  await pixelIs(page, 60, 50, black);
  await page.screenshot({ path: `${evidence}desktop.png` });
  await page.mouse.move(...await at(page, 60, 12));
  await page.mouse.down();
  await page.mouse.move(...await at(page, 860, 312), { steps: 12 });
  await page.mouse.up();
  await pixelIs(page, 860, 350, black);       // its counters, 800 to the right and 300 down, clear of Notepad
  await pixelIs(page, 60, 50, black, true);   // and Notepad's text area is back at the corner

  // Notepad's taskbar button: brings it to the front, minimizes it, restores it.
  await click(page, 140, height - 14);
  await delay(800);
  await click(page, 140, height - 14);
  await pixelIs(page, 100, 100, desktop);
  await delay(800);  // long enough for the desktop to list it as minimized
  await click(page, 140, height - 14);
  await pixelIs(page, 100, 100, white);

  // WineMine: a click on its field, closed with Alt+F4, started again.
  await click(page, 880, 430);
  await delay(500);
  await page.keyboard.press("Alt+F4");
  await pixelIs(page, 660, 350, black, true);
  await startMenu("w");
  await pixelIs(page, 860, 350, black);       // it comes back where it was closed
  await page.screenshot({ path: `${evidence}desktop-2.png` });

  await startMenu("u");
  await prompt(shellPrompt);
  assert.equal(await page.evaluate(() => __dolly.transport.graphicsActive()), false, "the display is released");
  const log = await waitText(/the Wine desktop was shut down/);
  for (const pattern of [
    /desktop: started mspaint\.exe/,
    /"Unnamed\.bmp - Paint" at 100,100 foreground/,
    /"dolly\.bmp - Paint"/,
    /desktop: started notepad\.exe/,
    /2 windows; "Untitled - Notepad" at 0,0; "WineMine" at 0,0 foreground/,
    /"WineMine" at 800,300/,
    /"Untitled - Notepad" at -32000,-32000 minimized/,
    /1 windows; "Untitled - Notepad" at 0,0/,
    /started winemine\.exe[\s\S]*started winemine\.exe/,
  ]) assert.match(log, pattern);
  console.log("wine: two programs at once; a window dragged, minimized, restored, closed and started again; shut down");

  // What Paint saved: a 400x300 bitmap of 32 bits a pixel is 480,054 bytes.
  const size = start("wc -c /home/dolly/.wine/drive_c/dolly.bmp");
  await waitText(/480054 \/home\/dolly\/\.wine\/drive_c\/dolly\.bmp/);
  assert.equal(await size.done, 0);
  console.log("wine: Paint saved its image through the file dialog as a 480,054-byte bitmap");

  const hello = start("wine hello");
  await waitText(/Hello from C:\\windows\\system32\\hello\.exe, Windows \d+\.\d+, page size 65536, \d+ processors\s+file: written through wineserver \(26 bytes\)\s+thread: wait 0, exit code 7\s+VirtualAlloc: ok, CreateProcess: refused/);
  assert.equal(await hello.done, 0);
  console.log("wine: a console program used a file, a thread and an event through wineserver; CreateProcess is refused");

  // The x86-64 emulator: the unmodified sample prints its line through Wine's msvcrt and exits by ExitProcess.
  const fetched = start(`curl -fsS ${server.origin}/fixture/normal64.exe -o /home/dolly/.wine/drive_c/normal64.exe`);
  assert.equal(await fetched.done, 0);
  const emulated = start("wine x86emu 'C:\\normal64.exe'");
  await waitText(/ \* a standard PE32\+ \(imports, standard alignments\)/);
  assert.equal(await emulated.done, 0);
  const bench = start("wine x86emu --bench");
  const speed = (await waitText(/x86emu: 200000003 instructions in \d+ ms: [\d.]+ million a second/, 120_000))
    .match(/200000003 instructions in (\d+) ms: ([\d.]+) million a second/);
  assert.equal(await bench.done, 0);
  console.log(`wine: x86emu ran an x86-64 PE nobody here compiled; its interpreter does ${speed[2]} million instructions a second`);
}
