import assert from "node:assert/strict";
import { browserTest } from "./browser.mjs";

// The in-Wasm Ghostty terminal: keyboard, clipboard, selection, scrollback,
// zoom, fullscreen, rendering, termios and the display and input leases.
const server = { fixtures: { "terminal-ui.c": "test/fixtures/terminal-ui.c" } };
await browserTest("terminal", { image: "system", server }, async ({ name, server, open }) => {
  const { page, submit, text, result, waitForText } = await open({ policy: {
    rules: [{ origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] }] },
    setup: page => name === "chromium" && page.context().grantPermissions(["clipboard-read", "clipboard-write"]) });
  const keyboard = page.locator("#keyboard");
  const clipboard = () => page.evaluate(() => navigator.clipboard.readText());
  // Reading the visible text selects it; a click on the first cell clears that.
  const clearSelection = async () => {
    await page.evaluate(() => {
      const { paddingX, paddingY, cellWidth, cellHeight } = __dolly.transport.geometry();
      const x = paddingX + Math.floor(cellWidth / 2), y = paddingY + Math.floor(cellHeight / 2);
      __dolly.inputTransport.pushPointer(x, y, 1, {});
      __dolly.inputTransport.pushPointer(x, y, 0, {});
    });
    await page.waitForFunction(() => __dolly.copySelection() === null);
    await page.evaluate(() => new Promise(painted => requestAnimationFrame(() => requestAnimationFrame(painted))));
  };
  // Starts a command and resolves to its status; settled says whether it ended.
  const start = command => {
    const running = Object.assign(submit(command), { settled: false });
    running.then(() => { running.settled = true; });
    return running;
  };

  const fontSize = () => page.evaluate(() => __dolly.fontSize);
  const initialFontSize = await fontSize();
  await keyboard.focus();
  await page.keyboard.press("Control+Shift+Equal");
  await page.waitForFunction(size => __dolly.fontSize > size, initialFontSize);
  await page.keyboard.press("Control+Minus");
  await page.waitForFunction(size => __dolly.fontSize === size, initialFontSize);

  await page.keyboard.press("F11");
  await page.waitForFunction(() => document.documentElement.dataset.fullscreen === "on");
  await page.waitForFunction(() => {
    const canvas = document.querySelector("#display");
    return canvas.width === canvas.clientWidth && canvas.height === canvas.clientHeight;
  });

  await page.evaluate(() => navigator.clipboard.writeText("echo PASTE-BRIDGE-OK > /tmp/paste.txt\n"));
  await keyboard.focus();
  assert.equal(await result(() => page.keyboard.press("Control+Shift+V")), 0);
  assert.equal(await submit("grep -q PASTE-BRIDGE-OK /tmp/paste.txt && rm /tmp/paste.txt"), 0);

  // Select the output row with the mouse and copy it with Ctrl+Shift+C.
  assert.equal(await submit("echo COPY-BRIDGE-TEXT"), 0);
  const index = (await text()).split("\n").lastIndexOf("COPY-BRIDGE-TEXT");
  await clearSelection();
  const row = await page.evaluate(index => {
    const canvas = document.querySelector("#display"), bounds = canvas.getBoundingClientRect();
    const { paddingX, paddingY, cellWidth, cellHeight } = __dolly.transport.geometry();
    const cssX = x => bounds.left + x * bounds.width / canvas.width;
    // Ghostty includes the final cell when the pointer ends in its right half.
    return { start: cssX(paddingX + cellWidth / 4), end: cssX(paddingX + cellWidth * 15.75),
      y: bounds.top + (paddingY + cellHeight * (index + 0.5)) * bounds.height / canvas.height };
  }, index);
  await page.mouse.move(row.start, row.y);
  await page.mouse.down();
  await page.mouse.move(row.end, row.y);
  await page.mouse.up();
  await page.waitForFunction(() => __dolly.copySelection() === "COPY-BRIDGE-TEXT");
  await page.keyboard.press("Control+Shift+C");
  await page.waitForFunction(() => document.documentElement.dataset.clipboard === "copied");
  assert.equal(await clipboard(), "COPY-BRIDGE-TEXT");

  // The mouse wheel reaches Ghostty's scrollback.
  assert.equal(await submit("awk 'BEGIN { for (i = 0; i < 100; i++) printf \"DOLLY-SCROLL-%03d\\n\", i }'"), 0);
  const top = Math.min(...[...(await text()).matchAll(/DOLLY-SCROLL-(\d+)/g)].map(match => Number(match[1])));
  const { cellHeight } = await page.evaluate(() => __dolly.transport.geometry());
  await page.mouse.move(400, 300);
  await page.mouse.wheel(0, -cellHeight * 20);
  await waitForText(new RegExp(`DOLLY-SCROLL-${String(top - 1).padStart(3, "0")}`));
  await page.evaluate(() => __dolly.inputTransport.pushScroll(100000, 1));
  await clearSelection();

  const evidence = await page.evaluate(() => {
    const canvas = document.querySelector("#display");
    const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    const transport = __dolly.transport, geometry = transport.geometry();
    const count = (color, left = 0, top = 0, width = canvas.width, height = canvas.height) => {
      let total = 0;
      for (let y = top; y < top + height; y++) for (let x = left; x < left + width; x++) {
        const index = (y * canvas.width + x) * 4;
        if (color.every((value, channel) => pixels[index + channel] === value)) total++;
      }
      return total;
    };
    const dataset = document.documentElement.dataset;
    return {
      pixels: canvas.width * canvas.height,
      opaque: pixels.filter((value, index) => index % 4 === 3 && value === 255).length,
      background: count([38, 38, 38]), foreground: count([232, 227, 215]), accent: count([242, 212, 92]),
      cursorAccent: count([242, 212, 92], geometry.paddingX + geometry.cursorCol * geometry.cellWidth,
        geometry.paddingY + geometry.cursorRow * geometry.cellHeight, geometry.cellWidth, geometry.cellHeight),
      cursorCell: geometry.cellWidth * geometry.cellHeight,
      cols: Number(dataset.terminalCols), rows: Number(dataset.terminalRows),
      expectedCols: Math.floor((canvas.width - 2 * geometry.paddingX) / geometry.cellWidth),
      expectedRows: Math.floor((canvas.height - 2 * geometry.paddingY) / geometry.cellHeight),
      terminal: dataset.terminal, canvasVisible: !canvas.hidden, logHidden: document.querySelector("#bootstrap-log").hidden,
    };
  });
  assert.equal(evidence.opaque, evidence.pixels);
  assert.ok(evidence.background > evidence.pixels / 2 && evidence.foreground > 100 && evidence.accent > 10, JSON.stringify(evidence));
  assert.ok(evidence.cursorAccent > evidence.cursorCell / 2, "block cursor is not drawn");
  assert.deepEqual([evidence.cols, evidence.rows], [evidence.expectedCols, evidence.expectedRows]);
  assert.deepEqual([evidence.terminal, evidence.canvasVisible, evidence.logHidden], ["ghostty-rgba-wasm", true, true]);
  await page.keyboard.press("F11");
  await page.waitForFunction(() => !document.fullscreenElement);

  // Text, spaces and erased cells share their RGB or palette background.
  assert.equal(await submit("printf '\\033[48;2;20;22;27m\\033[2J\\033[HXX  XX\\033[K\\033[3;1H\\033[48;5;24mXX  XX\\033[K\\033[0m\\033[5;1H'"), 0);
  await page.waitForFunction(() => {
    const { paddingX, paddingY, cellWidth, cellHeight } = __dolly.transport.geometry();
    const context = document.querySelector("#display").getContext("2d");
    return JSON.stringify([[0, 0], [2, 0], [10, 0], [10, 1], [0, 2], [2, 2], [10, 2]].map(([x, y]) =>
      [...context.getImageData(paddingX + x * cellWidth, paddingY + y * cellHeight, 1, 1).data])) ===
      JSON.stringify([...Array(4).fill([20, 22, 27, 255]), ...Array(3).fill([0, 95, 135, 255])]);
  });
  assert.equal(await submit("printf '\\033[0m\\033[2J\\033[H'"), 0);

  const probe = "/tmp/terminal-ui";
  assert.equal(await submit(`curl -fsS ${server.origin}/fixture/terminal-ui.c -o ${probe}.c && cc ${probe}.c -o ${probe}`), 0);
  // Shifted text and Escape arrive as kitty keyboard protocol sequences.
  const keys = start(`${probe} keys`);
  await waitForText(/DOLLY-KEYS-READY/);
  await keyboard.focus();
  for (const key of ["Shift+Semicolon", "Shift+KeyA", "Shift+Slash", "Shift+Minus", "Escape"]) await page.keyboard.press(key);
  assert.equal(await keys, 0);
  assert.equal(await submit(`${probe} discipline`), 0, "termios output flags must round-trip and move Ghostty's cursor");
  // A program that clears ISIG (raw mode) reads Ctrl+C as the byte 0x03.
  const raw = start(`${probe} raw`);
  await waitForText(/DOLLY-RAW-READY/);
  await keyboard.focus();
  await page.keyboard.press("Control+c");
  assert.equal(await raw, 0);

  // Reading and copying the selection while a child sleeps keeps queued
  // typed text, a paste and terminal query replies for that child.
  for (const argument of ["", "query", "partial"]) {
    assert.equal(await submit("printf '\\033[2J\\033[H'"), 0);
    await clearSelection();
    const sleeping = start(`${probe} ${argument}`);
    await page.waitForFunction(() => __dolly.terminal.foregroundInterruptible());
    await page.waitForTimeout(300);
    if (argument === "") await page.keyboard.type("typed");
    else assert.equal(await page.evaluate(() => __dolly.input("typed")), true);
    assert.equal(await page.evaluate(() => __dolly.paste("PASTED")), true);
    const started = performance.now();
    await waitForText(argument === "partial" ? /DOLLY-UI-PRIMED/ : /DOLLY-UI-PREFIX/);
    assert.ok(performance.now() - started < 4000, "selection must not wait for the sleeping child");
    assert.equal(sleeping.settled, false);
    if (argument === "") {
      // More than a ring of UI events recycles slots behind unread input.
      for (let batch = 0; batch < 24; batch++) {
        assert.equal(await page.evaluate(() => {
          for (let i = 0; i < 32; i++) if (!__dolly.inputTransport.pushScroll(i % 2 ? 0.001 : -0.001, 1)) return false;
          return true;
        }), true, "UI events accumulated behind unread input");
        await page.waitForTimeout(30);
      }
    }
    await page.evaluate(() => delete document.documentElement.dataset.clipboard);
    await page.keyboard.press("Control+Shift+C");
    await page.waitForFunction(() => document.documentElement.dataset.clipboard === "copied");
    assert.match(await clipboard(), /DOLLY-UI-PREFIX/);
    assert.equal(await sleeping, 0, `probe ${argument}`);
  }

  // A new surface and a new font size each send SIGWINCH with the terminal's new grid.
  const grid = () => page.evaluate(() => { const { cols, rows } = __dolly.transport.dimensions(); return `${cols}x${rows}`; });
  const reported = async change => (await text()).match(new RegExp(`DOLLY-GRID-${change} (\\d+x\\d+)`))[1];
  const resizing = start(`${probe} resize`), viewport = page.viewportSize(), before = await grid();
  await waitForText(/DOLLY-RESIZE-READY/);
  await page.setViewportSize({ width: viewport.width - 200, height: viewport.height - 100 });
  await waitForText(/DOLLY-GRID-0/);
  assert.notEqual(await grid(), before);
  assert.equal(await reported(0), await grid(), "the surface's grid");
  await keyboard.focus();
  await page.keyboard.press("Control+Minus");
  await waitForText(/DOLLY-GRID-1/);
  assert.equal(await reported(1), await grid(), "the font size's grid");
  assert.notEqual(await reported(1), await reported(0));
  assert.equal(await resizing, 0);
  await page.keyboard.press("Control+Shift+Equal");
  await page.setViewportSize(viewport);
  await page.waitForFunction(before => { const { cols, rows } = __dolly.transport.dimensions(); return `${cols}x${rows}` === before; }, before);

  // The owner of the input lease receives every pointer and scroll record.
  const leased = () => page.evaluate(() => [__dolly.graphicsActive, __dolly.inputTransport.leased()]);
  const lease = start(`${probe} lease`);
  await page.waitForFunction(() => __dolly.graphicsActive && __dolly.inputTransport.leased());
  assert.equal(await page.evaluate(() => {
    const transport = __dolly.inputTransport;
    return transport.pushPointer(20, 20, 1, {}) && transport.pushPointer(40, 20, 2, {}) &&
      transport.pushPointer(40, 20, 0, {}) && transport.pushScroll(1, 1);
  }), true);
  assert.equal(await lease, 0);
  assert.deepEqual(await leased(), [false, false]);
  // Exit ends the leases their owner never released.
  assert.equal(await submit(`${probe} lease-exit`), 0);
  assert.deepEqual(await leased(), [false, false]);
  // A program that only draws reads its keys from the terminal, whose
  // selection the pointer cannot change under the program's frame.
  const drawing = start(`${probe} draw`);
  await page.waitForFunction(() => __dolly.graphicsActive);
  assert.deepEqual(await leased(), [true, false]);
  await page.evaluate(() => {
    __dolly.inputTransport.pushPointer(20, 20, 1, {});
    __dolly.inputTransport.pushPointer(400, 200, 2, {});
    __dolly.inputTransport.pushPointer(400, 200, 0, {});
  });
  await page.waitForFunction(() => __dolly.inputTransport.inputIdle());
  assert.equal(await page.evaluate(() => __dolly.copySelection()), null);
  await keyboard.focus();
  await page.keyboard.press("q");
  assert.equal(await drawing, 0);
  assert.equal(await submit(`rm ${probe} ${probe}.c`), 0);
});
