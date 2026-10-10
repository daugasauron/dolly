// buttons@0: a program shows a strip of buttons below the terminal, reads the
// presses and types into the terminal; the page's Paste button gives it the
// clipboard, granted and refused; exit and an interrupt remove the strip. A phone's
// screen takes taps and a finger's drag, and fits 48 columns.
// Usage: node test/buttons-browser.mjs [chromium|firefox ...]
import assert from "node:assert/strict";
import { devices } from "playwright-core";
import { browserTest, composed } from "./browser.mjs";

const fixtures = { "buttons.c": "test/fixtures/buttons.c" };
// Chrome refuses the clipboard itself. Firefox asks its user in a popup that a
// headless browser never answers, so there the test fails the read.
const refused = { chromium: ["--deny-permission-prompts"] };
const failRead = () => { navigator.clipboard.readText = () => Promise.reject(new DOMException("refused", "NotAllowedError")); };
const options = { image: "system", server: { fixtures }, timeout: 300_000 };

// `system` with the one module more, and the fixture compiled in it.
async function compiled(open, server, { clipboard, context, initScript } = {}) {
  const errors = [];
  const image = await composed(["runtime", "display", "input", "http", "download", "upload", "snapshot", "buttons"], [], { base: "system" });
  const session = await open({ ...image, context,
    policy: { rules: [{ origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] }] },
    async setup(page) {
      await image.setup(page);
      page.on("pageerror", error => errors.push(error.message));
      if (clipboard) await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
      if (initScript) await page.addInitScript(initScript);
    } });
  const { page } = session;
  const run = async command => assert.equal(await session.submit(command), 0, await session.text());
  await run(`curl -fsS ${server.origin}/fixture/buttons.c -o /tmp/buttons.c && cc /tmp/buttons.c -o /tmp/buttons`);
  const strip = page.locator("#buttons");
  return { ...session, run, errors, strip, button: label => strip.getByRole("button", { name: label, exact: true }),
    grid: () => page.evaluate(() => { const { cols, rows } = __dolly.transport.dimensions(); return { cols, rows }; }),
    gone: rows => page.waitForFunction(rows => !__dolly.buttons.held && document.querySelector("#buttons").hidden &&
      __dolly.transport.dimensions().rows === rows && !document.querySelector("#keyboard").hasAttribute("inputmode"), rows) };
}
// Prints a hundred numbered lines; resolves to the first one on screen.
async function scrollback({ run, text }) {
  await run("awk 'BEGIN { for (i = 0; i < 100; i++) printf \"DOLLY-SCROLL-%03d\\n\", i }'");
  return Math.min(...[...(await text()).matchAll(/DOLLY-SCROLL-(\d+)/g)].map(match => Number(match[1])));
}
const line = number => new RegExp(`DOLLY-SCROLL-${String(number).padStart(3, "0")}`);
const center = async locator => { const box = await locator.boundingBox(); return [box.x + box.width / 2, box.y + box.height / 2]; };

