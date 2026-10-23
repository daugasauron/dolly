// touch@0: a foreground program that holds the lease reads two fingers, each
// with its own id from its down to its up, in the frame's pixels: Chromium's
// own touch events (CDP), touch PointerEvents dispatched in Firefox. While it
// holds the lease no finger is the pointer; without a holder a finger still
// scrolls the terminal. A background process is refused.
// Usage: node test/touch-browser.mjs [chromium|firefox ...]
import assert from "node:assert/strict";
import { browserTest, composed } from "./browser.mjs";

const fixtures = { "touch.c": "test/fixtures/touch.c" };

await browserTest("touch", { image: "system", server: { fixtures }, timeout: 300_000 }, async ({ name, server, open }) => {
  const image = await composed(["runtime", "display", "input", "http", "download", "upload", "snapshot", "touch"],
    ["libdolly-touch"], { base: "system" });
  const errors = [];
  const { page, submit, text, waitForText } = await open({ ...image, context: { hasTouch: true },
    policy: { rules: [{ origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] }] },
    async setup(page) { await image.setup(page); page.on("pageerror", error => errors.push(error.message)); } });
  const run = async command => assert.equal(await submit(command), 0, await text());
  await run(`curl -fsS ${server.origin}/fixture/touch.c -o /tmp/touch.c && cc /tmp/touch.c -o /tmp/touch`);
  await run("/tmp/touch refuse");
  assert.match(await text(), /TOUCH_REFUSALS_OK/);

  // Where a CSS point on the canvas is in the frame's pixels.
  const canvas = await page.evaluate(() => {
    const element = document.querySelector("#display"), { left, top, width, height } = element.getBoundingClientRect();
    return { left, top, scale: element.width / width, width, height };
  });
  const frame = ([x, y]) => [Math.round((x - canvas.left) * canvas.scale), Math.round((y - canvas.top) * canvas.scale)];
  // Two fingers move apart, as a zoom does, then lift one after the other.
  const start = [[canvas.left + 100, canvas.top + 120], [canvas.left + 200, canvas.top + 120]];
  const step = (points, n) => points.map(([x, y], finger) => [x + (finger ? 6 : -6) * n, y + 2 * n]);
  const cdp = name === "chromium" && await page.context().newCDPSession(page);
  async function fingers(type, points, ids = [0, 1]) {
    if (cdp) {
      await cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map(([x, y], index) => ({ x, y, id: ids[index] })) });
      return;
    }
    // Firefox: what its touchscreen sends a page, one PointerEvent per finger.
    const dispatched = { touchStart: "pointerdown", touchMove: "pointermove", touchEnd: "pointerup" }[type];
    await page.evaluate(([type, points, ids]) => points.forEach(([x, y], index) => document.querySelector("#display").dispatchEvent(
      new PointerEvent(type, { pointerId: 20 + ids[index], pointerType: "touch", isPrimary: ids[index] === 0, button: 0,
        buttons: type === "pointerup" ? 0 : 1, pressure: type === "pointerup" ? 0 : 0.5, clientX: x, clientY: y,
        bubbles: true, cancelable: true }))), [dispatched, points, ids]);
  }
  async function pinch() {
    await fingers("touchStart", start.slice(0, 1), [0]);
    await fingers("touchStart", start, [0, 1]);
    for (let n = 1; n <= 10; ++n) await fingers("touchMove", step(start, n));
    // CDP's touchEnd lists the points that stay.
    await fingers(cdp ? "touchMove" : "touchEnd", cdp ? step(start, 10).slice(0, 1) : step(start, 10).slice(1), cdp ? [0] : [1]);
    if (cdp) await fingers("touchEnd", [], []); else await fingers("touchEnd", step(start, 10).slice(0, 1), [0]);
  }

  // A program reading the input lease leaves no terminal text to read until it ends.
  const holding = (input = false) => page.waitForFunction(input => __dolly.touchTransport.lease() !== 0 &&
    (!input || __dolly.inputTransport.leased()), input);
  const held = submit("/tmp/touch hold");
  held.catch(() => {});
  await holding();
  await pinch();
  assert.equal(await held, 0, await text());
  const output = await text(), lines = phase => [...output.matchAll(new RegExp(`TOUCH-${phase} (\\d+) (-?\\d+) (-?\\d+) (\\d+)`, "g"))]
    .map(match => match.slice(1).map(Number));
  const [down, up] = [lines("DOWN"), lines("UP")];
  assert.equal(down.length, 2, output);
  assert.notEqual(down[0][0], down[1][0], "each finger has its own id");
  assert.deepEqual(down.map(([, x, y]) => [x, y]), start.map(frame));
  const ended = up.map(([id, x, y]) => [id, x, y]).sort(([a], [b]) => a - b);
  assert.deepEqual(ended, down.map(([id], finger) => [id, ...frame(step(start, 10)[finger])]), "each finger ends where it moved");
  assert.ok(down.every(([, , , pressure]) => pressure > 0) && up.every(([, , , pressure]) => pressure === 0), output);
  assert.match(output, /TOUCH-END 2\d moves 0 dropped/, "every move of both fingers");

  // A process beside the foreground program is refused; a program holding both leases reads no finger as the pointer, a mouse still is.
  await run("/tmp/touch busy & foreground /tmp/touch idle");
  await waitForText(/TOUCH-BUSY/);
  await run("clear");
  const both = submit("/tmp/touch hold input");
  both.catch(() => {});
  await holding(true);
  await pinch();
  await page.mouse.click(canvas.left + 50, canvas.top + 60);
  assert.equal(await both, 0, await text());
  const pointers = (await text()).split("\n").filter(line => line.startsWith("POINTER")), last = await text();
  assert.deepEqual(pointers, [`POINTER 1 ${frame([canvas.left + 50, canvas.top + 60]).join(" ")}`,
    `POINTER 0 ${frame([canvas.left + 50, canvas.top + 60]).join(" ")}`], last);
  assert.ok(last.indexOf("TOUCH-UP") < last.indexOf("POINTER"), last);

  // Without a holder a finger's drag scrolls the terminal again, as in an image without touch@0.
  await run("awk 'BEGIN { for (i = 0; i < 100; i++) printf \"DOLLY-SCROLL-%03d\\n\", i }'");
  const top = Math.min(...[...(await text()).matchAll(/DOLLY-SCROLL-(\d+)/g)].map(match => Number(match[1])));
  const cell = await page.evaluate(() => __dolly.transport.geometry().cellHeight) / canvas.scale;
  const drag = [[canvas.left + 150, canvas.top + 100]];
  await fingers("touchStart", drag, [0]);
  for (let n = 1; n <= 11; ++n) await fingers("touchMove", [[drag[0][0], drag[0][1] + n * cell / 2]], [0]);
  await fingers("touchEnd", cdp ? [] : [[drag[0][0], drag[0][1] + 5.5 * cell]], cdp ? [] : [0]);
  await waitForText(new RegExp(`DOLLY-SCROLL-${String(top - 5).padStart(3, "0")}`));
  assert.deepEqual(errors, []);
});
