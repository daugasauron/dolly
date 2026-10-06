import assert from "node:assert/strict";
import { browserTest } from "./browser.mjs";

// The page's presenter and input ring: an idle terminal requests no animation
// frames and output wakes it; pointer motion is one record per frame, waits
// for a program that does not read and never takes a key's slot; a record the
// ring has no room for is counted and shown; when a foreground program ends
// the terminal keeps its pointer records, and the keys typed while that
// program's Worker retires reach the shell.
const server = { fixtures: { "terminal-ui.c": "test/fixtures/terminal-ui.c" } };
await browserTest("display", { image: "system", server }, async ({ server, open }) => {
  const { page, submit, text, waitForText } = await open({
    policy: { rules: [{ origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] }] },
    setup: page => page.addInitScript(() => {
      const request = requestAnimationFrame.bind(window);
      globalThis.animationFrameRequests = 0;
      globalThis.requestAnimationFrame = callback => { animationFrameRequests++; return request(callback); };
    }) });
  const dataset = () => page.evaluate(() => ({ ...document.documentElement.dataset }));

  const requests = () => page.evaluate(() => animationFrameRequests);
  const sleeping = submit("sleep 2; echo DISPLAY-WOKEN");
  await page.waitForTimeout(1000);
  const [idle, { frameSequence }] = [await requests(), await dataset()];
  await page.waitForTimeout(500);
  const requested = await requests() - idle;
  assert.equal(await sleeping, 0);
  assert.equal(requested, 0, "an idle terminal requested animation frames");
  await page.waitForFunction(frame => document.documentElement.dataset.frameSequence !== frame, frameSequence);

  const probe = "/tmp/display-ui";
  assert.equal(await submit(`curl -fsS ${server.origin}/fixture/terminal-ui.c -o ${probe}.c && cc ${probe}.c -o ${probe}`), 0);
  // The probe holds the display for three seconds without reading input, then
  // reports the key and motion records it finds and the distance they add up to.
  async function unread(burst) {
    const running = submit(`${probe} unread`);
    await page.waitForFunction(() => __dolly.graphicsActive);
    await burst();
    assert.equal(await running, 0);
    const [keys, motions, moved] = [...(await text()).matchAll(/DOLLY-UNREAD keys=(\d+) motions=(\d+) moved=(-?\d+)/g)]
      .at(-1).slice(1).map(Number);
    return { keys, motions, moved };
  }
  const motion = count => page.evaluate(async count => {
    for (let sample = 0; sample < count; sample++) __dolly.transport.pushPointerMotion({ movementX: 1.5, movementY: 0 });
    await new Promise(painted => requestAnimationFrame(() => requestAnimationFrame(painted)));
  }, count);
  const scrolls = count => page.evaluate(count => {
    for (let record = 0; record < count; record++) if (!__dolly.transport.pushScroll(1)) return false;
    return true;
  }, count);
  const press = async count => { for (let key = 0; key < count; key++) await page.keyboard.press("k"); };

  // Forty motions in a frame are one record. With half the ring unread, later
  // motion waits on the page; the keys still arrive, and so does the motion
  // once the program reads.
  assert.deepEqual(await unread(async () => {
    await motion(40);
    assert.equal(await scrolls(130), true);
    await motion(40);
    await press(5);
  }), { keys: 10, motions: 2, moved: 120000 });
  assert.equal((await dataset()).inputDropped, undefined);

  // A full ring loses the key records it cannot take: each one is counted and the page says so.
  const { keys } = await unread(async () => {
    assert.equal(await scrolls(236), true);
    await press(20);
    assert.equal(await page.locator("#session-status").isVisible(), true);
  });
  const dropped = Number((await dataset()).inputDropped);
  assert.ok(dropped > 0 && keys + dropped === 40, `${keys} key records arrived and ${dropped} were reported dropped`);

  // A large interactive program's Worker retires half a second after it exits.
  // Until then no foreground program is published, and the pointer is the
  // terminal's: a drag along the ruler the program printed is not dropped
  // with the program's unread input when the Worker retires.
  const retiring = submit(`foreground -i ${probe} retire`);
  const dragged = await page.evaluate(async () => {
    const { transport, terminal } = __dolly, turn = () => new Promise(resolve => setTimeout(resolve, 4));
    while (terminal.foregroundPid() !== 0) await turn();
    const { paddingX, paddingY, cellWidth, cellHeight } = transport.geometry(), y = Math.round(paddingY + cellHeight / 2);
    transport.pushPointer(paddingX + cellWidth / 4, y, 1, {});
    let column = 0;
    do {
      column = column % 100 + 1;
      transport.writeRecord({ type: transport.constructor.pointerEvent, action: 2,
        width: Math.round(paddingX + (column + 0.75) * cellWidth), height: y });
      await turn();
    } while (terminal.foregroundPid() === 0);
    return column;
  });
  assert.equal(await retiring, 0);
  const ruler = "abcdefghijklmnopqrstuvwxyz".repeat(5).slice(0, dragged + 1);
  await page.waitForFunction(ruler => __dolly.copySelection() === ruler, ruler);
  // Keys typed in that half second are the next reader's, not the unread
  // input of the program that exited: the shell runs the command.
  const retired = submit(`foreground -i ${probe} retire`);
  await page.evaluate(async () => {
    while (__dolly.terminal.foregroundPid() !== 0) await new Promise(resolve => setTimeout(resolve, 4));
    __dolly.transport.pushText("echo TYPED-$((40 + 2))\r");
  });
  assert.equal(await retired, 0);
  await waitForText(/^TYPED-42$/m);
  assert.equal(await submit(`rm ${probe} ${probe}.c`), 0);
});
