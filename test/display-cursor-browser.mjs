// A program that holds the display chooses among the page's own cursors by
// number; the page shows each and takes nothing else for one.
import assert from "node:assert/strict";
import { browserTest } from "./browser.mjs";

const cursors = ["text", "default", "crosshair", "pointer", "none", "ns-resize", "ew-resize", "nwse-resize",
  "nesw-resize", "move", "wait", "progress", "not-allowed", "help"];
const server = { fixtures: { "display-cursor.c": "test/fixtures/display-cursor.c" } };
await browserTest("display cursors", { image: "system", server }, async ({ server, open }) => {
  const { page, submit, text } = await open({
    policy: { maxRequests: 2, rules: [{ origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] }] } });
  assert.equal(await submit(`curl -fsS ${server.origin}/fixture/display-cursor.c -o /tmp/cursor.c && cc /tmp/cursor.c -o /tmp/cursor`), 0, await text());
  const shown = submit("/tmp/cursor");
  for (const [value, cursor] of cursors.entries()) {
    await page.waitForFunction(([value, cursor]) => __dolly.transport.cursorStyle() === value &&
      document.querySelector("#display").style.cursor === cursor, [value, cursor], { timeout: 5000, polling: 20 });
  }
  assert.equal(await shown, 0, await text());
  assert.match(await text(), /CURSORS-SHOWN/);
});
