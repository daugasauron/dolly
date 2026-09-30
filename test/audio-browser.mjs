import assert from "node:assert/strict";
import { browserTest } from "./browser.mjs";

// Meters each played source per channel through a muted gain.
function meter() {
  globalThis.audioMeters = [];
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
    const connect = source.connect;
    source.connect = function(target, ...args) {
      return connect.call(this, target === this.context.destination ? mute : target, ...args);
    };
    return source;
  };
}

// Queues one packet on a provider created before any user activation. It runs
// on a page that never boots Dolly, because Chrome's page.evaluate activates.
async function queueBeforeActivation(origin) {
  if (location.origin !== origin) return;
  const { browser: audioHost } = await import("/src/host/audio.mjs");
  let completed;
  globalThis.provider = audioHost({ send: message => { completed = message; } });
  let resumeCalls = 0;
  const resume = AudioContext.prototype.resume;
  AudioContext.prototype.resume = function() { ++resumeCalls; return resume.call(this); };
  const packet = new Uint8Array(32), view = new DataView(packet.buffer);
  view.setUint32(4, 1, true); view.setUint32(8, 1, true); view.setUint32(16, 1, true);
  provider.messages["audio-request"]({ packet, scope: 1, sequence: 1 });
  reportAutoplay({ error: completed.error, activated: navigator.userActivation.hasBeenActive, resumeCalls });
}

const fixtures = { "audio.c": "test/fixtures/audio.c", "audio-client-contract.c": "test/fixtures/audio-client-contract.c" };
await browserTest("audio", { image: "audio-sdk", server: { fixtures } }, async ({ browser, server, open }) => {
  const blank = await browser.newPage();
  let reported;
  const autoplay = new Promise(resolve => { reported = resolve; });
  await blank.exposeFunction("reportAutoplay", result => reported(result));
  await blank.addInitScript(queueBeforeActivation, server.origin);
  await blank.goto(`${server.origin}/fixture/http.txt`);
  assert.deepEqual(await autoplay, { error: 0, activated: false, resumeCalls: 0 });
  await blank.mouse.click(10, 10);
  await blank.waitForFunction(() => provider.status.state === "running");
  await blank.evaluate(() => provider.dispose());
  await blank.waitForFunction(() => provider.status.state === "closed");
  await blank.close();

  const errors = [];
  const { page, submit, text } = await open({
    policy: { maxRequests: 2, rules: [{ origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] }] },
    setup: page => {
      page.on("pageerror", error => errors.push(error.message));
      return page.addInitScript(meter);
    } });
  await page.mouse.click(10, 10);
  // A host without audio@0 refuses audio images and requests.
  const selection = await page.evaluate(async () => {
    const { createHost } = await import("/src/host/modules.mjs");
    const host = await createHost("browser", ["runtime@0"], { send() {} });
    try {
      let denied;
      try { host.require(["audio@0"]); } catch (error) { denied = error.message; }
      return { enabled: __dolly.hostModules.includes("audio@0"), denied,
        handled: await host.handle({ type: "audio-request", packet: new Uint8Array(32) }) };
    } finally { host.dispose(); }
  });
  assert.equal(selection.enabled, true);
  assert.match(selection.denied, /audio@0/);
  assert.equal(selection.handled, false);
  const run = async command => assert.equal(await submit(command), 0, await text());
  for (const file of ["audio.c", "audio-client-contract.c"]) await run(`curl -fsS ${server.origin}/fixture/${file} -o /tmp/${file}`);
  await run("cc /tmp/audio.c -ldolly-audio -lm -o /tmp/audio");
  await run("cc -Ddolly_process_call=audio_test_call /tmp/audio-client-contract.c /usr/src/dolly/audio/client.c -o /tmp/audio-client-contract && /tmp/audio-client-contract");
  for (let index = 0; index < 2; ++index) {
    await run("/tmp/audio");
    await page.waitForFunction(() => __dolly.audio.activeScopes === 0 && __dolly.audio.buffers === 0);
  }
  const measured = await page.evaluate(() => audioMeters.reduce((peak, value) => value.map((x, i) => Math.max(x, peak[i])), [0, 0]));
  assert.ok(measured[0] < 1e-6 && measured[1] > .2, `Wrong stereo playback: ${measured}`);
  // Ctrl-C of a playing process releases its scope and buffers.
  const holding = submit("/tmp/audio --hold");
  await page.waitForFunction(() => __dolly.audio.activeScopes === 1 && __dolly.audio.buffers > 0);
  await page.keyboard.press("Control+c");
  assert.equal(await holding, 130);
  await page.waitForFunction(() => __dolly.audio.activeScopes === 0 && __dolly.audio.buffers === 0);
  await run("/tmp/audio");
  // Quotas, leases, sequence replay and revocation at the provider boundary.
  await page.evaluate(async () => (await import("/test/fixtures/audio-boundary.mjs")).audioBoundaryProof());
  await run("true");
  assert.deepEqual(errors, []);
});
