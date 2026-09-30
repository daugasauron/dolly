// Shared Playwright setup for Dolly browser tests:
//
//   await browserTest("name", { image, server, timeout }, async ({ name, browser, server, open }) => {
//     const { page, submit, text, result, waitForText } = await open({ policy, prompt, path, setup });
//     assert.equal(await submit("true"), 0);
//   });
//
// runs the body once per browser named on the command line (default: chromium,
// which is Chrome, then firefox) against one startBrowserServer(image, server).
// open() loads the image route (path, default /IMAGE/) in a new page after
// installing DOLLY_HTTP_POLICY = policy and awaiting setup(page), then waits for
// boot and the shell prompt (null skips it). submit(command) resolves to the
// exit status; text() reads the visible terminal; result(action) runs action()
// (typing, a paste) and resolves to the status of the command it completes;
// waitForText(pattern) waits until the visible terminal matches. On failure the
// latest page's terminal is printed; each browser is closed after timeout
// milliseconds.
import { chromium, firefox } from "playwright-core";
import { startBrowserServer } from "./browser-server.mjs";

const projectDir = new URL("..", import.meta.url).pathname;
const shellPrompt = /dolly:[^\n]*\$\s*$/;

async function openImage(browser, origin, image, { policy, prompt = shellPrompt, path = `/${image}/`, setup } = {}) {
  const page = await browser.newPage();
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
      const sequence = await page.evaluate(() => __dolly.transport.currentResultSequence());
      await action();
      return page.evaluate(sequence => __dolly.transport.waitForResult(sequence), sequence);
    },
    // waitForFunction does not await an async predicate, so poll in the page.
    waitForText: ({ source, flags }) => page.evaluate(async ({ source, flags }) => {
      const pattern = new RegExp(source, flags), deadline = Date.now() + 30000;
      while (!pattern.test(await __dolly.visibleTerminalText())) {
        if (Date.now() > deadline) throw new Error(`terminal never matched ${pattern}`);
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }, { source, flags }),
  };
}

export async function browserTest(label, { image = "default", server: serverOptions, timeout = 120_000 } = {}, test) {
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
        ? chromium.launch({ channel: "chrome", headless: true, args: ["--no-sandbox", "--disable-gpu", "--enable-unsafe-webgpu"] })
        : firefox.launch({ headless: true, firefoxUserPrefs: { "dom.events.testing.asyncClipboard": true, "dom.webgpu.enabled": true } }));
      let expired = false;
      const deadline = setTimeout(() => { expired = true; void browser.close(); }, timeout);
      try {
        await test({ name, browser, server, open: options => openImage(browser, server.origin, image, options) });
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
