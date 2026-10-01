import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium, firefox } from "playwright-core";
import { startBrowserServer } from "./browser-server.mjs";

// The page names the adapter gpu@0 programs get, or why they have none.
//   chromium  headless Chrome as the core tests run it (SwiftShader): software;
//             the GPU Worker given no adapter: unavailable once a program opens;
//             Chrome without WebGPU flags: unavailable before ENTRY
//   firefox   Firefox as it ships, without navigator.gpu: unavailable before ENTRY
//   hardware  Chrome with Vulkan WebGPU, needs a display and a GPU: hardware
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
const provider = await readFile(new URL("../host/gpu/worker.mjs", import.meta.url), "utf8");
const sourceOverrides = new Map();
const server = await startBrowserServer(new URL("..", import.meta.url).pathname, "gpu-sdk", { sourceOverrides });
try {
  for (const [state, launch, { workerAdapter = true } = {}] of names.flatMap(name => cases[name])) {
    if (workerAdapter) sourceOverrides.delete("/host/gpu/worker.mjs");
    else sourceOverrides.set("/host/gpu/worker.mjs", `navigator.gpu.requestAdapter = async () => null;\n${provider}`);
    const browser = await launch(), deadline = setTimeout(() => void browser.close(), 180_000);
    try {
      const page = await browser.newPage();
      await page.goto(`${server.origin}/gpu-sdk/`);
      await page.waitForFunction(() => ["ready", "failed"].includes(document.documentElement.dataset.dollyStatus), null, { timeout: 120_000 });
      const indicator = () => page.evaluate(() => {
        const element = document.querySelector("#gpu-status");
        return { gpu: element?.dataset.gpu, link: element?.querySelector("a")?.href ?? null };
      });
      const enableSteps = `${server.origin}/docs/gpu.md#enabling-webgpu`;
      const label = `${browser.version()} ${state}${workerAdapter ? "" : " without a Worker adapter"}`;
      if (state === "unavailable") {
        // A required provider without an adapter fails before ENTRY.
        assert.equal(await page.evaluate(() => document.documentElement.dataset.dollyStatus), "failed");
        assert.deepEqual(await indicator(), { gpu: "unavailable", link: enableSteps });
        console.log(`gpu indicator: ${label} passed`);
        continue;
      }
      assert.equal(await page.evaluate(() => document.documentElement.dataset.dollyStatus), "ready",
        await page.locator("#bootstrap-log").textContent());
      assert.deepEqual(await indicator(), { gpu: state, link: null });
      await page.evaluate(() => __dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "shell"));
      const submit = command => page.evaluate(command => __dolly.submit(command), command);
      assert.equal(await submit(program), 0);
      assert.equal(await submit("cc /tmp/open.c -ldolly-gpu -o /tmp/open"), 0, await page.evaluate(() => __dolly.visibleTerminalText()));
      // The provider reports the adapter of the device it opens, or why it has none.
      assert.equal(await submit("/tmp/open"), workerAdapter ? 0 : 1);
      assert.deepEqual(await indicator(), workerAdapter ? { gpu: state, link: null } : { gpu: "unavailable", link: enableSteps });
      if (workerAdapter) assert.equal(await page.evaluate(() => __dolly.gpu.isFallbackAdapter), state === "software");
      console.log(`gpu indicator: ${label} passed`);
    } finally { clearTimeout(deadline); await browser.close(); }
  }
} finally { await server.close(); }