await browserTest("buttons", options, async ({ name, server, open }) => {
  const session = await compiled(open, server, { clipboard: name === "chromium" });
  const { page, submit, text, result, waitForText, run, errors, strip, button, grid, gone } = session;
  await run("/tmp/buttons refuse");
  assert.match(await text(), /BUTTONS_REFUSALS_OK/);
  const { rows } = await grid();
  await gone(rows);
  await page.evaluate(() => {
    const clipboard = navigator.clipboard, native = clipboard.readText;
    globalThis.clipboardReads = 0;
    clipboard.readText = function() { ++clipboardReads; return native.call(this); };
  });

  // The strip is the page's: text as text, its own word on the Paste button,
  // below the terminal's grid and the page's indicators, no on-screen keyboard.
  await run("/tmp/buttons hold &");
  await button("One").waitFor();
  assert.deepEqual(await strip.evaluate(element => [element.querySelector("p").textContent, element.querySelectorAll("p *").length,
    [...element.querySelectorAll("button")].map(button => button.textContent)]),
  ["<b>Four</b> buttons", 0, ["One", "Paste", "Stop", "More"]]);
  await page.waitForFunction(rows => __dolly.transport.dimensions().rows < rows, rows);
  assert.equal(await page.locator("#keyboard").getAttribute("inputmode"), "none");
  if (await page.evaluate(() => document.documentElement.dataset.indicators) === "hidden") await page.keyboard.press("Control+Shift+F");
  await page.waitForFunction(() => document.documentElement.dataset.indicators === "shown");
  const edges = await page.evaluate(() => Object.fromEntries(["#buttons", "#terminal", "#session-open"].map(selector =>
    [selector, document.querySelector(selector).getBoundingClientRect()]).map(([selector, { top, bottom }]) => [selector, { top, bottom }])));
  assert.ok(edges["#terminal"].bottom <= edges["#buttons"].top && edges["#buttons"].bottom === await page.evaluate(() => innerHeight), JSON.stringify(edges));
  assert.ok(edges["#session-open"].bottom > edges["#session-open"].top && edges["#session-open"].bottom <= edges["#buttons"].top, JSON.stringify(edges));

  // A press types: the shell at its prompt reads the command and runs it. The
  // new caption leaves the pressed button in place, and the keyboard still types.
  const one = await button("One").elementHandle();
  assert.equal(await result(() => button("One").click()), 0);
  assert.match(await text(), /PRESSED-0/);
  await page.waitForFunction(() => document.querySelector("#buttons p").textContent === "One was pressed");
  assert.equal(await one.evaluate(element => element.isConnected), true);
  assert.equal(await result(async () => { await page.keyboard.type("echo KEYS-STILL-TYPE"); await page.keyboard.press("Enter"); }), 0);
  assert.match(await text(), /^KEYS-STILL-TYPE$/m);
  await run("/tmp/buttons busy");

  // Ctrl+C from a button interrupts the foreground tree as the key does: the
  // sleeping program and the holder, which is the shell's too. Its strip goes.
  const sleeping = submit("sleep 100");
  await page.waitForFunction(() => __dolly.terminal.foregroundInterruptible());
  await button("Stop").click();
  assert.equal(await sleeping, 130);
  await gone(rows);
  await run("/tmp/buttons hold &");

  // Only a press of Paste reads the clipboard; more than 4096 bytes is refused.
  assert.equal(await page.evaluate(() => clipboardReads), 0);
  await page.evaluate(() => navigator.clipboard.writeText("made-up-text-42"));
  assert.equal(await result(() => button("Paste").click()), 0);
  assert.match(await text(), /^PASTED-made-up-text-42$/m);
  await page.evaluate(() => navigator.clipboard.writeText("x".repeat(4097)));
  assert.equal(await result(() => button("Paste").click()), 0);
  assert.match(await text(), /^PASTE-REFUSED-1$/m);
  assert.equal(await page.evaluate(() => clipboardReads), 2);

  // Twelve buttons; the last one's program exits, and the strip goes with it.
  await button("More").click();
  await button("Quit").waitFor();
  assert.equal(await strip.locator("button").count(), 12);
  assert.equal(await result(() => button("Key 5").click()), 0);
  assert.match(await text(), /PRESSED-5/);
  await button("Quit").click();
  await gone(rows);

  // A finger's drag of five and a half rows scrolls five lines back and selects nothing.
  const top = await scrollback(session);
  await page.evaluate(() => {
    const { paddingX, paddingY } = __dolly.transport.geometry();
    __dolly.inputTransport.pushPointer(paddingX, paddingY, 1, {});
    __dolly.inputTransport.pushPointer(paddingX, paddingY, 0, {});
  });
  await page.waitForFunction(() => __dolly.copySelection() === null);
  await page.evaluate(() => {
    const canvas = document.querySelector("#display"), cell = __dolly.transport.geometry().cellHeight * canvas.clientHeight / canvas.height;
    const fire = (type, y) => canvas.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: "touch", isPrimary: true,
      button: 0, buttons: type === "pointerup" ? 0 : 1, clientX: 200, clientY: y, bubbles: true, cancelable: true }));
    fire("pointerdown", 100);
    for (let step = 1; step <= 11; ++step) fire("pointermove", 100 + step * cell / 2);
    fire("pointerup", 100 + 5.5 * cell);
  });
  await page.waitForFunction(() => __dolly.inputTransport.inputIdle());
  assert.equal(await page.evaluate(() => __dolly.copySelection()), null);
  await waitForText(line(top - 5));
  assert.doesNotMatch(await text(), line(top - 6));
  assert.deepEqual(errors, []);
  if (name === "chromium") await phone(open, server);
});

