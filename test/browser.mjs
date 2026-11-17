// Shared Playwright setup for Dolly browser tests:
//
//   await browserTest("name", { image, server, timeout, launch }, async ({ name, browser, server, open }) => {
//     const { page, submit, text, result, waitForText } = await open({ policy, modules, relays, prompt, path, setup, context });
//     assert.equal(await submit("true"), 0);
//   });
//
// runs the body once per browser named on the command line (default: chromium,
// which is Chrome, then firefox) against one startBrowserServer(image, server).
// open() loads the image route (path, default /IMAGE/) in a new page (of a
// context with Playwright's options `context`, such as a phone's), its page
// naming the HTTP policy, host modules and relays given (routeAttributes),
// after awaiting setup(page), then waits for
// boot and the shell prompt (null skips it). submit(command) resolves to the
// exit status; text() reads the visible terminal; result(action) runs action()
// (typing, a paste) and resolves to the status of the command it completes;
// waitForText(pattern) waits until the visible terminal matches. On failure the
// latest page's terminal is printed; after timeout milliseconds the browser is
// closed and the test fails, whatever it awaits. launch adds to how the
// browsers start: { chromium: [argument…], firefox: { preference: value } }.
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { chromium, firefox } from "playwright-core";
import { startBrowserServer } from "./browser-server.mjs";
import { siteReference } from "../page/static-asset.mjs";

const projectDir = new URL("..", import.meta.url).pathname;
export const shellQuote = value => `'${String(value).replaceAll("'", "'\\''")}'`;

// The installed Firefox in a window on DISPLAY, with WebGPU on the hardware adapter
// (docs/gpu.md) and the preferences given. On Ubuntu it is a snap with a /tmp of its
// own, so Playwright's profile, made in TMPDIR, goes under the checkout's build/.
export async function launchInstalledFirefox(preferences = {}) {
  process.env.TMPDIR = `${projectDir}build/firefox-tmp`;
  await mkdir(process.env.TMPDIR, { recursive: true });
  return firefox.launch({ channel: "moz-firefox", headless: false,
    firefoxUserPrefs: { "dom.webgpu.enabled": true, ...preferences } });
}

// Writes BYTES to PATH in the session through its shell, which needs no network:
// printf %b takes an octal escape for each byte that is not plain text, in
// pieces a line of the terminal carries.
export async function put(submit, path, bytes) {
  const escaped = byte => byte >= 0x20 && byte < 0x7f && byte !== 0x5c ? String.fromCharCode(byte)
    : `\\0${byte.toString(8).padStart(3, "0")}`;
  assert.equal(await submit(`mkdir -p "$(dirname ${path})" && : > ${path}`), 0, path);
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    const text = [...bytes.subarray(offset, offset + 8192)].map(escaped).join("");
    assert.equal(await submit(`printf %b ${shellQuote(text)} >> ${path}`), 0, path);
  }
}
// The file of this repository at PATH, put at its name in the session.
export const putFixture = async (submit, name, path) => put(submit, name, await readFile(new URL(path, `file://${projectDir}`)));

// Runs a case file's steps (test/cases/README.md) in the session's shell: its
// files and fixtures first, each fixture the file of this repository it names,
// then each step by /bin/slop in its directory, in order. Fails with the steps
// whose status was not their own.
export async function runSteps(submit, { directory, files = {}, fixtures = {}, steps }) {
  assert.equal(await submit(`mkdir -p ${directory} && cd ${directory}`), 0, directory);
  for (const [name, text] of Object.entries(files)) {
    const bytes = text.replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll("\t", "\\t");
    assert.equal(await submit(`mkdir -p "$(dirname ${name})" && printf %b ${shellQuote(bytes)} > ${name}`), 0, name);
  }
  for (const [name, path] of Object.entries(fixtures)) await putFixture(submit, name, path);
  const failures = [];
  for (const { why, script, status, fails } of steps) {
    const actual = await submit(`/bin/slop -c ${shellQuote(script)}`);
    if (fails ? actual === 0 : actual !== status) failures.push({ why, script, expected: fails ? "a failure" : status, actual });
  }
  assert.deepEqual(failures, []);
}
const shellPrompt = /dolly:[^\n]*\$\s*$/;

