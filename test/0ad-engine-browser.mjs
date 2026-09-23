import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import { startBrowserServer } from "./browser-server.mjs";

const output = new URL("../.cache/0ad/browser/", import.meta.url);
await mkdir(output, { recursive: true });
const server = await startBrowserServer(new URL("..", import.meta.url).pathname,
  "default", 0, new Map(), {
    "pyrogenesis.wasm": "build/0ad/pyrogenesis.wasm",
    "0ad-data.tar": "build/0ad/headless-data.tar",
  });
let browser, deadline, page;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true,
    args: ["--no-sandbox", "--disable-gpu"] });
  deadline = setTimeout(() => void browser.close(), 120000);
  page = await browser.newPage();
  page.on("pageerror", error => console.error(error.message));
  await page.addInitScript(origin => {
    globalThis.DOLLY_HTTP_POLICY = { maxRequests: 2,
      rules: [{ origin, pathPrefix: "/fixture/", methods: ["GET"] }] };
  }, server.origin);
  await page.goto(`${server.origin}/default/`);
  await page.waitForFunction(() => ["ready", "failed"].includes(document.documentElement.dataset.dollyStatus));
  assert.equal(await page.evaluate(() => document.documentElement.dataset.dollyStatus), "ready",
    await page.locator("#bootstrap-log").textContent());
  await page.evaluate(() => __dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "shell"));
  const submit = command => page.evaluate(text => __dolly.submit(text), command);
  const download = async (path, name) => {
    const event = page.waitForEvent("download");
    const running = submit(`download ${path}`);
    const file = await event;
    const destination = new URL(name, output);
    await file.saveAs(destination.pathname);
    assert.equal(await running, 0);
    return readFile(destination, "utf8");
  };
  assert.equal(await submit("mkdir -p /opt/0ad/system"), 0);
  assert.equal(await submit(`curl -fsS ${server.origin}/fixture/pyrogenesis.wasm -o /opt/0ad/system/pyrogenesis`), 0);
  assert.equal(await submit(`curl -fsS ${server.origin}/fixture/0ad-data.tar -o /tmp/0ad-data.tar && tar -xf /tmp/0ad-data.tar -C /opt/0ad && rm /tmp/0ad-data.tar`), 0);
  const engine = "ICU_DATA=/opt/0ad/data/icu /opt/0ad/system/pyrogenesis -quickstart -writableRoot";
  assert.equal(await submit(`${engine} -version`), 0);
  const started = performance.now();
  await page.evaluate(command => {
    globalThis.gameStatus = null;
    void __dolly.submit(command).then(status => { globalThis.gameStatus = status; });
  }, `${engine} -mod=public -autostart=scenarios/combat_demo -autostart-nonvisual -nosound`);
  let observed = "";
  for (let poll = 0; poll < 300; poll++) {
    observed = await page.evaluate(() => __dolly.visibleTerminalText());
    if (/Turn (?:[2-9][0-9]|[1-9][0-9]{2,}) /.test(observed)) break;
    if (await page.evaluate(() => globalThis.gameStatus !== null)) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.match(observed, /Turn (?:[2-9][0-9]|[1-9][0-9]{2,}) /);
  console.log(`Combat demo reached 20 turns in ${Math.round(performance.now() - started)} ms`);
  await page.keyboard.press("Control+c");
  await page.waitForFunction(() => globalThis.gameStatus !== null, null, { timeout: 5000 });
  assert.equal(await page.evaluate(() => globalThis.gameStatus), 130);
  const warnings = await download("/opt/0ad/logs/interestinglog.html", "scenario.html");
  assert.doesNotMatch(warnings, /class="error"/);
  assert.equal(await submit("sed '/^turn 20 /,$d' \"$(find /opt/0ad/data/replays -name commands.txt | head -n1)\" > /tmp/replay-20.txt"), 0);
  const replay = await download("/tmp/replay-20.txt", "commands.txt");
  assert.match(replay, /^start /);
  assert.equal((replay.match(/^end$/gm) ?? []).length, 20);
  const hashes = [];
  for (let run = 0; run < 2; run++) {
    const time = performance.now();
    assert.equal(await submit(`${engine} -replay=/tmp/replay-20.txt ${run ? "" : "-serializationtest"} > /tmp/replay.log 2>&1`), 0);
    const log = await download("/tmp/replay.log", `replay-${run + 1}.log`);
    assert.doesNotMatch(log, /ERROR:|Mismatch|mismatch/);
    const hash = log.match(/# Final state: ([0-9a-f]+)/i)?.[1];
    assert.ok(hash, log);
    hashes.push(hash);
    console.log(`Replay ${run + 1}: ${Math.round(performance.now() - time)} ms, state ${hash}`);
  }
  assert.equal(hashes[0], hashes[1]);
  assert.equal(await submit("printf 'shell survived\\n' > /tmp/0ad-result && test -s /tmp/0ad-result"), 0);
  console.log("0 A.D. browser simulation, serialization, deterministic replay and interruption checks passed");
} catch (error) {
  if (page && !page.isClosed()) {
    console.error(await page.locator("#bootstrap-log").textContent().catch(() => ""));
    console.error(await page.evaluate(() => __dolly.visibleTerminalText()).catch(() => ""));
  }
  throw error;
} finally {
  clearTimeout(deadline);
  await browser?.close();
  await server.close();
}
