// The speech-to-text image writes what the microphone hears while it is being
// said. The microphone here is the engine's sample recording played over and
// over through Web Audio (test/microphone-browser.mjs proves the device itself).
// Refused the microphone, the program says so and leaves a shell.
// Usage: node demos/speech/test/speech-browser.mjs [chromium|firefox]
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { delay, demoTest, shellPrompt } from "../../browser.mjs";

const root = new URL("../../../", import.meta.url).pathname;
const archive = execFileSync("bash", ["scripts/fetch-pinned-archive.sh", "transcribe"], { cwd: root, encoding: "utf8" }).trim();
const sample = execFileSync("tar", ["-xzOf", archive, "--wildcards", "*/samples/jfk.wav"], { maxBuffer: 1 << 24 }).toString("base64");
const image = "speech-to-text", browser = process.argv[2] ?? "chromium";
const plays = { chromium: ["--autoplay-policy=no-user-gesture-required"], firefox: { "media.autoplay.default": 0 } }[browser];
const refuses = { chromium: ["--use-fake-device-for-media-stream", "--deny-permission-prompts"],
  firefox: { "media.navigator.streams.fake": true, "permissions.default.microphone": 2 } }[browser];
const speaking = page => page.addInitScript(sample => {
  navigator.mediaDevices.getUserMedia = async () => {
    const context = new AudioContext(), source = context.createBufferSource(), output = context.createMediaStreamDestination();
    source.buffer = await context.decodeAudioData(Uint8Array.from(atob(sample), character => character.charCodeAt(0)).buffer);
    source.loop = true;
    source.connect(output);
    source.start();
    await context.resume();
    return output.stream;
  };
}, sample);

await demoTest("speech", { image, browser, launch: plays }, async ({ open }) => {
  const { page, text, waitText, prompt } = await open({ prompt: null, setup: speaking });
  await waitText(/Listening\./);
  // The line grows while it is spoken: its last row is read until a finished line holds the sentence.
  const growing = new Set();
  const sentence = /ask not what your country can do for you/i;
  const finished = () => text().then(visible => visible.split("\n").slice(0, -1).some(line => sentence.test(line)));
  for (const deadline = Date.now() + 90_000; !await finished(); await delay(100)) {
    assert.ok(Date.now() < deadline, `no finished line holds the sentence:\n${await text()}`);
    growing.add((await text()).trimEnd().split("\n").at(-1));
  }
  assert.ok(growing.size > 5, `the line was not written while spoken: ${[...growing].join(" | ")}`);
  assert.doesNotMatch(await text(), /were lost/);
  await page.keyboard.press("Control+c");
  await prompt(shellPrompt);
  assert.match(await text(), /"speech-to-text" listens again/);
  assert.equal(await page.evaluate(() => __dolly.microphone.active + __dolly.microphone.liveTracks), 0, "Ctrl+C releases the microphone");
});

await demoTest("speech refused", { image, browser, launch: refuses }, async ({ open }) => {
  const { text } = await open();
  assert.match(await text(), /the browser refused the microphone/);
});
