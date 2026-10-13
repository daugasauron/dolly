import assert from "node:assert/strict";
import { browserTest } from "./browser.mjs";

// The page's indicators show when the page is ready, hide ten seconds later
// (on the page's clock, which the test advances) and follow Ctrl+Shift+F,
// which the guest never reads. Hidden, they leave the bottom corners to a
// program's own controls; shown, the Save button takes its click; a download
// offer and a failed save hold them shown until answered.
const server = { fixtures: { "corner-control.c": "test/fixtures/corner-control.c" } };
await browserTest("indicators", { image: "system", server }, async ({ server, open }) => {
  const { page, submit, text } = await open({
    policy: { rules: [{ origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] }] },
    setup: page => page.clock.install() });
  const save = page.locator("#session-open"), downloads = page.locator("#downloads");
  assert.equal(await save.isVisible(), true, "the Save button is not shown on load");
  await page.clock.fastForward(5000);
  assert.equal(await save.isVisible(), true, "the indicators hid within five seconds");
  const box = await save.boundingBox(), { width } = page.viewportSize();
  const right = [box.x + box.width / 2, box.y + box.height / 2], left = [width - right[0], right[1]];

  const probe = "/tmp/corner-control";
  assert.equal(await submit(`curl -fsS ${server.origin}/fixture/corner-control.c -o ${probe}.c && cc ${probe}.c -o ${probe}`), 0, await text());
  await page.clock.fastForward(5000);
  assert.equal(await save.isHidden(), true, "the indicators outlived their ten seconds");

  const running = submit(probe);
  await page.waitForFunction(() => __dolly.graphicsActive);
  await page.mouse.click(...left);
  await page.mouse.click(...right);
  await page.keyboard.press("Control+Shift+F");
  assert.equal(await save.isVisible(), true, "the chord did not show the indicators");
  await page.mouse.click(...right);
  await page.locator("#session-dialog").waitFor();
  await page.click("#session-close");
  // The dialog hands the keyboard back on its close event, a frame later.
  await page.waitForFunction(() => document.activeElement === document.querySelector("#keyboard"));
  await page.keyboard.press("Control+Shift+F");
  assert.equal(await save.isHidden(), true, "the chord did not hide the indicators");
  await page.keyboard.press("f");
  await page.keyboard.press("Escape");
  assert.equal(await running, 0);
  const report = (await text()).match(/CORNERS([^\n]*) END/)?.[1].trim().split(" ");
  assert.deepEqual(report?.filter(word => ["left", "right"].includes(word)), ["left", "right"],
    "the program did not get exactly the presses made while the indicators were hidden");
  assert.equal(report.filter(code => code === "KeyF").length, 1, `the guest read the chord's key: ${report}`);

  const elapse = () => page.clock.fastForward(10_000);
  assert.equal(await submit("download /etc/dolly/Dollyfile"), 0);
  assert.equal(await downloads.isVisible() && await save.isVisible(), true, "a waiting download did not show the indicators");
  await elapse();
  assert.equal(await downloads.isVisible(), true, "a waiting download was hidden by the delay");
  await page.getByRole("button", { name: "Dismiss" }).click();
  assert.equal(await save.isVisible(), true);
  await elapse();
  assert.equal(await save.isHidden(), true, "the indicators stayed after the last offer was answered");

  // A failed save holds them until a save succeeds.
  await page.evaluate(() => __dolly.saveSession("not a name").catch(() => {}));
  await elapse();
  assert.equal(await save.isVisible(), true, "a failed save was hidden by the delay");
  assert.equal(await page.evaluate(() => __dolly.saveSession("indicators")), "indicators");
  assert.equal(await save.isVisible(), true);
  await elapse();
  assert.equal(await save.isHidden(), true, "the indicators stayed after the save succeeded");
});
