// The ghostty-x11 image: Xsdl takes Dolly's display and Ghostty's GTK window
// opens on it with Slop in its terminal, drawn by Mesa. The page's keyboard
// reaches that shell through the X server, GTK and Ghostty's pseudo-terminal:
// it writes a file and ends the server, and the terminal's shell reads it
// and finds amy, which installs packages into the session.
// Usage: node demos/ghostty-gtk/test/ghostty-x11-browser.mjs [chromium|firefox ...]
import { mkdir } from "node:fs/promises";
import { delay, demoTest, shellPrompt } from "../../browser.mjs";

const evidence = new URL("../../../build/ghostty-evidence/", import.meta.url).pathname;
const width = 1024, height = 700;

// Pixels of the frame's box brighter than Ghostty's dark background: text.
const bright = (page, x, y, w, h) => page.evaluate(([x, y, w, h]) => {
  const data = document.querySelector("#display").getContext("2d").getImageData(x, y, w, h).data;
  let count = 0;
  for (let i = 0; i < data.length; i += 4) count += data[i] + data[i + 1] + data[i + 2] > 450;
  return count;
}, [x, y, w, h]);
async function at(page, x, y) {
  const box = await page.locator("#display").boundingBox();
  return [box.x + (x + 0.5) * box.width / width, box.y + (y + 0.5) * box.height / height];
}
// X maps keys, not characters: a shifted character is Shift and its key.
const shifted = { ">": "Period", "$": "Digit4", "(": "Digit9", ")": "Digit0", "*": "Digit8" };
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
  await page.waitForFunction(() => {
    const data = document.querySelector("#display").getContext("2d").getImageData(400, 300, 200, 100).data;
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
  await type(page, "kill $(cat /tmp/.X0-pid)\n");
  await prompt(shellPrompt);
  await run("grep -qx ghostty-42 /tmp/ghostty-typed && command -v amy");
});
