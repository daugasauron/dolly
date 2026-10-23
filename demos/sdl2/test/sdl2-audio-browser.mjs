// SDL's audio callback plays through audio@0: an SDL2 program's right-channel
// tone is heard on the right only, in Chromium and Firefox.
// Usage: node demos/sdl2/test/sdl2-audio-browser.mjs
import assert from "node:assert/strict";
import { demoTest, installProbe } from "../../browser.mjs";

// Meters each played source per channel through a muted gain, as test/audio-browser.mjs does.
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
    source.addEventListener("ended", () => clearInterval(timer));
    audioMeters.push(peak);
    const connect = source.connect;
    source.connect = function(target, ...args) {
      return connect.call(this, target === this.context.destination ? mute : target, ...args);
    };
    return source;
  };
}

for (const browser of ["chromium", "firefox"]) {
  await demoTest("sdl2 audio", { image: "sdl2", browser, timeout: 600_000,
    server: { fixtures: { "sdl2-tone.c": "demos/sdl2/test/fixtures/sdl2-tone.c" } } }, async ({ server, open }) => {
    const probe = await installProbe("sdl2");
    const { page, run, text } = await open({ ...probe,
      policy: { rules: [{ origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] }] },
      setup: async page => { await probe.setup(page); await page.addInitScript(meter); } });
    // Playback may wait for a user interaction; the page has one.
    await page.mouse.click(10, 10);
    await run(`curl -fsS ${server.origin}/fixture/sdl2-tone.c -o /tmp/tone.c && cc -O1 -I/usr/include/SDL2 /tmp/tone.c -o /tmp/tone -lSDL2 -lm`);
    await run("/tmp/tone > /tmp/tone.out");
    await run("grep -qx 'driver dolly' /tmp/tone.out");
    await page.waitForFunction(() => __dolly.audio.activeScopes === 0 && __dolly.audio.buffers === 0);
    const heard = await page.evaluate(() => audioMeters.reduce((peak, value) => value.map((x, i) => Math.max(x, peak[i])), [0, 0]));
    // The tone's RMS is .35; each 1024-frame buffer the driver writes fills half of the
    // meter's 2048-sample window, so a buffer reads about half that.
    assert.ok(heard[0] < 1e-6 && heard[1] > .15, `Wrong stereo playback: ${heard}\n${await text()}`);
  });
}
