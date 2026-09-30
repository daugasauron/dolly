import assert from "node:assert/strict";
import {chromium, firefox} from "playwright-core";
import {startBrowserServer} from "./browser-server.mjs";

const server = await startBrowserServer(new URL("..", import.meta.url).pathname, "audio-sdk", 0,
  new Map(), {"audio.c": "test/fixtures/audio.c", "audio-client-contract.c": "test/fixtures/audio-client-contract.c"});
let browser, deadline, page;
try {
  const browserName = process.argv[2] ?? "chromium";
  assert.ok(["chromium", "firefox"].includes(browserName));
  browser = browserName === "firefox" ? await firefox.launch({headless: true})
    : await chromium.launch({channel: "chrome", headless: true,
      args: ["--no-sandbox", "--disable-gpu", "--mute-audio", "--autoplay-policy=user-gesture-required"]});
  deadline = setTimeout(() => void browser.close(), 120000);
  page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (["warning", "error"].includes(message.type())) console.error(message.text()); });
  await page.addInitScript(origin => {
    if (location.origin !== origin) return;
    globalThis.DOLLY_HTTP_POLICY = {maxRequests: 2,
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
      const connect = source.connect;
      source.connect = function(target, ...args) {
        return connect.call(this, target === this.context.destination ? mute : target, ...args);
      };
      return source;
    };
    globalThis.autoplayReady = (async () => {
      const {browser: audioHost} = await import("/src/host/audio.mjs");
      let completed;
      globalThis.autoplayProvider = audioHost({send: message => { completed = message; }});
      globalThis.autoplayResumeCalls = 0;
      const resume = AudioContext.prototype.resume;
      AudioContext.prototype.resume = function() { ++autoplayResumeCalls; return resume.call(this); };
      globalThis.closeAutoplay = async () => {
        AudioContext.prototype.resume = resume;
        autoplayProvider.dispose();
      };
      const packet = new Uint8Array(32), view = new DataView(packet.buffer);
      view.setUint32(4, 1, true); view.setUint32(8, 1, true); view.setUint32(16, 1, true);
      autoplayProvider.messages["audio-request"]({packet, scope: 1, sequence: 1});
      return {error: completed.error, activated: navigator.userActivation.hasBeenActive,
        resumeCalls: autoplayResumeCalls};
    })();
  }, server.origin);
  await page.goto(`${server.origin}/audio-sdk/`);
  await page.waitForFunction(() => ["ready", "failed"].includes(document.documentElement.dataset.dollyStatus));
  assert.equal(await page.evaluate(() => document.documentElement.dataset.dollyStatus), "ready",
    await page.locator("#bootstrap-log").textContent());
  await page.evaluate(() => __dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "shell"));
  const autoplay = await page.evaluate(() => autoplayReady);
  assert.deepEqual(autoplay, {error: 0, activated: false, resumeCalls: 0});
  await page.mouse.click(10, 10);
  await page.waitForFunction(() => autoplayProvider.status.state === "running");
  await page.evaluate(() => closeAutoplay());
  await page.waitForFunction(() => autoplayProvider.status.state === "closed");
  const selection = await page.evaluate(async () => {
    const {createHost} = await import("/src/host/modules.mjs");
    const host = await createHost("browser", ["runtime@0"], {send() {}});
    try {
      let denied;
      try { host.require(["audio@0"]); } catch (error) { denied = error.message; }
      return {enabled: __dolly.hostModules.includes("audio@0"), denied,
        handled: await host.handle({type: "audio-request", packet: new Uint8Array(32)})};
    } finally { host.dispose(); }
  });
  assert.equal(selection.enabled, true);
  assert.match(selection.denied, /audio@0.*not enabled/);
  assert.equal(selection.handled, false);
  const submit = command => page.evaluate(text => __dolly.submit(text), command);
  for (const file of ["audio.c", "audio-client-contract.c"]) {
    assert.equal(await submit(`curl -fsS ${server.origin}/fixture/${file} -o /tmp/${file}`), 0);
  }
  assert.equal(await submit("cc /tmp/audio.c -ldolly-audio -lm -o /tmp/audio"), 0,
    await page.evaluate(() => __dolly.visibleTerminalText()));
  assert.equal(await submit("cc -Ddolly_process_call=audio_test_call /tmp/audio-client-contract.c /usr/src/dolly/audio/client.c -o /tmp/audio-client-contract && /tmp/audio-client-contract"), 0,
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
  console.log(JSON.stringify({browser: browser.version(), sdkLinked: true, guestCompiled: true, clientContract: true, autoplayResume: true, measured, boundary,
    interruptRecovery: true, device: await page.evaluate(() => __dolly.audio)}));
} catch (error) {
  if (page && !page.isClosed()) console.error(await page.evaluate(() => __dolly.visibleTerminalText()).catch(() => ""));
  throw error;
} finally {
  clearTimeout(deadline); await browser?.close(); await server.close();
}
