import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { chromium, firefox } from "playwright-core";
import { startBrowserServer } from "./browser-server.mjs";
import { appendCustomSection } from "../src/wasm-interface.mjs";
import { DOLLY_THREADS_ABI_DIGEST } from "../dist/dolly-threads-abi.mjs";

const kind = process.argv[2] ?? "chrome";
const compile = process.argv.includes("--compiler");
const output = `build/threads-${compile ? "compiler" : "substrate"}-${kind}`;
const overrides = new Map(), path = "/fixture/process-wrong-call.wasm";
const server = await startBrowserServer(process.cwd(), "system", 0, overrides);
let browser, deadline;
try {
  browser = kind === "firefox" ? await firefox.launch({ headless: true })
    : await chromium.launch({ channel: "chrome", headless: true, args: ["--no-sandbox", "--disable-gpu"] });
  deadline = setTimeout(() => void browser.close(), 120000);
  const page = await browser.newPage(), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") console.error(message.text()); });
  await page.addInitScript(origin => {
    globalThis.DOLLY_HOST_MODULES = ["runtime@0", "display@0", "http@0", "download@0", "upload@0", "snapshot@0", "threads@0"];
    globalThis.DOLLY_HTTP_POLICY = { maxRequests: 64,
      rules: [{ origin, pathPrefix: "/fixture/", methods: ["GET", "POST"] }] };
  }, server.origin);
  await page.goto(`${server.origin}/system/`);
  await page.waitForFunction(() => ["ready", "failed"].includes(document.documentElement.dataset.dollyStatus));
  assert.equal(await page.evaluate(() => document.documentElement.dataset.dollyStatus), "ready",
    await page.locator("#bootstrap-log").textContent());
  await page.evaluate(() => __dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "shell"));
  const submit = text => page.evaluate(text => __dolly.submit(text), text);
  const cases = [];
  if (!compile) {
    const valid = await readFile("build/threads-substrate-0.wasm");
    const incompatible = Buffer.from(valid), missingEntry = Buffer.from(valid);
    const digest = Buffer.from(DOLLY_THREADS_ABI_DIGEST, "hex");
    const stampOffset = incompatible.indexOf(digest), entryOffset = missingEntry.indexOf("dolly_thread_start");
    assert.ok(stampOffset >= 0 && entryOffset >= 0);
    incompatible[stampOffset] ^= 1;
    missingEntry[entryOffset] = "_".charCodeAt(0);
    for (const bytes of [incompatible, missingEntry, appendCustomSection(valid, "dolly.threads", digest)]) {
      overrides.set(path, bytes);
      assert.equal(await submit(`curl -fsS ${server.origin}${path} -o /tmp/threads-invalid`), 0);
      assert.equal(await submit("/tmp/threads-invalid"), 126);
    }
    const denied = await browser.newPage();
    await denied.addInitScript(origin => {
      globalThis.DOLLY_HOST_MODULES = ["runtime@0", "display@0", "http@0", "download@0", "upload@0", "snapshot@0"];
      globalThis.DOLLY_HTTP_POLICY = { rules: [{ origin, pathPrefix: "/fixture/", methods: ["GET"] }] };
    }, server.origin);
    await denied.goto(`${server.origin}/system/`);
    await denied.waitForFunction(() => document.documentElement.dataset.dollyStatus === "ready", null, { timeout: 60000 });
    await denied.evaluate(() => __dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "shell"));
    overrides.set(path, valid);
    assert.equal(await denied.evaluate(text => __dolly.submit(text), `curl -fsS ${server.origin}${path} -o /tmp/threads-denied`), 0);
    assert.equal(await denied.evaluate(() => __dolly.submit("/tmp/threads-denied")), 126);
    assert.equal(await denied.evaluate(() => __dolly.submit("printf alive > /tmp/alive && test -f /tmp/alive")), 0);
    await denied.close();
    cases.push({ invalidProfilesRejected: 3, disabledProviderDenied: true });
  }
  if (compile) {
    if (process.argv.includes("--overlay")) {
      overrides.set(path, await readFile("build/threads-overlay.tar"));
      assert.equal(await submit(`curl -fsS ${server.origin}${path} -o /tmp/thread-sdk.tar && tar -xf /tmp/thread-sdk.tar -C / && rm /tmp/thread-sdk.tar`), 0);
    }
    for (const [compiler, source, marker] of [["cc", "threads-pthread.c", "PTHREAD-OK"], ["c++", "threads-cpp.cpp", "STD-THREAD-OK"], ["cc", "threads-quota.c", "THREAD-QUOTA-OK"]]) {
      overrides.set(path, await readFile(new URL(`./fixtures/${source}`, import.meta.url)));
      assert.equal(await submit(`curl -fsS ${server.origin}${path} -o /tmp/${source}`), 0);
      const started = performance.now();
      const requests = [], record = request => { if (/^https?:/.test(request.url())) requests.push(request.url()); };
      page.context().on("request", record);
      await page.context().route("**/*", route => route.abort());
      let status;
      try {
        status = await submit(`${compiler} -O1 -pthread /tmp/${source} -o /tmp/compiled-thread && /tmp/compiled-thread`);
        assert.deepEqual(requests, [], "compilation and thread startup made HTTP requests");
      } finally {
        await page.context().unroute("**/*");
        page.context().off("request", record);
      }
      const terminal = await page.evaluate(() => __dolly.visibleTerminalText());
      assert.equal(status, 0, terminal);
      assert.ok(terminal.includes(marker), terminal);
      if (source === "threads-pthread.c") {
        assert.equal(await submit("/tmp/compiled-thread --main-exit && test -f /tmp/last-thread"), 0);
        const busy = submit("/tmp/compiled-thread --busy");
        busy.catch(() => {});
        await page.waitForFunction(async () => (await __dolly.visibleTerminalText()).includes("THREADS-BUSY"), null, { timeout: 10000 });
        await page.locator("#keyboard").focus();
        await page.keyboard.press("Control+c");
        assert.equal(await busy, 130);
        assert.equal(await submit("/tmp/compiled-thread"), 0, "thread slots must be reclaimed after interrupting busy siblings");
      }
      cases.push({ compiler, source, status, seconds: (performance.now() - started) / 1000 });
      console.log(cases.at(-1));
    }
    assert.notEqual(await submit("cc -pthread -shared /tmp/threads-pthread.c -o /tmp/unsupported.so"), 0);
    assert.notEqual(await submit("cc -pthread -rdynamic /tmp/threads-pthread.c -o /tmp/unsupported"), 0);
  }
  for (const [mode, expected] of compile ? [] : [[0, 0], [1, 126], [2, 37], [0, 0], ["pthread", 0]]) {
    overrides.set(path, await readFile(mode === "pthread" ? "build/threads-pthread.wasm" : `build/threads-substrate-${mode}.wasm`));
    assert.equal(await submit(`curl -fsS ${server.origin}${path} -o /tmp/threads-probe`), 0);
    const started = performance.now();
    const timer = setTimeout(() => void browser.close(), 60000);
    let status;
    try { status = await submit(`/tmp/threads-probe ${server.origin}/fixture/echo`); }
    finally { clearTimeout(timer); }
    const terminal = await page.evaluate(() => __dolly.visibleTerminalText());
    console.log({ mode, status, seconds: (performance.now() - started) / 1000 });
    assert.equal(status, expected, terminal);
    if (!mode) assert.match(terminal, /THREAD-SUBSTRATE-OK/);
    if (mode === "pthread") assert.match(terminal, /PTHREAD-OK/);
    assert.equal(await submit("printf alive > /tmp/thread-shell && test $(cat /tmp/thread-shell) = alive"), 0);
    cases.push({ mode, status, seconds: (performance.now() - started) / 1000 });
  }
  assert.deepEqual(errors, []);
  await mkdir(output, { recursive: true });
  await writeFile(`${output}/proof.json`, JSON.stringify({ cases, errors }, null, 2));
} finally { clearTimeout(deadline); await browser?.close(); await server.close(); }
