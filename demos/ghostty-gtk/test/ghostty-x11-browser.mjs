// The ghostty-x11 image: Xsdl takes Dolly's display and Ghostty's GTK window
// opens on it with Slop in its terminal, drawn by Mesa. The page's keyboard
// reaches that shell through the X server, GTK and Ghostty's pseudo-terminal:
// it writes a file, colours cells and ends the server, and the terminal's
// shell reads the file and finds amy, which installs packages into the session.
// Usage: node demos/ghostty-gtk/test/ghostty-x11-browser.mjs [chromium|firefox ...]
import { mkdir } from "node:fs/promises";
import { delay, demoTest, framePoint, shellPrompt, snapshotDisplay, waitForDisplay } from "../../browser.mjs";

const evidence = new URL("../../../build/ghostty-evidence/", import.meta.url).pathname;
const width = 1024, height = 700;

// Pixels of the frame's box brighter than Ghostty's dark background: text.
const bright = async (page, x, y, w, h) => { await snapshotDisplay(page); return page.evaluate(([x, y, w, h]) => {
  const data = displaySnapshot.getContext("2d").getImageData(x, y, w, h).data;
  let count = 0;
  for (let i = 0; i < data.length; i += 4) count += data[i] + data[i + 1] + data[i + 2] > 450;
  return count;
}, [x, y, w, h]); };
// Where the page shows the middle of the X frame's pixel (x, y).
const at = (page, x, y) => framePoint(page, x + 0.5, y + 0.5);
// X maps keys, not characters: a shifted character is Shift and its key.
const shifted = { ">": "Period", "$": "Digit4", "(": "Digit9", ")": "Digit0", "*": "Digit8", "%": "Digit5" };
async function type(page, text) {
  for (const character of text) {
    if (shifted[character]) await page.keyboard.press(`Shift+${shifted[character]}`);
    else if (/[A-Z]/.test(character)) await page.keyboard.press(`Shift+Key${character}`);
    else await page.keyboard.press(character === " " ? "Space" : character === "\n" ? "Enter" : character);
  }
}

const browsers = process.argv.length > 2 ? process.argv.slice(2) : ["chromium"];
for (const browser of browsers) await demoTest("ghostty-x11", { image: "ghostty-x11", timeout: 900_000, browser }, async ({ open }) => {
  await mkdir(evidence, { recursive: true });
  const started = performance.now();
  const { page, run, prompt } = await open({ prompt: null });
  await page.waitForFunction(([width, height]) => __dolly.transport.graphicsActive() &&
    document.querySelector("#display").width === width && document.querySelector("#display").height === height,
  [width, height], { timeout: 120_000, polling: 100 });
  // Ghostty's window at the top left, then Slop's prompt in its first row,
  // below the header bar: the frame's rows 53-73, and the second row 74-94.
  await waitForDisplay(page, () => {
    const data = displaySnapshot.getContext("2d").getImageData(400, 300, 200, 100).data;
    let lit = 0;
    for (let i = 0; i < data.length; i += 4) lit += data[i] + data[i + 1] + data[i + 2] > 0;
    return lit > 15000;
  }, null, { timeout: 600_000, polling: 500 });
  const windowShown = performance.now();
  for (let tries = 0; await bright(page, 8, 52, 400, 22) < 100; tries++) {
    if (tries > 600) throw new Error("no prompt in Ghostty's terminal");
    await delay(500);
  }
  const prompted = performance.now();
  console.log(`ghostty-x11 ${browser}: window in ${((windowShown - started) / 1000).toFixed(0)}s, prompt in ${((prompted - started) / 1000).toFixed(0)}s`);
  await page.screenshot({ path: `${evidence}${browser}-prompt.png` });

  await page.mouse.click(...await at(page, 500, 400));
  await delay(500);
  await type(page, "echo ghostty-$((6 * 7)) > /tmp/ghostty-typed\n");
  // The command prints nothing: the next prompt is on the second row.
  for (let tries = 0; await bright(page, 8, 73, 400, 22) < 100; tries++) {
    if (tries > 120) throw new Error("no answer in Ghostty's terminal");
    await delay(500);
  }
  await page.screenshot({ path: `${evidence}${browser}-typed.png` });
  // A cell's background is drawn over its cell: twenty cells of one colour
  // in the third row, the frame's rows 95-115. Ghostty draws only the rows
  // that changed: a command that erases that row from two rows below leaves
  // the first row as it was.
  const barred = async () => { await snapshotDisplay(page); return page.evaluate(() => {
    const data = displaySnapshot.getContext("2d").getImageData(8, 95, 400, 21).data;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) count += Math.abs(data[i] - 200) + Math.abs(data[i + 1] - 30) + Math.abs(data[i + 2] - 40) < 12;
    return count;
  }); };
  await type(page, "printf '\\033[48;2;200;30;40m%20s\\033[0m\\n'\n");
  for (let tries = 0; await barred() < 3000; tries++) {
    if (tries > 60) throw new Error(`the cells' background covers ${await barred()} pixels`);
    await delay(500);
  }
  const firstRow = await bright(page, 8, 52, 960, 22);
  await type(page, "printf '\\033[3;1H\\033[K\\033[5;1H'\n");
  for (let tries = 0; await barred() > 0; tries++) {
    if (tries > 60) throw new Error(`${await barred()} pixels of an erased row are still drawn`);
    await delay(500);
  }
  if (await bright(page, 8, 52, 960, 22) !== firstRow) throw new Error("a row that did not change was drawn differently");
  await type(page, "kill $(cat /tmp/.X0-pid)\n");
  await prompt(shellPrompt);
  await run("grep -qx ghostty-42 /tmp/ghostty-typed && command -v amy");
});
