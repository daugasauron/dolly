// Shared setup for demo browser tests, which drive one Chrome (or Firefox):
//
//   await demoTest("pi", { image: "pi", server, timeout, webgpu, browser }, async ({ server, open }) => {
//     const { page, run, start, waitText } = await open({ policy, prompt, path, setup, viewport });
//   });
//
// runs against one startBrowserServer(image, server) in headless Chrome, with a
// software WebGPU adapter when webgpu is set, or Firefox when browser is "firefox". open() loads the image
// route after installing DOLLY_HTTP_POLICY = policy and awaiting setup(page),
// then waits for boot and prompt (null skips it), returning the terminal
// helpers below and the prompting program's pid. On failure the latest page's
// terminal is printed; the browser is closed after timeout milliseconds.
import assert from "node:assert/strict";
import { chromium, firefox } from "playwright-core";
import { startBrowserServer } from "../test/browser-server.mjs";
import { CANONICAL_ORIGIN } from "../src/static-asset.mjs";

const projectDir = new URL("..", import.meta.url).pathname;
export const shellPrompt = /dolly:[^\n]*\$\s*$/;
export const recoveryPrompt = /Dolly: image entry exited; entering the recovery Slop shell\.[\s\S]*\ndolly:[^\n]*\$\s*$/;
export const shellQuote = value => `'${String(value).replaceAll("'", "'\\''")}'`;
// A command writing text to path in one line; the terminal submits each line apart.
export const writeCommand = (path, text) =>
  `printf '%s\\n' ${text.replace(/\n$/, "").split("\n").map(shellQuote).join(" ")} > ${path}`;
export const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function openImage(browser, origin, image, { policy, prompt = shellPrompt, path = `/${image}/`, setup,
  viewport = { width: 1280, height: 800 } } = {}) {
  const context = await browser.newContext({ viewport });
  // Firefox has no clipboard permissions to grant.
  if (browser.browserType().name() === "chromium") {
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
  }
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  if (policy) await page.addInitScript(policy => { globalThis.DOLLY_HTTP_POLICY = policy; }, policy);
  await setup?.(page);
  await page.goto(origin + path);
  await page.waitForFunction(() => ["ready", "failed"].includes(document.documentElement.dataset.dollyStatus),
    null, { timeout: 180_000 });
  if (await page.evaluate(() => document.documentElement.dataset.dollyStatus) !== "ready") {
    throw new Error(`${path} failed to boot:\n${await page.locator("#bootstrap-log").textContent()}`);
  }
  const terminal = terminalHelpers(page);
  return { ...terminal, pid: prompt ? await terminal.prompt(prompt) : 0 };
}

// Commands and keys for a booted Dolly page.
function terminalHelpers(page) {
  const submit = command => page.evaluate(command => __dolly.submit(command), command);
  const text = () => page.evaluate(() => __dolly.visibleTerminalText());
  // Clicks the first cell, as a user would, to drop the selection text() leaves.
  const clearSelection = () => page.evaluate(() => {
    const { transport } = __dolly, { paddingX, paddingY, cellWidth, cellHeight } = transport.geometry();
    const x = paddingX + Math.floor(cellWidth / 2), y = paddingY + Math.floor(cellHeight / 2);
    transport.pushPointer(x, y, 1, {});
    transport.pushPointer(x, y, 0, {});
  });
  return {
    page, submit, text,
    async run(command, status = 0) { assert.equal(await submit(command), status, `${command}\n${await text()}`); },
    // Submits without waiting; status stays null until the command exits.
    start(command) {
      const running = { status: null };
      running.done = submit(command).then(status => running.status = status);
      running.done.catch(() => {}); // A closing page rejects commands nobody awaits.
      return running;
    },
    // Waits for an idle foreground program other than previousPid showing pattern.
    prompt: (pattern, previousPid = 0) => page.evaluate(([source, flags, previousPid]) =>
      __dolly.waitForInteractiveTerminal(new RegExp(source, flags), "terminal prompt", previousPid),
    [pattern.source, pattern.flags, previousPid]),
    async waitText(pattern, timeout = 60_000) {
      const deadline = Date.now() + timeout;
      let visible;
      while (!pattern.test(visible = await text())) {
        if (Date.now() > deadline) throw new Error(`terminal never showed ${pattern}:\n${visible}`);
        await delay(100);
      }
      await clearSelection();
      return visible;
    },
    // Types into the terminal's input ring in chunks it accepts.
    async input(value) {
      for (let offset = 0; offset < value.length; offset += 64) {
        assert.equal(await page.evaluate(chunk => __dolly.input(chunk), value.slice(offset, offset + 64)), true);
        await delay(10);
      }
    },
  };
}

