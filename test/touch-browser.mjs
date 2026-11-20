// touch@0: a foreground program that holds the lease reads two fingers, each
// with its own id from its down to its up, in the frame's pixels: Chromium's
// own touch events (CDP), touch PointerEvents dispatched in Firefox. Its
// buttons are the page's, below the terminal, and a press of one is read as
// its record. While it
// holds the lease no finger is the pointer; without a holder a finger still
// scrolls the terminal and two change its font. A process beside the
// foreground program is refused. On a phone (Chromium's Pixel 7) the terminal
// fits 48 columns. Where no pointer hovers, the page's Paste button shows beside
// a program's buttons alone, once a finger has lifted, not before nor after a
// mouse has moved, and reads the clipboard, on a phone with a stylus too; a
// laptop with a touchscreen never shows it.
// Usage: node test/touch-browser.mjs [chromium|firefox ...]
import assert from "node:assert/strict";
import { devices } from "playwright-core";
import { browserTest, composed, runSteps } from "./browser.mjs";
import touchCases from "./cases/touch.json" with { type: "json" };

const { fixtures } = touchCases;
const image = () => composed(touchCases.hosts, touchCases.packages, { base: touchCases.image });
// Whether the page's Paste has shown since its document began.
function watchPaste() {
  const watch = () => {
    if (document.querySelector("#paste")?.checkVisibility()) globalThis.pasteShown = true;
    requestAnimationFrame(watch);
  };
  watch();
}
const pasteShown = page => page.evaluate(() => globalThis.pasteShown === true);
// `system` with touch@0, in a page of the browser context's options.
async function opened(open, server, context, initScript) {
  const errors = [], composedImage = await image();
  const session = await open({ ...composedImage, context,
    policy: { rules: [{ origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] }] },
    async setup(page) {
      await composedImage.setup(page);
      page.on("pageerror", error => errors.push(error.message));
      await page.addInitScript(watchPaste);
      if (initScript) await page.addInitScript(initScript);
    } });
  return { ...session, errors, run: async command => assert.equal(await session.submit(command), 0, await session.text()) };
}
// Prints a hundred numbered lines; resolves to the first one on screen.
async function scrollback({ run, text }) {
  await run("awk 'BEGIN { for (i = 0; i < 100; i++) printf \"DOLLY-SCROLL-%03d\\n\", i }'");
  return Math.min(...[...(await text()).matchAll(/DOLLY-SCROLL-(\d+)/g)].map(match => Number(match[1])));
}
const line = number => new RegExp(`DOLLY-SCROLL-${String(number).padStart(3, "0")}`);

