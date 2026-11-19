// Where a click on a program's window lands, on a real adapter, on the private X display DISPLAY
// names (docs/gpu.md): in the frame gpu@0 draws and the one display@0 shows
// (test/fixtures/pointer.c), each of the size the surface had when the program took it, as
// PhotoCraft's is. After the first click the program's button brings the page's bar below the
// canvas, and then the window grows narrower: a click lands on the pixel of the frame under it
// before, at once after and a second after each change of the canvas's box, and the program
// reads the canvas's new size (input@0's SURFACE records).
//   node test/pointer-browser.mjs chromium|firefox
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { composed, launchInstalledFirefox, putFixture } from "./browser.mjs";
import { startBrowserServer } from "./browser-server.mjs";

const name = process.argv[2] ?? "chromium";
assert.ok(["chromium", "firefox"].includes(name));
const server = await startBrowserServer(new URL("..", import.meta.url).pathname, "system");
const browser = name === "firefox"
  ? await launchInstalledFirefox()
  : await chromium.launch({ channel: "chrome", headless: false,
    args: ["--no-sandbox", "--ozone-platform=x11", "--enable-unsafe-webgpu", "--use-angle=vulkan", "--enable-features=Vulkan,VulkanFromANGLE"] });
const deadline = setTimeout(() => void browser.close(), 400_000);
try {
  const viewport = { width: 1000, height: 700 };
  const page = await browser.newPage({ viewport }), errors = [];
  page.setDefaultTimeout(60_000);
  page.on("pageerror", error => errors.push(error.message));
  const image = await composed(["display", "input", "gpu", "touch"],
    ["libdolly-display", "libdolly-input", "libdolly-gpu", "libdolly-touch"], { base: "system" });
  await image.setup(page);
  await page.goto(server.origin + image.path);
  await page.waitForFunction(() => ["ready", "failed"].includes(document.documentElement.dataset.dollyStatus), null, { timeout: 180_000 });
  await page.evaluate(() => __dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "shell"));
  const submit = command => page.evaluate(text => __dolly.submit(text), command);
  const screen = () => page.evaluate(() => __dolly.visibleTerminalText());
  await putFixture(submit, "/tmp/pointer.c", "test/fixtures/pointer.c");
  assert.equal(await submit("cc /tmp/pointer.c -ldolly-gpu -ldolly-display -ldolly-input -ldolly-touch -o /tmp/pointer"), 0, await screen());

  // The point of the page at a fraction of the frame shown, and the frame's pixel there: the
  // frame fills the box that shows it at its own shape, centred, gpu@0's box (the canvas's
  // parent) while it draws, else the display's canvas.
  const shown = ([across, down]) => page.evaluate(([across, down]) => {
    const gpu = __dolly.gpu.active, canvas = document.querySelector(gpu ? "#gpu-display" : "#display");
    const box = (gpu ? canvas.parentElement : canvas).getBoundingClientRect();
    const [width, height] = gpu ? [__dolly.gpu.width, __dolly.gpu.height] : [canvas.width, canvas.height];
    const scale = Math.min(box.width / width, box.height / height);
    const left = box.x + (box.width - width * scale) / 2, top = box.y + (box.height - height * scale) / 2;
    const point = [Math.round(left + across * width * scale), Math.round(top + down * height * scale)];
    return { point, pixel: [Math.round((point[0] - left) / scale), Math.round((point[1] - top) / scale)] };
  }, [across, down]);
  // One click, then each change of the layout and three clicks at once and three a second later.
  async function clicks(mode, changes) {
    await page.setViewportSize(viewport);
    assert.equal(await submit("clear"), 0);
    const running = submit(`/tmp/pointer ${mode} ${1 + changes.length * 6}`);
    await page.waitForFunction(gpu => __dolly.inputTransport.leased() && (!gpu || __dolly.gpu.active), mode === "gpu");
    const expected = [];
    const click = async fraction => {
      const { point, pixel } = await shown(fraction);
      expected.push(pixel);
      await page.mouse.click(...point);
    };
    await click([0.5, 0.5]);
    let canvas;
    for (const change of changes) {
      await change();
      canvas = await page.evaluate(() => {
        const box = document.querySelector("#display");
        return `${Math.round(box.clientWidth * devicePixelRatio)} ${Math.round(box.clientHeight * devicePixelRatio)}`;
      });
      for (const pause of [0, 1000]) {
        await page.waitForTimeout(pause);
        for (const fraction of [[0.5, 0.33], [0.1, 0.1], [0.9, 0.85]]) await click(fraction);
      }
    }
    assert.equal(await running, 0, await screen());
    const landed = (await screen()).split("\n").filter(line => line.startsWith("POINTERS "))
      .flatMap(line => [...line.matchAll(/(\d+),(\d+)/g)].map(match => [Number(match[1]), Number(match[2])]));
    assert.equal(landed.length, expected.length, await screen());
    landed.forEach((pixel, index) => assert.ok(pixel.every((value, axis) => Math.abs(value - expected[index][axis]) <= 1),
      `${mode}: click ${index} landed on ${pixel}, shown at ${expected[index]}`));
    // The program was told the canvas's size after the last change, in device pixels.
    assert.match(await screen(), new RegExp(`^SURFACE ${canvas}$`, "m"), `${mode}: the program reads the canvas's size`);
    console.log(`pointer: ${name} ${mode}: ${landed.length} clicks on the pixels under them`);
  }
  for (const mode of ["gpu", "display"]) {
    await clicks(mode, [() => page.locator("#buttons button", { hasText: "Bar" }).waitFor(),
      () => page.setViewportSize({ width: 700, height: viewport.height })]);
  }
  assert.deepEqual(errors, []);
} finally {
  clearTimeout(deadline);
  await browser.close();
  await server.close();
}
