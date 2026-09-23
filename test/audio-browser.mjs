import assert from "node:assert/strict";
import {chromium} from "playwright-core";
import {startBrowserServer} from "./browser-server.mjs";

const server = await startBrowserServer(new URL("..", import.meta.url).pathname, "default", 0,
  new Map(), {"audio.c": "test/fixtures/audio.c", "audio-client.c": "src/audio/client.c",
    "audio.h": "include/dolly/audio.h", "audio-abi.h": "include/dolly/audio-abi.h"});
let browser, deadline, page;
try {
  browser = await chromium.launch({channel: "chrome", headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--mute-audio"]});
  deadline = setTimeout(() => void browser.close(), 120000);
  page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (["warning", "error"].includes(message.type())) console.error(message.text()); });
  await page.addInitScript(origin => {
    globalThis.DOLLY_HTTP_POLICY = {maxRequests: 4,
      rules: [{origin, pathPrefix: "/fixture/", methods: ["GET"]}]};
    globalThis.audioMeters = [];
    globalThis.audioContexts = [];
    const nativeSource = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function() {
      const source = nativeSource.call(this), splitter = this.createChannelSplitter(2);
      const mute = this.createGain(); mute.gain.value = 0; mute.connect(this.destination);
      const meters = [this.createAnalyser(), this.createAnalyser()];
      source.connect(splitter);
      meters.forEach((meter, channel) => { splitter.connect(meter, channel); meter.connect(mute); });
      const peak = [0, 0], samples = new Float32Array(2048);
      const timer = setInterval(() => meters.forEach((meter, channel) => {
        meter.getFloatTimeDomainData(samples);
        peak[channel] = Math.max(peak[channel], Math.sqrt(samples.reduce((sum, x) => sum + x * x, 0) / samples.length));
      }), 10);
      source.addEventListener("ended", () => { clearInterval(timer); splitter.disconnect(); meters.forEach(meter => meter.disconnect()); mute.disconnect(); });
      audioMeters.push(peak);
      if (!audioContexts.includes(this)) audioContexts.push(this);
      return source;
    };
  }, server.origin);
  await page.goto(`${server.origin}/default/`);
  await page.waitForFunction(() => ["ready", "failed"].includes(document.documentElement.dataset.dollyStatus));
  assert.equal(await page.evaluate(() => document.documentElement.dataset.dollyStatus), "ready",
    await page.locator("#bootstrap-log").textContent());
  await page.evaluate(() => __dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "shell"));
  await page.mouse.click(10, 10);
  const submit = command => page.evaluate(text => __dolly.submit(text), command);
  assert.equal(await submit("mkdir -p /tmp/include/dolly"), 0);
  for (const file of ["audio.c", "audio-client.c", "audio.h", "audio-abi.h"]) {
    const destination = file.endsWith(".h") ? `/tmp/include/dolly/${file}` : `/tmp/${file}`;
    assert.equal(await submit(`curl -fsS ${server.origin}/fixture/${file} -o ${destination}`), 0);
  }
  assert.equal(await submit("cc -I/tmp/include /tmp/audio.c /tmp/audio-client.c -lm -o /tmp/audio"), 0,
    await page.evaluate(() => __dolly.visibleTerminalText()));
  for (let run = 0; run < 2; ++run) {
    assert.equal(await submit("/tmp/audio"), 0, await page.evaluate(() => __dolly.visibleTerminalText()));
    await page.waitForFunction(() => __dolly.audio.activeScopes === 0 && __dolly.audio.buffers === 0);
  }
  const measured = await page.evaluate(() => audioMeters.reduce((peak, value) => value.map((x, i) => Math.max(x, peak[i])), [0, 0]));
  assert.ok(measured[0] < 1e-6 && measured[1] > .2, `Wrong stereo playback: ${measured}`);
  await page.evaluate(() => { globalThis.audioHoldStatus = null; void __dolly.submit("/tmp/audio --hold").then(code => { audioHoldStatus = code; }); });
  await page.waitForFunction(() => __dolly.audio.activeScopes === 1 && __dolly.audio.buffers > 0);
  await page.keyboard.press("Control+c");
  await page.waitForFunction(() => audioHoldStatus !== null && __dolly.audio.activeScopes === 0 && __dolly.audio.buffers === 0);
  assert.equal(await page.evaluate(() => audioHoldStatus), 130);
  assert.equal(await submit("/tmp/audio"), 0, await page.evaluate(() => __dolly.visibleTerminalText()));
  const boundary = await page.evaluate(async () => (await import("/test/fixtures/audio-boundary.mjs")).audioBoundaryProof());
  assert.equal(await submit("echo AUDIO_SHELL_RECOVERY > /tmp/audio-result && cat /tmp/audio-result"), 0);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({browser: browser.version(), guestCompiled: true, measured, boundary,
    interruptRecovery: true, device: await page.evaluate(() => __dolly.audio)}));
} catch (error) {
  if (page && !page.isClosed()) console.error(await page.evaluate(() => __dolly.visibleTerminalText()).catch(() => ""));
  throw error;
} finally {
  clearTimeout(deadline); await browser?.close(); await server.close();
}
