// A program that holds the display chooses among the page's own cursors by
// number; the page shows each and takes nothing else for one. Its frame, gray
// 0x60 in all four bytes, shows opaque: the fourth byte is not shown.
import assert from "node:assert/strict";
import { browserTest } from "./browser.mjs";

// The color the page shows at the middle of the display, read from a screenshot.
async function shown(page) {
  const png = (await page.locator("#display").screenshot()).toString("base64");
  return page.evaluate(async png => {
    const image = new Image();
    image.src = `data:image/png;base64,${png}`;
    await image.decode();
    const context = Object.assign(document.createElement("canvas"), { width: image.width, height: image.height })
      .getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    return [...context.getImageData(image.width >> 1, image.height >> 1, 1, 1).data.subarray(0, 3)];
  }, png);
}

const cursors = ["text", "default", "crosshair", "pointer", "none", "ns-resize", "ew-resize", "nwse-resize",
  "nesw-resize", "move", "wait", "progress", "not-allowed", "help"];
const server = { fixtures: { "display-cursor.c": "test/fixtures/display-cursor.c" } };
await browserTest("display cursors", { image: "system", server }, async ({ server, open }) => {
  const { page, submit, text } = await open({
    policy: { maxRequests: 2, rules: [{ origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] }] } });
  assert.equal(await submit(`curl -fsS ${server.origin}/fixture/display-cursor.c -o /tmp/cursor.c && cc /tmp/cursor.c -o /tmp/cursor`), 0, await text());
  const showing = submit("/tmp/cursor");
  showing.catch(() => {}); // A failed check below closes the page; that check is the failure to report.
  // Painted once the page's last frame holds the program's gray.
  await page.evaluate(async () => {
    while ((await __dolly.frame())?.data[0] !== 0x60) await new Promise(resolve => setTimeout(resolve, 20));
  });
  const color = await shown(page);
  assert.ok(color.every(channel => Math.abs(channel - 0x60) <= 2), `the frame shows as ${color}`);
  for (const [value, cursor] of cursors.entries()) {
    await page.waitForFunction(([value, cursor]) => __dolly.transport.cursorStyle() === value &&
      document.querySelector("#display").style.cursor === cursor, [value, cursor], { timeout: 5000, polling: 20 });
  }
  assert.equal(await showing, 0, await text());
  assert.match(await text(), /CURSORS-SHOWN/);
});