// Every route page PAGE loads names, on its main element (site/route.mjs), the
// host modules (names), HTTP policy and relays given, as a route page that sets
// them does: they are written before its module script runs.
export async function routeAttributes(page, { modules, policy, relays }) {
  const attributes = Object.fromEntries(Object.entries({ "data-modules": modules?.join(" "),
    "data-http-policy": policy && JSON.stringify(policy), "data-http-relays": relays && JSON.stringify(relays) })
    .filter(([, value]) => value !== undefined));
  if (!Object.keys(attributes).length) return;
  await page.addInitScript(attributes => new MutationObserver((records, observer) => {
    const terminal = document.querySelector("main#terminal");
    if (!terminal) return;
    for (const [name, value] of Object.entries(attributes)) terminal.setAttribute(name, value);
    observer.disconnect();
  }).observe(document, { childList: true, subtree: true }), attributes);
}

async function openImage(browser, origin, image, { policy, modules, relays, prompt = shellPrompt, path = `/${image}/`, setup,
  context } = {}) {
  const page = await browser.newPage(context);
  page.setDefaultTimeout(30000);
  await routeAttributes(page, { modules, policy, relays });
  await setup?.(page);
  await page.goto(origin + path);
  // A rebuild route builds its image first: measured at 42 s on a loaded machine.
  await page.waitForFunction(() => ["ready", "failed"].includes(document.documentElement.dataset.dollyStatus), null,
    { timeout: path.includes("/rebuild/") ? 180_000 : 30_000 });
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

// The colour the page shows at (x, y), in CSS pixels, read from a screenshot:
// [red, green, blue].
export async function shownColor(page, x, y) {
  const png = (await page.screenshot({ clip: { x, y, width: 1, height: 1 } })).toString("base64");
  return page.evaluate(async png => {
    const image = new Image();
    image.src = `data:image/png;base64,${png}`;
    await image.decode();
    const context = Object.assign(document.createElement("canvas"), { width: image.width, height: image.height })
      .getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    return [...context.getImageData(0, 0, 1, 1).data.subarray(0, 3)];
  }, png);
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
// -> text) are written into it, rows are further rows of the recipe and entry is
// its ENTRY; setup(page) runs with the page's own. A test of a host module opens
// `system` with the module added.
export async function composed(hosts, packages, { base, files = {}, rows = [], entry = "/bin/foreground -i /bin/slop", setup } = {}) {
  const { default: catalog } = await import("../dist/dolly-images.json", { with: { type: "json" } });
  const definition = name => catalog.images.find(definition => definition.image === name);
  const pin = name => `${siteReference(definition(name).dollyfile)} ${definition(name).sha256}`;
  const modules = new Set([...base ? definition(base).hostRequirements : [], ...hosts.map(host => `${host}@0`)]);
  const recipe = ["DOLLY 7", "APPLICATION composed", ...[...modules].map(module => `REQUIRES HOST ${module}`),
    ...base ? [`FROM ${pin(base)}`] : [], ...packages.map(name => `INSTALL ${pin(name)}`),
    ...Object.entries(files).map(([path, text]) => `FILE ${path}\n${text.trim().split("\n").map(line => `    ${line}`).join("\n")}`),
    ...rows, `ENTRY ${entry}`, ""].join("\n");
  return { path: "/custom/rebuild/", async setup(page) {
    // The installed Firefox also runs init scripts in a document without a location or storage.
    await page.addInitScript(recipe => { if (location.protocol.startsWith("http")) sessionStorage.setItem("dolly-custom-source", recipe); }, recipe);
    await setup?.(page);
  } };
}

// open() options for `system` with what a toolchain does not hold
// (Dollyfile-system): the page's file exchange and a network client, with their
// modules and the headers of their clients, and HOSTS and PACKAGES more.
export const workbench = (hosts = [], packages = [], options = {}) =>
  composed(["download", "upload", "http", ...hosts], ["transfer", "curl", "libdolly-download", "libdolly-upload", ...packages],
    { base: "system", ...options });

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
