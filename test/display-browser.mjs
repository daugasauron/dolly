import assert from "node:assert/strict";
import { browserTest } from "./browser.mjs";

// The page's presenter and input ring: an idle terminal requests no animation
// frames and output wakes it; pointer motion is one record per frame, waits
// for a program that does not read and never takes a key's slot; a record the
// ring has no room for is counted and shown.
const server = { fixtures: { "terminal-ui.c": "test/fixtures/terminal-ui.c" } };
await browserTest("display", { server }, async ({ server, open }) => {
  const { page, submit, text } = await open({
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
  assert.equal(await submit(`rm ${probe} ${probe}.c`), 0);
});
