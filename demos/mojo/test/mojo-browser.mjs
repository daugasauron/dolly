// The Mojo compiler that mojo-build compiled inside Dolly, in the mojo image:
// it compiles in the session the programs demos/mojo/target cross-compiles,
// and they run: the standard library, coroutines, kernels that DeviceContext
// launches on WebGPU and that print, and upstream's own two GPU hellos with
// the package's name for max's. Usage: node demos/mojo/test/mojo-browser.mjs
// Headless Chrome has a software adapter. With a GPU window on DISPLAY, Chrome
// and the installed Firefox run it on the GPU as well.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, firefox } from "playwright-core";
import { startBrowserServer } from "../../../test/browser-server.mjs";
import { shellPrompt, writeCommand } from "../../browser.mjs";
import { sourcePins } from "../../../scripts/upstreams.mjs";

const root = new URL("../../../", import.meta.url);
const programs = ["hello", "library", "tasks", "saxpy", "kernels", "mandelbrot", "output", "shared"], upstream = ["hello_writing", "gpu_hello"];
const notebooks = `.cache/modular-${(await sourcePins(root.pathname)).get("MODULAR").commit}/Mojo/docs/site/code/tools/notebooks`;
const fixtures = { ...Object.fromEntries(upstream.map(name => [`${name}.mojo`, `${notebooks}/${name}.mojo`])),
  ...Object.fromEntries(programs.map(name => [`${name}.mojo`, `demos/mojo/target/test/fixtures/${name}.mojo`])) };
// The installed Firefox is a snap with a private /tmp: its profile must live under $HOME.
process.env.TMPDIR = new URL("build/mojo-test/", root).pathname;
await mkdir(process.env.TMPDIR, { recursive: true });
const launches = { "headless chromium": () => chromium.launch({ channel: "chrome", headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--enable-unsafe-webgpu"] }) };
if (process.env.DISPLAY) {
  launches.chromium = () => chromium.launch({ channel: "chrome", headless: false,
    args: ["--no-sandbox", "--ozone-platform=x11", "--enable-unsafe-webgpu", "--use-angle=vulkan", "--enable-features=Vulkan"] });
  launches.firefox = () => firefox.launch({ channel: "moz-firefox", headless: false, firefoxUserPrefs: { "dom.webgpu.enabled": true } });
}

const server = await startBrowserServer(root.pathname, "mojo", { fixtures });
try {
  for (const [name, launch] of Object.entries(launches)) {
    const browser = await launch();
    try {
      const page = await (await browser.newContext()).newPage();
      await page.addInitScript(policy => { globalThis.DOLLY_HTTP_POLICY = policy; },
        { maxRequests: 16, rules: [{ origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] }] });
      await page.goto(`${server.origin}/mojo/`);
      await page.waitForFunction(() => ["ready", "failed"].includes(document.documentElement.dataset.dollyStatus), null, { timeout: 180_000 });
      assert.equal(await page.evaluate(() => document.documentElement.dataset.dollyStatus), "ready", await page.locator("#bootstrap-log").textContent());
      await page.evaluate(([source, flags]) => __dolly.waitForInteractiveTerminal(new RegExp(source, flags), "terminal prompt", 0),
        [shellPrompt.source, shellPrompt.flags]);
      const run = async (command, status = 0) => assert.equal(await page.evaluate(command => __dolly.submit(command), command), status,
        `${name}: ${command}\n${await page.evaluate(() => __dolly.visibleTerminalText())}\n${await page.evaluate(() => __dolly.gpu.error ?? "")}`);
      await run("mojo --version | grep -q '^Mojo 1\\.1\\.0 ' && mkdir /tmp/mojo-test && cd /tmp/mojo-test");
      for (const program of programs) {
        await run(`curl -fsS ${server.origin}/fixture/${program}.mojo -o ${program}.mojo && mojo build ${program}.mojo`);
      }
      await run("./hello | grep -qx 'hello from mojo'");
      await run("./library one | grep -qx 'MOJO-LIBRARY 6 5 29 True 2 7.25 True'");
      await run("./tasks | grep -qx 'MOJO-TASKS 33 6'");
      await run("./saxpy | grep -qx 'MOJO-GPU webgpu 1000 1998.5'");
      await run("./kernels | grep -qx 'MOJO-KERNELS wrong: 0 0 0 0 4898230'");
      for (const program of upstream) {
        await run(`curl -fsS ${server.origin}/fixture/${program}.mojo | sed 's/^from max\\.gpu\\.host import/from gpu.host import/' > ${program}.mojo && mojo build ${program}.mojo`);
      }
      await run("./hello_writing | grep -qx 'GPU responded: 👋, 🔥'");
      await run("./gpu_hello | grep -qx 'Hello from the GPU'");
      // Each thread's line, the message of the assertion that ends thread 2, and what the others then stored.
      await run("./output > output.txt && grep -qx 'thread 1 of 3 holds 1.25' output.txt" +
        " && grep -q 'Assert Error: thread 2 stops here$' output.txt && grep -qx 'MOJO-OUTPUT \\[-1.0, -1.0, 2.25\\]' output.txt");
      await run("./shared | grep -qx 'MOJO-SHARED wrong: 0 of 8 fewest marks 256'");
      await run("./mandelbrot > set.txt && grep -q '^ *[.:=+*#%@-]*@\\{40\\}' set.txt && grep -qx 'MOJO-MATMUL wrong: 0 of 576 6.0' set.txt");
      // The image's own copies of three of them, as its greeting says.
      await run("(cd ~/mojo && mojo build -o /tmp/mojo-test/shipped mandelbrot.mojo) && ./shipped | grep -qx 'MOJO-MATMUL wrong: 0 of 576 6.0'");
      // An object is what cc links; a package precompiled here is imported by name.
      await run("mojo build --emit object -o hello.o hello.mojo && cc hello.o -lmojo-rt -o hello-linked && ./hello-linked | grep -qx 'hello from mojo'");
      await run("mkdir shapes && " + writeCommand("shapes/__init__.mojo", "def area(width: Int, height: Int) -> Int:\n    return width * height\n"));
      await run("mojo precompile -o shapes.mojoc shapes && rm -r shapes && " +
        writeCommand("room.mojo", "from shapes import area\n\ndef main():\n    print(\"area\", area(6, 7))\n"));
      await run("mojo build -I . room.mojo && ./room | grep -qx 'area 42'");
      // A type error and the commands that need a JIT or LLDB fail, and write nothing.
      await run(writeCommand("wrong.mojo", "def main():\n    var count: Int = \"three\"\n"));
      await run("mojo build wrong.mojo", 1);
      await run("test ! -e wrong && cd / && rm -r /tmp/mojo-test");
      await run("mojo run /dev/null", 1);
      await run("mojo repl", 1);
      console.log(`mojo: ${name} ${browser.version()} passed on ${await page.evaluate(() => __dolly.gpu.adapter)}`);
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
}
