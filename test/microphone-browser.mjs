// A program records the browser's default input through microphone@0: granted
// (a fake device that plays a tone), released on exit and on Ctrl-C, and
// denied. Usage: node test/microphone-browser.mjs [chromium|firefox ...]
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { browserTest } from "./browser.mjs";

// One second of a 440 Hz sine, 48 kHz mono 16-bit: Chrome's fake device loops it.
const tone = new URL("../build/fixtures/microphone-tone.wav", import.meta.url).pathname;
const wave = Buffer.alloc(44 + 48000 * 2);
wave.write("RIFF", 0); wave.writeUInt32LE(wave.length - 8, 4); wave.write("WAVEfmt ", 8);
wave.writeUInt32LE(16, 16); wave.writeUInt16LE(1, 20); wave.writeUInt16LE(1, 22); wave.writeUInt32LE(48000, 24);
wave.writeUInt32LE(96000, 28); wave.writeUInt16LE(2, 32); wave.writeUInt16LE(16, 34);
wave.write("data", 36); wave.writeUInt32LE(96000, 40);
for (let i = 0; i < 48000; ++i) wave.writeInt16LE(Math.round(16000 * Math.sin(i * 440 * 2 * Math.PI / 48000)), 44 + i * 2);
await mkdir(dirname(tone), { recursive: true });
await writeFile(tone, wave);

const fixtures = { "microphone.c": "test/fixtures/microphone.c" };
const granted = { chromium: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-audio-capture=${tone}`],
  firefox: { "media.navigator.streams.fake": true, "media.navigator.permission.disabled": true } };
const denied = { chromium: ["--use-fake-device-for-media-stream", "--deny-permission-prompts"],
  firefox: { "media.navigator.streams.fake": true, "permissions.default.microphone": 2 } };

async function compiled(open, server) {
  const errors = [];
  const session = await open({
    policy: { maxRequests: 3, rules: [{ origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] }] },
    setup: page => page.on("pageerror", error => errors.push(error.message)) });
  const run = async command => assert.equal(await session.submit(command), 0, await session.text());
  await run(`curl -fsS ${server.origin}/fixture/microphone.c -o /tmp/microphone.c`);
  await run("cc /tmp/microphone.c -lm -o /tmp/microphone");
  return { ...session, run, errors };
}
const idle = () => __dolly.microphone.active === 0 && __dolly.microphone.liveTracks === 0 &&
  document.querySelector("#microphone-status").hidden;

await browserTest("microphone", { image: "audio-sdk", server: { fixtures }, launch: granted }, async ({ name, server, open }) => {
  const { page, submit, text, run, errors } = await compiled(open, server);
  // A host without microphone@0 refuses its images and requests.
  const selection = await page.evaluate(async () => {
    const { createHost } = await import("/host/modules.mjs");
    const host = await createHost("browser", ["runtime@0"], { send() {} });
    try {
      let refused;
      try { host.require(["microphone@0"]); } catch (error) { refused = error.message; }
      return { enabled: __dolly.hostModules.includes("microphone@0"), refused, state: __dolly.microphone.state,
        handled: await host.handle({ type: "microphone-request", packet: new Uint8Array(32) }) };
    } finally { host.dispose(); }
  });
  assert.equal(selection.enabled, true);
  assert.match(selection.refused, /microphone@0/);
  assert.equal(selection.handled, false);
  assert.equal(selection.state, "closed", "nothing is asked of the browser before a program opens the microphone");

  await run("/tmp/microphone");
  const [, rms, hertz] = (await text()).match(/MICROPHONE_CAPTURED frames=24000 rms=([\d.]+) hz=(\d+)/);
  // Chrome's device plays the file above; Firefox's fake device plays 1 kHz at a tenth of full scale.
  // A lost or repeated block would shift both numbers.
  assert.ok(rms > 0.05, `silence was recorded: rms ${rms}`);
  const [played, level] = name === "chromium" ? [440, 16000 / 32768] : [1000, 0.1];
  assert.ok(Math.abs(hertz - played) <= 3, `the tone is not the one played: ${hertz} Hz`);
  assert.ok(Math.abs(rms - level / Math.SQRT2) < 0.01, `the level is not the one played: rms ${rms}`);
  await page.waitForFunction(idle);
  console.log(`microphone: ${name} recorded a ${hertz} Hz tone at rms ${rms}`);

  // Ctrl-C of a recording process releases the device.
  const holding = submit("/tmp/microphone --hold");
  await page.waitForFunction(() => __dolly.microphone.state === "capturing" && __dolly.microphone.liveTracks === 1);
  assert.equal(await page.evaluate(() => document.querySelector("#microphone-status").textContent), "Microphone on");
  await page.keyboard.press("Control+c");
  assert.equal(await holding, 130);
  await page.waitForFunction(idle);
  // Malformed packets, leases, sequence replay and revocation at the provider boundary.
  await page.evaluate(async () => (await import("/test/fixtures/microphone-boundary.mjs")).microphoneBoundaryProof());
  await page.waitForFunction(idle);
  await run("true");
  assert.deepEqual(errors, []);
});

await browserTest("microphone denied", { image: "audio-sdk", server: { fixtures }, launch: denied }, async ({ server, open }) => {
  const { page, text, run, errors } = await compiled(open, server);
  await run("/tmp/microphone --denied");
  assert.match(await text(), /MICROPHONE_DENIED/);
  await page.waitForFunction(idle);
  assert.deepEqual(errors, []);
});