// Leaves a game-agent game (bhop, classicube) through its exit control for the shell.
export async function leaveGame({ page, prompt }) {
  await page.waitForFunction(() => __dolly.graphicsActive &&
    document.querySelector("#display").width === 1280 && document.querySelector("#display").height === 960);
  const box = await page.locator("#display").boundingBox();
  await page.mouse.click(box.x + box.width * 975 / 1280, box.y + box.height * 934 / 960);
  await prompt(shellPrompt);
}

// Saves the file that offer() (a download command or an in-app export) asks
// Dolly to offer, with the user's click on its Save button.
export async function acceptDownload(page, offer) {
  const saved = page.waitForEvent("download");
  await offer();
  await page.locator("#downloads button").first().click();
  return saved;
}

// A setup() that sends the page's fetches of origin to target + path instead,
// after the broker has admitted them, so fixtures stand in for real services.
export const redirectFetch = (origin, target) => page => page.addInitScript(([origin, target]) => {
  const fetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href);
    return fetch(url.origin === origin ? target + url.pathname : input, init);
  };
}, [origin, target]);

// open() options for a headless build image with the terminal display and
// HTTP added, built in the page by the custom image route.
export async function displayProbe(image) {
  const { DOLLY_IMAGES } = await import("../dist/dolly-images.mjs");
  const pin = name => {
    const { dollyfile, sha256 } = DOLLY_IMAGES.find(definition => definition.image === name);
    return `${CANONICAL_ORIGIN}/${dollyfile} ${sha256}`;
  };
  const recipe = ["DOLLY 6", "APPLICATION display-probe", `FROM ${pin(image)}`, "REQUIRES HOST display@0", "REQUIRES HOST http@0",
    ...["/usr/lib/libdisplay.so", "/usr/share/fonts/IosevkaTerm-SemiBold.ttf"]
      .map(path => `COPY ${pin("ghostty-build")} ${path} ${path}`),
    "EXPORTS LIB display /usr/lib/libdisplay.so", "EXPORTS ENV DISPLAY /usr/lib/libdisplay.so",
    "ENTRY /bin/foreground -i /bin/slop", ""].join("\n");
  return { path: "/custom/rebuild/",
    setup: page => page.addInitScript(recipe => sessionStorage.setItem("dolly-custom-source", recipe), recipe) };
}

// open() options for an application built in the page from `system` plus the
// named packages, as `amy install` composes a session.
export async function installProbe(...packages) {
  const { DOLLY_IMAGES } = await import("../dist/dolly-images.mjs");
  const pin = name => {
    const { dollyfile, sha256 } = DOLLY_IMAGES.find(definition => definition.image === name);
    return `${CANONICAL_ORIGIN}/${dollyfile} ${sha256}`;
  };
  const recipe = ["DOLLY 6", "APPLICATION install-probe", `FROM ${pin("system")}`,
    ...packages.map(name => `INSTALL ${pin(name)}`), "ENTRY /bin/foreground -i /bin/slop", ""].join("\n");
  return { path: "/custom/rebuild/",
    setup: page => page.addInitScript(recipe => sessionStorage.setItem("dolly-custom-source", recipe), recipe) };
}

export async function demoTest(label, { image, server: serverOptions, timeout = 300_000, webgpu = false,
  browser: browserName = "chromium" } = {}, test) {
  const server = await startBrowserServer(projectDir, image, serverOptions);
  const started = performance.now();
  const browser = await (browserName === "firefox" ? firefox.launch({ headless: true })
    : chromium.launch({ channel: "chrome", headless: true,
      args: ["--no-sandbox", "--disable-gpu", ...webgpu ? ["--enable-unsafe-webgpu"] : []] }));
  let expired = false;
  const deadline = setTimeout(() => { expired = true; void browser.close(); }, timeout);
  try {
    await test({ server, open: options => openImage(browser, server.origin, image, options) });
    console.log(`${label}: ${browserName} passed in ${((performance.now() - started) / 1000).toFixed(1)}s`);
  } catch (error) {
    if (expired) throw new Error(`${label} exceeded ${timeout / 1000} seconds`, { cause: error });
    const page = browser.contexts().flatMap(context => context.pages()).at(-1);
    if (page) console.error(await page.evaluate(() => globalThis.__dolly?.visibleTerminalText()).catch(() => ""));
    throw error;
  } finally {
    clearTimeout(deadline);
    await browser.close();
    await server.close();
  }
}
