// Mojo programs cross-compiled for Dolly (../cross-compile.sh) link against
// the mojo-runtime image's libraries and run there: hello, the standard
// library, coroutines, and kernels that DeviceContext launches on WebGPU.
// Usage: node demos/mojo/target/test/mojo-target-browser.mjs
// Headless Chrome has a software adapter. With a GPU window on DISPLAY, Chrome
// and the installed Firefox use the GPU as well.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { chromium, firefox } from "playwright-core";
import { startBrowserServer } from "../../../../test/browser-server.mjs";
import { shellPrompt } from "../../../browser.mjs";

const root = new URL("../../../../", import.meta.url);
const gpu = "-lmojo-gpu -ldolly-gpu", programs = { hello: "", library: "", tasks: "", saxpy: gpu, kernels: gpu, mandelbrot: gpu };
const objects = Object.fromEntries(Object.keys(programs).map(name => [`${name}.o`, `build/mojo-target/objects/${name}.o`]));
if (!Object.values(objects).every(path => existsSync(new URL(path, root)))) {
  console.log("mojo-target: skipped, it needs the objects of demos/mojo/target/cross-compile.sh");
  process.exit(0);
}
// The installed Firefox is a snap with a private /tmp: its profile must live under $HOME.
process.env.TMPDIR = new URL("build/mojo-target/tmp/", root).pathname;
await mkdir(process.env.TMPDIR, { recursive: true });
const launches = { "headless chromium": () => chromium.launch({ channel: "chrome", headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--enable-unsafe-webgpu"] }) };
if (process.env.DISPLAY) {
  launches.chromium = () => chromium.launch({ channel: "chrome", headless: false,
    args: ["--no-sandbox", "--ozone-platform=x11", "--enable-unsafe-webgpu", "--use-angle=vulkan", "--enable-features=Vulkan"] });
  launches.firefox = () => firefox.launch({ channel: "moz-firefox", headless: false, firefoxUserPrefs: { "dom.webgpu.enabled": true } });
}

const server = await startBrowserServer(root.pathname, "mojo-runtime", { fixtures: objects });
try {
  for (const [name, launch] of Object.entries(launches)) {
    const browser = await launch();
    try {
      const page = await (await browser.newContext()).newPage();
      await page.addInitScript(policy => { globalThis.DOLLY_HTTP_POLICY = policy; },
        { maxRequests: 16, rules: [{ origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] }] });
      await page.goto(`${server.origin}/mojo-runtime/`);
      await page.waitForFunction(() => ["ready", "failed"].includes(document.documentElement.dataset.dollyStatus), null, { timeout: 180_000 });
      assert.equal(await page.evaluate(() => document.documentElement.dataset.dollyStatus), "ready", await page.locator("#bootstrap-log").textContent());
      await page.evaluate(([source, flags]) => __dolly.waitForInteractiveTerminal(new RegExp(source, flags), "terminal prompt", 0),
        [shellPrompt.source, shellPrompt.flags]);
      const run = async command => assert.equal(await page.evaluate(command => __dolly.submit(command), command), 0,
        `${name}: ${command}\n${await page.evaluate(() => __dolly.visibleTerminalText())}\n${await page.evaluate(() => __dolly.gpu.error ?? "")}`);
      for (const [program, libraries] of Object.entries(programs)) {
        await run(`curl -fsS ${server.origin}/fixture/${program}.o -o /tmp/${program}.o`);
        await run(`cc /tmp/${program}.o ${libraries} -lmojo-rt -o /tmp/${program}`);
      }
      await run("/tmp/hello | grep -qx 'hello from mojo'");
      await run("/tmp/library one | grep -qx 'MOJO-LIBRARY 6 5 29 True 2 7.25 True'");
      await run("/tmp/tasks | grep -qx 'MOJO-TASKS 33 6'");
      await run("/tmp/saxpy | grep -qx 'MOJO-GPU webgpu 1000 1998.5'");
      // A loop, integer arithmetic in 8, 16 and 32 bits on a two-dimensional grid, math functions within 1e-3 of the host.
      await run("/tmp/kernels | grep -qx 'MOJO-KERNELS wrong: 0 0 0 236646'");
      // The Mandelbrot set as text (its middle row is inside from column 22 on), and a matrix product.
      await run("/tmp/mandelbrot > /tmp/set.txt && grep -q '^ *[.:=+*#%@-]*@\\{40\\}' /tmp/set.txt && grep -qx 'MOJO-MATMUL wrong: 0 of 576 6.0' /tmp/set.txt");
      console.log(`mojo-target: ${name} ${browser.version()} passed on ${await page.evaluate(() => __dolly.gpu.adapter)}`);
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
}
