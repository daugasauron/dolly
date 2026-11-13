// PhotoCraft on gpu@0, on a real adapter, on the private X display DISPLAY names: Chrome on
// Vulkan, or the installed Firefox (docs/gpu.md). photocraft-photos opens the Great Wave and draws
// it without WebGPU errors; Ctrl+I inverts it. Ctrl+O is the page's picker (upload@0): a picture of
// the test's own opens, Ctrl+S saves it through zenity, and the page offers the file it wrote
// (download@0), whose bytes the browser's download holds. Ctrl+Q asks to save the Great Wave,
// zenity's dialog takes the page and gives it back, PhotoCraft writes the JPEG, offers it and
// quits, and the shell reads the copy back. Copy and paste are the page's clipboard (clipboard@0):
// text copied outside pastes into the Layers panel's New Layer dialog, and its Ctrl+C gives it
// back to the browser's clipboard.
// Usage: node demos/photocraft/test/photocraft-gpu-browser.mjs [chromium|firefox ...]
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { crc32, deflateSync } from "node:zlib";
import { chromium, firefox } from "playwright-core";
import { startBrowserServer } from "../../../test/browser-server.mjs";

const browsers = process.argv.length > 2 ? process.argv.slice(2) : ["chromium", "firefox"];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
// A PNG of one colour, WIDTH by HEIGHT.
function png(width, height, rgb) {
  const chunk = (type, data) => {
    const head = Buffer.alloc(8), tail = Buffer.alloc(4);
    head.writeUInt32BE(data.length);
    head.write(type, 4, "latin1");
    tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])));
    return Buffer.concat([head, data, tail]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bits per channel
  header[9] = 2; // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, Buffer.from(rgb))]);
  return Buffer.concat([Buffer.from("\x89PNG\r\n\x1a\n", "latin1"), chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(Array(height).fill(row)))), chunk("IEND", Buffer.alloc(0))]);
}

for (const name of browsers) {
  assert.ok(["chromium", "firefox"].includes(name));
  const server = await startBrowserServer(new URL("../../..", import.meta.url).pathname, "photocraft-photos");
  const browser = name === "firefox"
    ? await firefox.launch({ channel: "moz-firefox", headless: false,
      firefoxUserPrefs: { "dom.webgpu.enabled": true, "dom.events.testing.asyncClipboard": true } })
    : await chromium.launch({ channel: "chrome", headless: false,
      args: ["--no-sandbox", "--ozone-platform=x11", "--enable-unsafe-webgpu", "--use-angle=vulkan", "--enable-features=Vulkan,VulkanFromANGLE"] });
  const deadline = setTimeout(() => void browser.close(), 600_000);
  try {
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    if (name === "chromium") await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: server.origin });
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(0);
    page.on("pageerror", error => errors.push(error.message));
    // WebGPU's validation errors reach the page's console after their batch is answered.
    page.on("console", message => { if (message.text().startsWith("Dolly GPU:")) errors.push(message.text()); });
    await page.goto(server.origin + "/photocraft-photos/");
    await page.waitForFunction(() => window.__dolly?.gpu?.active, null, { polling: 250, timeout: 180_000 });
    const frames = () => page.evaluate(() => __dolly.gpu.stats?.frames ?? 0);
    // It has drawn the picture once it has decoded and uploaded it, and then idles.
    await sleep(30_000);
    const drawn = await frames();
    assert.ok(drawn > 0, "PhotoCraft draws");
    await page.mouse.click(800, 450);
    await page.keyboard.press("Control+i");
    await page.waitForFunction(count => __dolly.gpu.stats.frames > count, drawn, { polling: 250, timeout: 30_000 });
    // The browser keeps the picked file's name, so the document is named for its bytes; its Save
    // As is PhotoCraft's PSD in zenity's dialog, and the page offers what it wrote.
    await page.keyboard.press("Control+o");
    await page.setInputFiles("#file-upload[open] input", { name: "orange.png", mimeType: "image/png", buffer: png(640, 400, [240, 140, 20]) });
    await sleep(10_000);
    await page.keyboard.press("Control+s");
    await sleep(15_000);
    await page.keyboard.press("Enter");
    const offer = page.locator("#downloads button", { hasText: "Save upload.psd" });
    await offer.waitFor({ timeout: 60_000 });
    const download = page.waitForEvent("download");
    await offer.click();
    const psd = await readFile(await (await download).path());
    assert.equal(psd.toString("latin1", 0, 4), "8BPS", "the download is the PSD PhotoCraft wrote");
    assert.deepEqual([psd.readUInt32BE(18), psd.readUInt32BE(14)], [640, 400], "of the picture uploaded");
    // The browser's text pastes into the New Layer dialog's name (the Layers panel's menu), and
    // the field's Ctrl+C gives it back.
    await page.evaluate(() => navigator.clipboard.writeText("Copied outside"));
    await page.mouse.click(LAYERS_MENU.x, LAYERS_MENU.y);
    await sleep(1000);
    await page.mouse.click(NEW_LAYER.x, NEW_LAYER.y);
    await sleep(2000);
    await page.mouse.click(NAME_FIELD.x, NAME_FIELD.y);
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Control+v");
    await sleep(1000);
    await page.keyboard.press("Control+a");
    await page.evaluate(() => { delete document.documentElement.dataset.clipboardCopy; });
    await page.keyboard.press("Control+c");
    await page.waitForFunction(() => document.documentElement.dataset.clipboardCopy === "copied", null, { timeout: 10_000 });
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "Copied outside");
    await page.keyboard.press("Enter");
    await sleep(2000);
    if (name === "chromium") await page.screenshot({ path: `build/photocraft-clipboard-${name}.png` });
    await page.mouse.click(800, 450);
    // Quitting asks to save: zenity's dialog opens in ~/Pictures on great-wave.jpg, Enter saves
    // and then replaces it, and Enter takes PhotoCraft's JPEG options.
    await sleep(3000);
    await page.keyboard.press("Control+q");
    await sleep(3000);
    await page.keyboard.press("y");
    await sleep(15_000);
    for (const pause of [3000, 15_000, 0]) {
      await page.keyboard.press("Enter");
      await sleep(pause);
    }
    await page.waitForFunction(() => !__dolly.gpu.active, null, { polling: 250, timeout: 120_000 });
    await page.locator("#downloads button", { hasText: "Save great-wave.jpg" }).waitFor({ timeout: 30_000 });
    await page.evaluate(() => __dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "shell"));
    const run = async command => assert.equal(await page.evaluate(text => __dolly.submit(text), command), 0, command);
    // The copy PhotoCraft wrote replaces the original, of the same size in pixels.
    await run("test $(wc -c < ~/Pictures/great-wave.jpg) -ne 2354187");
    await run("photocraft-cli info ~/Pictures/great-wave.jpg | grep -q '\"width\": 3859'");
    await run("test -f ~/upload.psd");
    assert.deepEqual(errors, [], `${name}: no WebGPU or page errors`);
    console.log(`photocraft-gpu: ${name} passed (${drawn} frames before the edit)`);
  } finally {
    clearTimeout(deadline);
    await browser.close();
    await server.close();
  }
}
