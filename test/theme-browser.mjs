// The terminal's colours are the page's, as the popup's are: an embedding sets
// them on boot()'s element (docs/embedding.md) and both show them, at boot and
// after a change; unset, they are Dolly's.
// Usage: node test/theme-browser.mjs [chromium|firefox ...]
import assert from "node:assert/strict";
import { browserTest, composed, shownColor } from "./browser.mjs";

const hex = rgb => `#${rgb.map(channel => channel.toString(16).padStart(2, "0")).join("")}`;
// The 16 colours as cell backgrounds (SGR 40-47, 100-107) in the first row,
// two cells each, then two cells of the text's colour (reverse video).
const blocks = `printf '\\033[2J\\033[H${[..."01234567"].map(index => `\\033[4${index}m  `).join("")}` +
  `${[..."01234567"].map(index => `\\033[10${index}m  `).join("")}\\033[0;7m  \\033[0m\\n'`;

// The terminal's last frame, once it shows the blocks: the background beside
// the first row, the block of each colour, the text's colour and the cursor's.
const terminalColors = page => page.evaluate(async () => {
  for (const deadline = Date.now() + 30000; Date.now() < deadline;
    await new Promise(resolve => setTimeout(resolve, 50))) {
    const image = await __dolly.frame(), { paddingX, paddingY, cellWidth, cellHeight, cursorCol, cursorRow } =
      __dolly.transport.geometry();
    const pixel = (x, y) => `#${[...image.data.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 3)]
      .map(channel => channel.toString(16).padStart(2, "0")).join("")}`;
    const cell = (column, row) => pixel(paddingX + column * cellWidth + (cellWidth >> 1),
      paddingY + row * cellHeight + (cellHeight >> 1));
    const background = pixel(1, 1), text = cell(32, 0);
    if (text === background || cursorRow === 0) continue;
    return { background, colors: Array.from({ length: 16 }, (_, index) => cell(2 * index, 0)), text,
      cursor: cell(cursorCol, cursorRow) };
  }
  throw new Error("the terminal never showed the blocks");
});

// The page's pixel just inside an element's top left corner.
async function shownInside(page, selector) {
  const { x, y } = await page.locator(selector).boundingBox();
  return hex(await shownColor(page, Math.ceil(x) + 2, Math.ceil(y) + 2));
}

await browserTest("theme", { image: "system", timeout: 300_000 }, async ({ open }) => {
  // Dolly's own page sets none: its colours, the 16 those of the text but for
  // black, yellow and bright yellow, and bright black.
  {
    const { page, submit } = await open();
    assert.equal(await submit(blocks), 0);
    const [background, text, accent, dim] = ["#262626", "#e8e3d7", "#f2d45c", "#77736c"];
    assert.deepEqual(await terminalColors(page), { background, text, cursor: accent,
      colors: [background, text, text, accent, text, text, text, text, dim, text, text, accent, text, text, text, text] });
    assert.equal(await shownInside(page, "#display"), background);
    await page.close();
  }

  // An embedding's colours, one of the 16 named as CSS names it; those it leaves
  // follow its background, text and accent.
  const { page, submit } = await open(await composed(["html"], ["html"], { base: "system",
    files: { "/home/dolly/page.html": "<h1>Colours</h1><p>The page's.</p>" },
    setup: page => page.addInitScript(() => document.addEventListener("DOMContentLoaded", () =>
      document.head.append(Object.assign(document.createElement("style"), { textContent: `#terminal {
        position: absolute; left: 40px; top: 60px; width: 800px; height: 520px;
        --dolly-background: rgb(10, 20, 30); --dolly-color: rgb(250, 240, 230); --dolly-accent: rgb(0, 150, 255);
        --dolly-display-palette-1: rgb(200, 0, 0); --dolly-display-palette-2: teal; }` })))) }));
  const popupBackground = async () => {
    const status = submit("html /home/dolly/page.html");
    await page.frameLocator("#html-popup iframe").getByText("The page's.").waitFor();
    const shown = await shownInside(page, "#html-popup iframe");
    await page.locator("#html-popup").getByRole("button", { name: "Close" }).click();
    assert.equal(await status, 1);
    // A popup closed is followed by two seconds without one.
    await page.waitForTimeout(2000);
    return shown;
  };
  assert.equal(await submit(blocks), 0);
  const [background, text, accent, dim] = ["#0a141e", "#faf0e6", "#0096ff", "#77736c"];
  assert.deepEqual(await terminalColors(page), { background, text, cursor: accent,
    colors: [background, "#c80000", "#008080", accent, text, text, text, text, dim, text, text, accent, text, text, text, text] });
  assert.equal(await shownInside(page, "#display"), background);
  assert.equal(await popupBackground(), background);

  // A change of the page's properties is the terminal's at once, without output.
  await page.evaluate(() => document.querySelector("#terminal").style.setProperty("--dolly-background", "rgb(40, 50, 60)"));
  await page.evaluate(async () => {
    for (const deadline = Date.now() + 5000; ; await new Promise(resolve => setTimeout(resolve, 20))) {
      const { data } = await __dolly.frame();
      if (data[0] === 40 && data[1] === 50 && data[2] === 60) return;
      if (Date.now() > deadline) throw new Error("the terminal kept its background");
    }
  });
  assert.equal(await shownInside(page, "#display"), "#28323c");
  assert.equal(await popupBackground(), "#28323c");
});
