// Shared Playwright setup for Dolly browser tests:
//
//   await browserTest("name", { image, server, timeout, launch }, async ({ name, browser, server, open }) => {
//     const { page, submit, text, result, waitForText } = await open({ policy, prompt, path, setup, context });
//     assert.equal(await submit("true"), 0);
//   });
//
// runs the body once per browser named on the command line (default: chromium,
// which is Chrome, then firefox) against one startBrowserServer(image, server).
// open() loads the image route (path, default /IMAGE/) in a new page (of a
// context with Playwright's options `context`, such as a phone's) after
// installing DOLLY_HTTP_POLICY = policy and awaiting setup(page), then waits for
// boot and the shell prompt (null skips it). submit(command) resolves to the
// exit status; text() reads the visible terminal; result(action) runs action()
// (typing, a paste) and resolves to the status of the command it completes;
// waitForText(pattern) waits until the visible terminal matches. On failure the
// latest page's terminal is printed; after timeout milliseconds the browser is
// closed and the test fails, whatever it awaits. launch adds to how the
// browsers start: { chromium: [argument…], firefox: { preference: value } }.
import { chromium, firefox } from "playwright-core";
import { startBrowserServer } from "./browser-server.mjs";
import { siteReference } from "../src/static-asset.mjs";

const projectDir = new URL("..", import.meta.url).pathname;
const shellPrompt = /dolly:[^\n]*\$\s*$/;