await browserTest("touch", { image: "system", server: { fixtures }, timeout: 300_000 }, async ({ name, server, open }) => {
  const session = await opened(open, server, { hasTouch: true });
  const { page, submit, text, waitForText, waitForSelection, run, errors } = session;
  // No pointer hovers: a finger has lifted, and the shell shows no Paste.
  assert.equal(await pasteShown(page), false);
  await page.locator("#display").tap();
  // The program and its refusals are test/cases/touch.json.
  await runSteps(submit, touchCases);
  assert.equal(await pasteShown(page), false, "Paste beside no program's buttons");

  // The holder's buttons are the page's, below the canvas, with Paste beside
  // them until a mouse moves: a press is read as that button's, and its
  // buttons go with the lease.
  const pressing = submit("/tmp/touch buttons");
  pressing.catch(() => {});
  const button = label => page.locator("#buttons button", { hasText: label });
  await button("Two").waitFor();
  await page.locator("#paste").waitFor();
  const [display, bar] = await Promise.all(["#display", "#buttons"].map(selector =>
    page.locator(selector).evaluate(node => node.getBoundingClientRect().toJSON())));
  assert.ok(bar.height > 0 && bar.top >= display.bottom - 1, JSON.stringify({ display, bar }));
  await button("Two").click();
  await button("Three").click();
  assert.equal(await pressing, 0, await text());
  assert.match(await text(), /TOUCH-PRESS Two\nTOUCH-PRESS Three/);
  await page.waitForFunction(() => !document.querySelector("#buttons button:not(#paste)"));
  assert.equal(await page.locator("#buttons").isHidden(), true);

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

  // Without a holder a finger's drag of five and a half rows scrolls five lines
  // back, as in an image without touch@0, and selects nothing.
  const top = await scrollback(session);
  const cell = await page.evaluate(() => __dolly.transport.geometry().cellHeight) / canvas.scale;
  const drag = [[canvas.left + 150, canvas.top + 100]];
  // Reading the screen selected it; a click clears that.
  await page.evaluate(async () => {
    const { paddingX, paddingY } = __dolly.transport.geometry();
    await __dolly.inputTransport.pushPointer(paddingX, paddingY, 1, {});
    await __dolly.inputTransport.pushPointer(paddingX, paddingY, 0, {});
  });
  await waitForSelection(null);
  await fingers("touchStart", drag, [0]);
  for (let n = 1; n <= 11; ++n) await fingers("touchMove", [[drag[0][0], drag[0][1] + n * cell / 2]], [0]);
  await fingers("touchEnd", cdp ? [] : [[drag[0][0], drag[0][1] + 5.5 * cell]], cdp ? [] : [0]);
  await page.waitForFunction(() => __dolly.inputTransport.inputIdle());
  assert.equal(await page.evaluate(() => __dolly.copySelection()), null);
  await waitForText(line(top - 5));
  assert.doesNotMatch(await text(), line(top - 6));

  // Under a program that asked for the mouse, as tmux does, the drag is the
  // wheel where the finger is: rows down are steps up at the finger's cell,
  // in one of the rows it passed when a whole row of scroll had added up.
  await page.evaluate(() => __dolly.inputTransport.pushScroll(100000, 1));
  const wheel = submit("/tmp/touch wheel");
  await waitForText(/TOUCH-WHEEL-READY/);
  const swipe = [1, 2, 3].map(n => [canvas.left + 330, canvas.top + 140 + n * cell]);
  await fingers("touchStart", [[canvas.left + 330, canvas.top + 140]], [0]);
  for (const point of swipe) await fingers("touchMove", [point], [0]);
  await fingers("touchEnd", cdp ? [] : swipe.slice(-1), cdp ? [] : [0]);
  assert.equal(await wheel, 0, await text());
  const cells = await page.evaluate(points => {
    const { paddingX, paddingY, cellWidth, cellHeight } = __dolly.transport.geometry();
    return points.map(([x, y]) => `${Math.floor((x - paddingX) / cellWidth) + 1};${Math.floor((y - paddingY) / cellHeight) + 1}`);
  }, swipe.map(frame));
  const [, reported] = /^TOUCH-WHEEL 64 (\d+;\d+)$/m.exec(await text());
  assert.ok(cells.includes(reported), `${reported} is not one of ${cells}`);

  // Two fingers 45 px further apart are two sizes more, and back together the size it was.
  const size = await page.evaluate(() => __dolly.fontSize);
  const apart = [[canvas.left + 150, canvas.top + 100], [canvas.left + 250, canvas.top + 100]];
  await fingers("touchStart", apart.slice(0, 1), [0]);
  await fingers("touchStart", apart, [0, 1]);
  await fingers("touchMove", [apart[0], [apart[1][0] + 45, apart[1][1]]]);
  await page.waitForFunction(size => __dolly.fontSize === size + 2, size);
  await fingers("touchMove", apart);
  await page.waitForFunction(size => __dolly.fontSize === size, size);
  if (cdp) await fingers("touchEnd", [], []);
  else await fingers("touchEnd", apart, [0, 1]);
  assert.deepEqual(errors, []);
  if (name === "chromium") await phone(open, server);
});

// A phone: Chrome's emulation of a Pixel 7, 412 CSS pixels wide, with touch.
async function phone(open, server) {
  const session = await opened(open, server, devices["Pixel 7"]);
  const { page, run, text, result, waitForText, errors } = session;
  const font = () => page.evaluate(() => __dolly.fontSize);
  const grid = () => page.evaluate(() => { const { cols, rows } = __dolly.transport.dimensions(); return { cols, rows }; });
  // The largest font below 20 that gives 48 columns, also on a screen 360 wide.
  const bare = await grid(), fitted = await font();
  assert.ok(bare.cols >= 48 && fitted < 20 && fitted >= 12, JSON.stringify({ bare, fitted }));
  const resized = async size => {
    await page.setViewportSize(size);
    await page.waitForFunction(() => document.querySelector("#display").width === Math.round(innerWidth * devicePixelRatio));
  };
  await resized({ width: 360, height: 740 });
  const narrow = { ...await grid(), font: await font() };
  assert.ok(narrow.cols >= 48 && narrow.font < fitted, JSON.stringify(narrow));
  await resized(devices["Pixel 7"].viewport);
  assert.deepEqual(await grid(), bare);
  console.log(`touch: Pixel 7 (412x${devices["Pixel 7"].viewport.height}): font ${fitted}px, ${bare.cols}x${bare.rows}; ` +
    `360x740: font ${narrow.font}px, ${narrow.cols}x${narrow.rows}`);
  // One size more gives fewer; Ctrl+= and Ctrl+- still choose.
  await page.evaluate(() => __dolly.key("=", "Equal", 2));
  await page.waitForFunction(fitted => __dolly.fontSize === fitted + 1, fitted);
  assert.ok((await grid()).cols < 48);
  await page.evaluate(() => __dolly.key("-", "Minus", 2));
  await page.waitForFunction(({ cols }) => __dolly.transport.dimensions().cols === cols, bare);

  // A touchscreen has the page's Paste button beside a program's buttons once a
  // finger has lifted: a tap reads the clipboard into the terminal, which the
  // shell reads as a paste once the program has gone, and Enter runs it.
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate(() => navigator.clipboard.writeText("echo PASTED-made-up-42"));
  await runSteps(session.submit, touchCases);
  await page.locator("#display").tap();
  assert.equal(await pasteShown(page), false);
  const pressing = session.submit("/tmp/touch buttons");
  pressing.catch(() => {});
  await page.locator("#paste").tap();
  for (const label of ["Two", "Three"]) await page.locator("#buttons button", { hasText: label }).tap();
  assert.equal(await pressing, 0, await text());
  await waitForText(/echo PASTED-made-up-42$/m);
  assert.equal(await result(() => page.keyboard.press("Enter")), 0);
  assert.match(await text(), /^PASTED-made-up-42$/m);

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

  // Refused, it says so and delivers nothing.
  const refused = await opened(open, server, devices["Pixel 7"], () => {
    navigator.clipboard.readText = () => Promise.reject(new DOMException("refused", "NotAllowedError"));
  });
  await runSteps(refused.submit, touchCases);
  await refused.page.locator("#display").tap();
  refused.submit("/tmp/touch buttons").catch(() => {});
  await refused.page.locator("#paste").tap();
  await refused.page.waitForFunction(() => /Paste refused/.test(document.querySelector("#session-status").textContent));
  assert.deepEqual(refused.errors, []);
}

