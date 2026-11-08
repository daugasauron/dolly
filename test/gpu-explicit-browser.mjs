// gpu@0's explicit records (test/fixtures/gpu-explicit.c) on a real adapter, on the private X
// display DISPLAY names: Chrome on Vulkan, or the installed Firefox (docs/gpu.md).
//   node test/gpu-explicit-browser.mjs chromium|firefox
import assert from "node:assert/strict";
import { chromium, firefox } from "playwright-core";
import { composed } from "./browser.mjs";
import { startBrowserServer } from "./browser-server.mjs";

const name = process.argv[2] ?? "chromium";
assert.ok(["chromium", "firefox"].includes(name));
const server = await startBrowserServer(new URL("..", import.meta.url).pathname, "system",
  { fixtures: { "gpu-explicit.c": "test/fixtures/gpu-explicit.c" } });
const browser = name === "firefox"
  ? await firefox.launch({ channel: "moz-firefox", headless: false, firefoxUserPrefs: { "dom.webgpu.enabled": true } })
  : await chromium.launch({ channel: "chrome", headless: false,
    args: ["--no-sandbox", "--ozone-platform=x11", "--enable-unsafe-webgpu", "--use-angle=vulkan", "--enable-features=Vulkan,VulkanFromANGLE"] });
const deadline = setTimeout(() => void browser.close(), 180_000);
try {
  const page = await browser.newPage(), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(origin => {
    globalThis.DOLLY_HTTP_POLICY = { maxRequests: 1, rules: [{ origin, pathPrefix: "/fixture/", methods: ["GET"] }] };
  }, server.origin);
  const image = await composed(["gpu"], ["libdolly-gpu"], { base: "system" });
  await image.setup(page);
  await page.goto(server.origin + image.path);
  await page.waitForFunction(() => ["ready", "failed"].includes(document.documentElement.dataset.dollyStatus), null, { timeout: 120_000 });
  await page.evaluate(() => __dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "shell"));
  const submit = command => page.evaluate(text => __dolly.submit(text), command);
  const screen = () => page.evaluate(() => __dolly.visibleTerminalText());
  assert.equal(await submit(`curl -fsS ${server.origin}/fixture/gpu-explicit.c -o /tmp/gpu-explicit.c`), 0);
  assert.equal(await submit("cc /tmp/gpu-explicit.c -ldolly-gpu -o /tmp/gpu-explicit"), 0, await screen());
  assert.equal(await submit("/tmp/gpu-explicit"), 0, `${await screen()}\n${JSON.stringify(await page.evaluate(() => __dolly.gpu))}`);
  const terminal = await screen();
  assert.match(terminal, /GPU explicit records PASS/);
  assert.equal(await page.evaluate(() => __dolly.gpu.isFallbackAdapter), false);
  assert.deepEqual(errors, []);
  for (const line of terminal.split("\n").filter(line => line.startsWith("GPU explicit"))) console.log(name, line);
} finally {
  clearTimeout(deadline);
  await browser.close();
  await server.close();
}