async function openImage(browser, origin, image, { policy, prompt = shellPrompt, path = `/${image}/`, setup, context } = {}) {
  const page = await browser.newPage(context);
  page.setDefaultTimeout(30000);
  if (policy) await page.addInitScript(policy => { globalThis.DOLLY_HTTP_POLICY = policy; }, policy);
  await setup?.(page);
  await page.goto(origin + path);
  await page.waitForFunction(() => ["ready", "failed"].includes(document.documentElement.dataset.dollyStatus));
  if (await page.evaluate(() => document.documentElement.dataset.dollyStatus) !== "ready") {
    throw new Error(`${path} failed to boot:\n${await page.locator("#bootstrap-log").textContent()}`);
  }
  if (prompt) await page.evaluate(source => __dolly.waitForInteractiveTerminal(new RegExp(source), "shell"), prompt.source);
  return {
    page,
    submit: command => page.evaluate(command => __dolly.submit(command), command),
    text: () => page.evaluate(() => __dolly.visibleTerminalText()),
    async result(action) {
      const sequence = await page.evaluate(() => __dolly.terminal.currentResultSequence());
      await action();
      return page.evaluate(sequence => __dolly.terminal.waitForResult(sequence), sequence);
    },
    // waitForFunction does not await an async predicate, so poll in the page.
    waitForSelection: expected => page.evaluate(async expected => {
      const deadline = Date.now() + 30000;
      while (await __dolly.copySelection() !== expected) {
        if (Date.now() > deadline) throw new Error(`the terminal's selection never became ${JSON.stringify(expected)}`);
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }, expected),
    waitForText: ({ source, flags }) => page.evaluate(async ({ source, flags }) => {
      const pattern = new RegExp(source, flags), deadline = Date.now() + 30000;
      while (!pattern.test(await __dolly.visibleTerminalText())) {
        if (Date.now() > deadline) throw new Error(`terminal never matched ${pattern}`);
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }, { source, flags }),
  };
}

// What the display shows, as pixels: the canvas is painted from a Worker, so
// the page reads none of it. The last frame painted (__dolly.frame()), in the
// page as globalThis.displaySnapshot, a canvas of its size.
export async function snapshotDisplay(page) {
  await page.evaluate(async () => {
    const image = await __dolly.frame(), { width, height } = image ?? document.querySelector("#display");
    const canvas = globalThis.displaySnapshot = Object.assign(document.createElement("canvas"), { width, height });
    if (image) canvas.getContext("2d", { willReadFrequently: true }).putImageData(image, 0, 0);
  });
}

// Resolves to what predicate(arg), run in the page, returns once it is truthy of a new snapshot.
export async function waitForDisplay(page, predicate, arg, { timeout = 30000 } = {}) {
  for (const deadline = Date.now() + timeout; ;) {
    await snapshotDisplay(page);
    const value = await page.evaluate(predicate, arg);
    if (value) return value;
    if (Date.now() > deadline) throw new Error("the display never showed what was awaited");
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

// open() options for an image the page builds with the named host modules:
// from packages alone (a root recipe, as `default` is) or on top of a base
// image, whose own modules it restates since nothing is inherited. files (path
// -> text) are written into it and entry is its ENTRY; setup(page) runs with
// the page's own. A test of a host module opens `system` with the module added.
export async function composed(hosts, packages, { base, files = {}, entry = "/bin/foreground -i /bin/slop", setup } = {}) {
  const { DOLLY_IMAGES } = await import("../dist/dolly-images.mjs");
  const definition = name => DOLLY_IMAGES.find(definition => definition.image === name);
  const pin = name => `${siteReference(definition(name).dollyfile)} ${definition(name).sha256}`;
  const modules = new Set([...base ? definition(base).hostRequirements : [], ...hosts.map(host => `${host}@0`)]);
  const recipe = ["DOLLY 7", "APPLICATION composed", ...[...modules].map(module => `REQUIRES HOST ${module}`),
    ...base ? [`FROM ${pin(base)}`] : [], ...packages.map(name => `INSTALL ${pin(name)}`),
    ...Object.entries(files).map(([path, text]) => `FILE ${path}\n${text.trim().split("\n").map(line => `    ${line}`).join("\n")}`),
    `ENTRY ${entry}`, ""].join("\n");
  return { path: "/custom/rebuild/", async setup(page) {
    await page.addInitScript(recipe => sessionStorage.setItem("dolly-custom-source", recipe), recipe);
    await setup?.(page);
  } };
}

export async function browserTest(label, { image = "default", server: serverOptions, timeout = 120_000, launch = {} } = {}, test) {
  const names = process.argv.slice(2);
  if (!names.length) names.push("chromium", "firefox");
  if (names.some(name => !["chromium", "firefox"].includes(name))) {
    throw new Error(`usage: node ${process.argv[1]} [chromium|firefox ...]`);
  }
  const server = await startBrowserServer(projectDir, image, serverOptions);
  try {
    for (const name of names) {
      const started = performance.now();
      const browser = await (name === "chromium"
        // WebGPU runs on the browsers' software adapters; Firefox's clipboard
        // testing pref lets Ctrl+Shift+V read without a paste prompt.
        ? chromium.launch({ channel: "chrome", headless: true,
          args: ["--no-sandbox", "--disable-gpu", "--enable-unsafe-webgpu", ...launch.chromium ?? []] })
        : firefox.launch({ headless: true, firefoxUserPrefs: { "dom.events.testing.asyncClipboard": true,
          "dom.webgpu.enabled": true, ...launch.firefox } }));
      let expired = false;
      let deadline;
      // A test may await what no page settles, such as a request to the server.
      const expiry = new Promise((resolve, reject) => {
        deadline = setTimeout(() => { expired = true; void browser.close(); reject(new Error("the deadline passed")); }, timeout);
      });
      try {
        await Promise.race([expiry,
          test({ name, browser, server, open: options => openImage(browser, server.origin, image, options) })]);
        console.log(`${label}: ${name} passed in ${((performance.now() - started) / 1000).toFixed(1)}s`);
      } catch (error) {
        if (expired) throw new Error(`${name}: ${label} exceeded ${timeout / 1000} seconds`, { cause: error });
        const page = browser.contexts().flatMap(context => context.pages()).at(-1);
        if (page) console.error(await page.evaluate(() => globalThis.__dolly?.visibleTerminalText()).catch(() => ""));
        throw new Error(`${name}: ${error.message}`, { cause: error });
      } finally {
        clearTimeout(deadline);
        await browser.close();
      }
    }
  } finally {
    await server.close();
  }
}