await browserTest("buttons refused", { ...options, launch: refused }, async ({ name, server, open }) => {
  const { result, text, run, button, errors } = await compiled(open, server, { initScript: name === "firefox" && failRead });
  await run("/tmp/buttons hold &");
  assert.equal(await result(() => button("Paste").click()), 0);
  assert.match(await text(), /^PASTE-REFUSED-2$/m);
  assert.deepEqual(errors, []);
});

// A phone: Chrome's emulation of a Pixel 7, 412 CSS pixels wide, with touch.
async function phone(open, server) {
  const session = await compiled(open, server, { context: devices["Pixel 7"] });
  const { page, result, text, waitForText, run, errors, strip, button, grid, gone } = session;
  const font = () => page.evaluate(() => __dolly.fontSize), tap = async locator => page.touchscreen.tap(...await center(locator));
  // A font below 20 that gives 48 columns.
  const bare = await grid(), fitted = await font();
  assert.ok(bare.cols >= 48 && fitted < 20 && fitted >= 12, JSON.stringify({ bare, fitted }));

  // Taps press: four buttons of 48 CSS pixels in one row, also on a screen 360 wide.
  await run("/tmp/buttons hold &");
  await button("One").waitFor();
  assert.equal(await result(() => tap(button("One"))), 0);
  assert.match(await text(), /PRESSED-0/);
  const boxes = () => strip.locator("button").evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect()).map(({ top, height }) => ({ top, height })));
  const oneRow = async () => { const all = await boxes(); return all.every(({ top, height }) => top === all[0].top && height >= 48); };
  assert.ok(await oneRow(), JSON.stringify(await boxes()));
  await page.waitForFunction(rows => __dolly.transport.dimensions().rows < rows, bare.rows);
  const four = await grid();
  // The terminal has taken the page's width once a frame as wide is on the canvas.
  const resized = async size => {
    await page.setViewportSize(size);
    await page.waitForFunction(() => document.querySelector("#display").width === Math.round(innerWidth * devicePixelRatio));
  };
  await resized({ width: 360, height: 740 });
  assert.ok(await oneRow(), JSON.stringify(await boxes()));
  const narrow = { ...await grid(), font: await font() };
  assert.ok(narrow.cols >= 48 && narrow.font < fitted, JSON.stringify(narrow));
  await resized(devices["Pixel 7"].viewport);
  assert.deepEqual(await grid(), four);
  await tap(button("More"));
  await button("Quit").waitFor();
  assert.equal(new Set((await boxes()).map(({ top }) => top)).size, 3, "twelve buttons in three rows of four");
  await page.waitForFunction(rows => __dolly.transport.dimensions().rows < rows, four.rows);
  const twelve = await grid();
  console.log(`buttons: Pixel 7 (412x${devices["Pixel 7"].viewport.height}): font ${fitted}px, ${bare.cols}x${bare.rows} bare, ` +
    `${four.cols}x${four.rows} with four buttons, ${twelve.cols}x${twelve.rows} with twelve; 360x740: font ${narrow.font}px, ${narrow.cols}x${narrow.rows} with four`);
  await tap(button("Quit"));
  await gone(bare.rows);
  // It is the largest such font: one more gives fewer. Ctrl+= and Ctrl+- still choose.
  await page.evaluate(() => __dolly.key("=", "Equal", 2));
  await page.waitForFunction(fitted => __dolly.fontSize === fitted + 1, fitted);
  assert.ok((await grid()).cols < 48);
  await page.evaluate(() => __dolly.key("-", "Minus", 2));
  await page.waitForFunction(({ cols }) => __dolly.transport.dimensions().cols === cols, bare);

  // A finger dragged down five and a half rows shows five earlier lines.
  const top = await scrollback(session);
  const { cell, x, y } = await page.evaluate(() => {
    const canvas = document.querySelector("#display");
    return { cell: __dolly.transport.geometry().cellHeight * canvas.clientHeight / canvas.height, x: canvas.clientWidth / 2, y: canvas.clientHeight / 3 };
  });
  const touch = await page.context().newCDPSession(page);
  const finger = (type, at) => touch.send("Input.dispatchTouchEvent", { type, touchPoints: at === undefined ? [] : [{ x, y: at }] });
  await finger("touchStart", y);
  for (let step = 1; step <= 11; ++step) await finger("touchMove", y + step * cell / 2);
  await finger("touchEnd");
  await waitForText(line(top - 5));
  assert.doesNotMatch(await text(), line(top - 6));
  assert.deepEqual(errors, []);
}
