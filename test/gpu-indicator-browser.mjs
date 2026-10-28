import assert from "node:assert/strict";
import { chromium, firefox } from "playwright-core";
import { composed } from "./browser.mjs";
import { gpuAdapterMocks, startBrowserServer } from "./browser-server.mjs";

// The page names the adapter gpu@0 programs get, or why they have none.
//   chromium  headless Chrome as the core tests run it (SwiftShader): software;
//             the GPU Worker's adapter mocked away (no browser setup gives the
//             page an adapter and a Worker none): unavailable once a program opens;
//             Chrome without WebGPU flags: unavailable from boot
//   firefox   Firefox as it ships, without navigator.gpu: unavailable from boot
//   hardware  Chrome with Vulkan WebGPU, needs a display and a GPU: hardware
// Unavailable, the image boots all the same, the status line says why, and a
// program's OPEN fails.
const names = process.argv.slice(2);
if (!names.length) names.push("chromium", "firefox");
assert.ok(names.every(name => ["chromium", "firefox", "hardware"].includes(name)),
  "usage: node test/gpu-indicator-browser.mjs [chromium|firefox|hardware ...]");
const chrome = (headless, args) => () => chromium.launch({ channel: "chrome", headless, args: ["--no-sandbox", ...args] });
const cases = {
  chromium: [
    ["software", chrome(true, ["--disable-gpu", "--enable-unsafe-webgpu"])],
    ["software", chrome(true, ["--disable-gpu", "--enable-unsafe-webgpu"]), { workerAdapter: false }],
    ["unavailable", chrome(true, [])],
  ],
  firefox: [["unavailable", () => firefox.launch({ headless: true, firefoxUserPrefs: { "dom.webgpu.enabled": false } })]],
  hardware: [["hardware", chrome(false, ["--ozone-platform=x11", "--enable-unsafe-webgpu",
    "--enable-features=Vulkan", "--use-angle=vulkan"])]],
};
const program = "printf '%s\\n' '#include <dolly/gpu.h>' " +
  "'int main(void) { static dolly_gpu g; return dolly_gpu_open(&g, 0, 0) < 0; }' > /tmp/open.c";
const sourceOverrides = new Map(), noAdapter = await gpuAdapterMocks("gpu-no-adapter.mjs");
const server = await startBrowserServer(new URL("..", import.meta.url).pathname, "system", { sourceOverrides });
// system with gpu@0 and its client: an image that declares the module.
const image = await composed(["gpu"], ["libdolly-gpu"], { base: "system" });
try {
  for (const [state, launch, { workerAdapter = true } = {}] of names.flatMap(name => cases[name])) {
    if (workerAdapter) sourceOverrides.clear();
    else sourceOverrides.set(...noAdapter);
    const browser = await launch(), deadline = setTimeout(() => void browser.close(), 180_000);
    try {
      const page = await browser.newPage();
      await image.setup(page);
      await page.goto(server.origin + image.path);
      await page.waitForFunction(() => ["ready", "failed"].includes(document.documentElement.dataset.dollyStatus), null, { timeout: 120_000 });
      const indicator = () => page.evaluate(() => {
        const element = document.querySelector("#gpu-status");
        return { gpu: element?.dataset.gpu, link: element?.querySelector("a")?.href ?? null };
      });
      const enableSteps = `${server.origin}/docs/gpu.md#enabling-webgpu`;
      const label = `${browser.version()} ${state}${workerAdapter ? "" : " without a Worker adapter"}`;
      assert.equal(await page.evaluate(() => document.documentElement.dataset.dollyStatus), "ready",
        await page.locator("#bootstrap-log").textContent());
      const unavailable = state === "unavailable";
      assert.deepEqual(await indicator(), unavailable ? { gpu: state, link: enableSteps } : { gpu: state, link: null });
      if (unavailable) assert.match(await page.locator("#session-status").textContent(), /No WebGPU adapter/);
      await page.evaluate(() => __dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "shell"));
      const submit = command => page.evaluate(command => __dolly.submit(command), command);
      assert.equal(await submit(program), 0);
      assert.equal(await submit("cc /tmp/open.c -ldolly-gpu -o /tmp/open"), 0, await page.evaluate(() => __dolly.visibleTerminalText()));
      // The provider reports the adapter of the device it opens, or why it has none.
      const opens = workerAdapter && !unavailable;
      assert.equal(await submit("/tmp/open"), opens ? 0 : 1);
      assert.deepEqual(await indicator(), opens ? { gpu: state, link: null } : { gpu: "unavailable", link: enableSteps });
      if (opens) assert.equal(await page.evaluate(() => __dolly.gpu.isFallbackAdapter), state === "software");
      console.log(`gpu indicator: ${label} passed`);
    } finally { clearTimeout(deadline); await browser.close(); }
  }
} finally { await server.close(); }