// A finger that lifts: Chromium's own touch event (CDP), and in Firefox a dispatched
// PointerEvent, since its touch emulation takes the fine pointer away.
async function finger(name, page) {
  if (name === "chromium") {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 200, y: 150 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    return;
  }
  await page.evaluate(() => ["pointerdown", "pointerup"].forEach(type => document.querySelector("#display").dispatchEvent(
    new PointerEvent(type, { pointerId: 20, pointerType: "touch", isPrimary: true, clientX: 200, clientY: 150, bubbles: true }))));
}

// A laptop with a touchscreen has its touchpad and Ctrl+V: no Paste while it loads, at the
// shell, under a finger, the mouse or an application's buttons. Its browser says a pointer that
// hovers is there beside the coarse one (Chromium's Blink settings: pointers 2 coarse, 4 fine,
// hovers 1 none, 2 hover; Firefox's preferences: 1 coarse, 2 fine, 4 hover), or calls it a
// tablet, a coarse pointer alone, as Chrome on Windows calls one beside a rotation sensor: there
// its touchpad moves a mouse's pointer first.
for (const [label, chromiumPointers, firefoxPointers] of [["beside a fine pointer", 6, 7], ["called a tablet", 2, 1]]) {
  const fine = chromiumPointers === 6;
  const blink = `--blink-settings=availablePointerTypes=${chromiumPointers},primaryPointerType=2,` +
    `availableHoverTypes=${fine ? 3 : 1},primaryHoverType=1`;
  await browserTest(`touch: no Paste on a laptop ${label}`, { image: "system", server: { fixtures }, timeout: 300_000,
    launch: { chromium: [blink, "--touch-events=enabled"],
      firefox: { "ui.primaryPointerCapabilities": 1, "ui.allPointerCapabilities": firefoxPointers } } }, async ({ name, server, open }) => {
    const { page, submit, text, errors } = await opened(open, server, {});
    assert.deepEqual(await page.evaluate(() => ["(any-pointer: coarse)", "(any-pointer: fine)", "(any-hover: hover)"]
      .map(query => matchMedia(query).matches)), [true, fine, fine]);
    const mouse = () => page.mouse.move(300, 200);
    for (const input of fine ? [() => finger(name, page), mouse] : [mouse, () => finger(name, page)]) await input();
    await runSteps(submit, touchCases);
    const pressing = submit("/tmp/touch buttons");
    pressing.catch(() => {});
    for (const button of ["Two", "Three"]) await page.locator("#buttons button", { hasText: button }).click();
    assert.equal(await pressing, 0, await text());
    assert.equal(await pasteShown(page), false);
    assert.deepEqual(errors, []);
  });
}

// A phone with a stylus has no paste chord either: its browser reports the pen as a fine
// pointer that does not hover (in Android's emulator, Chrome 145 coarse and fine, Firefox 160
// fine alone), and Paste comes beside a program's buttons once a finger has lifted.
await browserTest("touch: Paste on a phone with a stylus", { image: "system", server: { fixtures }, timeout: 300_000,
  launch: { chromium: ["--blink-settings=availablePointerTypes=6,primaryPointerType=2,availableHoverTypes=1,primaryHoverType=1",
    "--touch-events=enabled"], firefox: { "ui.primaryPointerCapabilities": 2, "ui.allPointerCapabilities": 2 } } },
async ({ name, server, open }) => {
  const { page, submit, errors } = await opened(open, server, {});
  assert.deepEqual(await page.evaluate(() => ["(any-pointer: fine)", "(any-hover: hover)"].map(query => matchMedia(query).matches)),
    [true, false]);
  await runSteps(submit, touchCases);
  submit("/tmp/touch buttons").catch(() => {});
  await page.locator("#buttons button", { hasText: "Two" }).waitFor();
  assert.equal(await pasteShown(page), false);
  await finger(name, page);
  await page.locator("#paste").waitFor();
  assert.deepEqual(errors, []);
});
