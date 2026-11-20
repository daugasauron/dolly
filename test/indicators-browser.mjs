import assert from "node:assert/strict";
import { browserTest, workbench } from "./browser.mjs";

// The page's indicators show when the page is ready, hide ten seconds later
// (on the page's clock, which the test advances) and follow Ctrl+Shift+F,
// which the guest never reads. A download offer shows them and holds them
// shown until it is answered. Hidden, they leave the bottom corners to a
// program's own controls; shown, the offer takes its click.
const server = { fixtures: { "corner-control.c": "test/fixtures/corner-control.c" } };
await browserTest("indicators", { image: "system", server }, async ({ server, open }) => {
  const { page, submit, text } = await open({ ...await workbench([], [], { setup: page => page.clock.install() }),
    policy: { rules: [{ origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] }] } });
  const shown = () => page.evaluate(() => document.documentElement.dataset.indicators === "shown");
  const elapse = () => page.clock.fastForward(10_000);
  const downloads = page.locator("#downloads");
  assert.equal(await shown(), true, "the indicators are not shown on load");
  await page.clock.fastForward(5000);
  assert.equal(await shown(), true, "the indicators hid within five seconds");
  const probe = "/tmp/corner-control";
  assert.equal(await submit(`curl -fsS ${server.origin}/fixture/corner-control.c -o ${probe}.c && cc ${probe}.c -o ${probe}`), 0, await text());
  await page.clock.fastForward(5000);
  assert.equal(await shown(), false, "the indicators outlived their ten seconds");

  assert.equal(await submit("download /etc/dolly/Dollyfile"), 0);
  assert.equal(await downloads.isVisible(), true, "a waiting download did not show the indicators");
  await elapse();
  assert.equal(await downloads.isVisible(), true, "a waiting download was hidden by the delay");
  const box = await page.getByRole("button", { name: "Dismiss" }).boundingBox(), { width } = page.viewportSize();
  const left = [box.x + box.width / 2, box.y + box.height / 2], right = [width - left[0], left[1]];

  const running = submit(probe);
  await page.waitForFunction(() => __dolly.graphicsActive);
  await page.keyboard.press("Control+Shift+F");
  assert.equal(await downloads.isHidden(), true, "the chord did not hide the indicators");
  await page.mouse.click(...left);
  await page.mouse.click(...right);
  await page.keyboard.press("Control+Shift+F");
  assert.equal(await downloads.isVisible(), true, "the chord did not show the indicators");
  // Dismiss takes the click and hands the keys back to the program.
  await page.mouse.click(...left);
  assert.equal(await downloads.isHidden(), true, "the offer did not take its click");
  await page.keyboard.press("f");
  await page.keyboard.press("Escape");
  assert.equal(await running, 0);
  const report = (await text()).match(/CORNERS([^\n]*) END/)?.[1].trim().split(" ");
  assert.deepEqual(report?.filter(word => ["left", "right"].includes(word)), ["left", "right"],
    "the program did not get exactly the presses made while the indicators were hidden");
  assert.equal(report.filter(code => code === "KeyF").length, 1, `the guest read the chord's key: ${report}`);
  await elapse();
  assert.equal(await shown(), false, "the indicators stayed after the last offer was answered");

  // A text field of an embedding's own, outside Dolly's element, keeps the chord.
  await page.evaluate(() => document.body.append(Object.assign(document.createElement("input"), { id: "embedding-field" })));
  await page.focus("#embedding-field");
  await page.keyboard.press("Control+Shift+F");
  assert.equal(await shown(), false, "the page took the chord from the embedding's own field");
});
