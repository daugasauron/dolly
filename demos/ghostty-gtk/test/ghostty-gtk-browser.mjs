// Ghostty's GTK application on x11-desktop: amy installs it from xterm's shell,
// twm places its window where the pointer clicks, and Mesa draws Slop in its
// terminal. The page's keyboard reaches that shell through the X server, GTK
// and Ghostty's pseudo-terminal: it writes a file, colours cells and ends the
// server, and the terminal's shell reads the file.
// Usage: [DOLLY_BROWSER=firefox] node demos/ghostty-gtk/test/ghostty-gtk-browser.mjs
import { mkdir } from "node:fs/promises";
import { browsers } from "../../browsers.mjs";
import { delay, demoTest, framePoint, shellPrompt, snapshotDisplay } from "../../browser.mjs";

const evidence = new URL("../../../build/ghostty-evidence/", import.meta.url).pathname;
const width = 1600, height = 900;
// twm frames Ghostty's window at the click; its terminal's cells, 10 by 21
// pixels, start below the window's header bar.
const place = [545, 20], origin = [555, 94], cell = [10, 21];
const row = (index, columns = 40) => [origin[0], origin[1] + index * cell[1], columns * cell[0], cell[1]];

// Pixels of the frame's box near the colour [r, g, b], within a distance of tolerance.
const near = async (page, [x, y, w, h], [r, g, b], tolerance) => { await snapshotDisplay(page); return page.evaluate(([x, y, w, h, r, g, b, tolerance]) => {
  const data = displaySnapshot.getContext("2d").getImageData(x, y, w, h).data;
  let count = 0;
  for (let i = 0; i < data.length; i += 4) count += Math.abs(data[i] - r) + Math.abs(data[i + 1] - g) + Math.abs(data[i + 2] - b) < tolerance;
  return count;
}, [x, y, w, h, r, g, b, tolerance]); };
// Pixels brighter than Ghostty's dark background (red, green and blue summing above 450): text.
const bright = (page, box) => near(page, box, [255, 255, 255], 315);
const digest = async (page, [x, y, w, h]) => { await snapshotDisplay(page); return page.evaluate(([x, y, w, h]) => {
  const data = displaySnapshot.getContext("2d").getImageData(x, y, w, h).data;
  let value = 0;
  for (let i = 0; i < data.length; i += 4) value = (value * 31 + data[i] + 7 * data[i + 1] + 13 * data[i + 2]) >>> 0;
  return value;
}, [x, y, w, h]); };
async function until(condition, tries, failure) {
  for (let tried = 0; !await condition(); tried++) {
    if (tried > tries) throw new Error(await failure());
    await delay(500);
  }
}
// Where the page shows the middle of the X frame's pixel (x, y).
const at = (page, x, y) => framePoint(page, x + 0.5, y + 0.5);
// X maps keys, not characters: a shifted character is Shift and its key.
const shifted = { ">": "Period", "$": "Digit4", "(": "Digit9", ")": "Digit0", "*": "Digit8", "%": "Digit5", "&": "Digit7" };
async function type(page, text) {
  for (const character of text) {
    if (shifted[character]) await page.keyboard.press(`Shift+${shifted[character]}`);
    else if (/[A-Z]/.test(character)) await page.keyboard.press(`Shift+Key${character}`);
    else await page.keyboard.press(character === " " ? "Space" : character === "\n" ? "Enter" : character);
  }
}

for (const browser of browsers) await demoTest("ghostty-gtk", { image: "x11-desktop", timeout: 900_000, browser }, async ({ open }) => {
  await mkdir(evidence, { recursive: true });
  const { page, run, prompt } = await open({ prompt: null, policy: { rules: [] } });
  await page.waitForFunction(([width, height]) => __dolly.transport.graphicsActive() &&
    document.querySelector("#display").width === width && document.querySelector("#display").height === height,
  [width, height], { timeout: 120_000, polling: 100 });
  // Slop's yellow prompt in xterm's window, which the session places at +40+300.
  await until(async () => await near(page, [42, 320, 484, 316], [205, 205, 0], 60) > 25, 240, () => "no prompt in xterm");
  // twm gives xterm the keyboard under the pointer; it shows the new window's
  // name at the screen's corner while it waits for the click that places it.
  await page.mouse.move(...await at(page, 200, 450));
  await delay(300);
  const corner = [0, 0, 70, 22], unplaced = await digest(page, corner);
  const started = performance.now();
  await type(page, "amy install ghostty-gtk > /tmp/amy-ghostty 2>&1; ghostty &\n");
  await until(async () => await digest(page, corner) !== unplaced, 240, () => "twm never asked where Ghostty's window goes");
  const asked = performance.now();
  await page.mouse.move(...await at(page, ...place));
  await delay(300);
  await page.mouse.click(...await at(page, ...place));
  await until(async () => await bright(page, row(0)) > 100, 240, () => "no prompt in Ghostty's terminal");
  const prompted = performance.now();
  console.log(`ghostty-gtk ${browser}: installed and started in ${((asked - started) / 1000).toFixed(1)}s, ` +
    `prompt ${((prompted - asked) / 1000).toFixed(1)}s later`);
  await page.screenshot({ path: `${evidence}${browser}-prompt.png` });

  await page.mouse.click(...await at(page, origin[0] + 400, origin[1] + 300));
  await delay(500);
  await type(page, "echo ghostty-$((6 * 7)) > /tmp/ghostty-typed\n");
  // The command prints nothing: the next prompt is on the second row.
  await until(async () => await bright(page, row(1)) > 100, 120, () => "no answer in Ghostty's terminal");
  await page.screenshot({ path: `${evidence}${browser}-typed.png` });
  // A cell's background is drawn over its cell: twenty cells of one colour in
  // the third row. Ghostty draws only the rows that changed: a command that
  // erases that row from two rows below leaves the first row as it was.
  const barred = () => near(page, row(2), [200, 30, 40], 12);
  await type(page, "printf '\\033[48;2;200;30;40m%20s\\033[0m\\n'\n");
  await until(async () => await barred() > 3000, 60, async () => `the cells' background covers ${await barred()} pixels`);
  const firstRow = await digest(page, row(0, 78));
  await type(page, "printf '\\033[3;1H\\033[K\\033[5;1H'\n");
  await until(async () => await barred() === 0, 60, async () => `${await barred()} pixels of an erased row are still drawn`);
  if (await digest(page, row(0, 78)) !== firstRow) throw new Error("a row that did not change was drawn differently");
  await type(page, "kill $(cat /tmp/.X0-pid)\n");
  await prompt(shellPrompt);
  await run("grep -qx ghostty-42 /tmp/ghostty-typed");
});
