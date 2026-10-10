// The speech-to-text image writes what the microphone hears while it is being
// said; refused the microphone, the program says so and leaves a shell. The
// pi-phone image is Pi worked by touch on a phone's screen: an OpenRouter key
// pasted, a model and a thinking level chosen, a prompt spoken and sent, with
// openrouter.ai answered here. The microphone is the engine's sample recording
// played over and over through Web Audio (test/microphone-browser.mjs proves
// the device itself).
// Usage: node demos/speech/test/speech-browser.mjs [chromium|firefox]
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { devices } from "playwright-core";
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

// Chrome on Android is the phone this is for; Firefox has no phone to stand in for.
if (browser === "chromium") await demoTest("pi-phone", { image: "pi-phone", launch: plays, timeout: 600_000 }, async ({ open }) => {
  const key = "sk-or-v1-DOLLYPHONETESTKEY0123456789", asked = [], said = "DOLLY-PHONE-HEARD";
  // OpenRouter speaks OpenAI's completions or Anthropic's messages, by the model chosen.
  const events = {
    "/chat/completions": [{ role: "assistant", content: said }, {}].map((delta, index) => ["", { id: "phone", object: "chat.completion.chunk",
      created: 0, model: "phone", choices: [{ index: 0, delta, finish_reason: index ? "stop" : null }] }]),
    "/messages": [
      { type: "message_start", message: { id: "phone", type: "message", role: "assistant", model: "phone", content: [], stop_reason: null,
        stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } } },
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: said } },
      { type: "content_block_stop", index: 0 },
      { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 1 } },
      { type: "message_stop" },
    ].map(event => [`event: ${event.type}\n`, event]),
  };
  const { page, text, waitText } = await open({ prompt: null, device: devices["Pixel 7"], setup: async page => {
    await speaking(page);
    // The catalog is refused, so Pi keeps the models it ships; a prompt is answered.
    await page.route("https://openrouter.ai/**", route => {
      const request = route.request(), headers = { "access-control-allow-origin": "*" };
      const answer = events[new URL(request.url()).pathname.replace("/api/v1", "")];
      if (!answer) return route.fulfill({ status: 404, headers });
      asked.push({ headers: request.headers(), body: request.postDataJSON() });
      return route.fulfill({ status: 200, headers: { ...headers, "content-type": "text/event-stream" },
        body: answer.map(([event, data]) => `${event}data: ${JSON.stringify(data)}\n\n`).join("") + "data: [DONE]\n\n" });
    });
  } });
  const tap = label => page.locator("#buttons button", { hasText: new RegExp(`^${label}$`) }).tap();
  const caption = pattern => page.waitForFunction(([source, flags]) =>
    new RegExp(source, flags).test(document.querySelector("#buttons p").textContent), [pattern.source, pattern.flags], { timeout: 90_000 });
  await caption(/Tap Speak/);
  await waitText(/No models available/);
  assert.equal(await page.locator("#keyboard").getAttribute("inputmode"), "none", "a tap on the terminal must not raise the phone's keyboard");

  await page.evaluate(key => navigator.clipboard.writeText(`${key}\n`), key);
  await tap("Menu");
  await tap("OpenRouter key");
  await waitText(/Enter OpenRouter API key/);
  await tap("Paste");
  await waitText(/Saved API key for OpenRouter/);
  assert.doesNotMatch(await text(), /DOLLYPHONETESTKEY/, "Pi shows the key it was given");

  await tap("Menu");
  await tap("Model");
  await waitText(/\(1\/\d+\)/);
  await tap("Say");
  await caption(/my fellow americans/i);
  await tap("Done");
  await waitText(/> and so,? my fellow/);
  await tap("Erase");
  await waitText(/\(1\/\d+\)/);
  await tap("Down");
  const chosen = (await text()).match(/→\s+(\S+)/)[1];
  await tap("Choose");
  await waitText(new RegExp(chosen.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  await tap("Menu");
  await tap("Thinking");
  await delay(1000);
  await tap("Down");
  await tap("Choose");
  await waitText(/Thinking level: \w+/);

  await tap("Speak");
  await caption(/ask not what your country can do for you/i);
  await tap("Send");
  await waitText(new RegExp(said));
  assert.ok([asked[0].headers.authorization, asked[0].headers["x-api-key"]].some(value => value?.endsWith(key)), "the pasted key signs the request");
  assert.match(JSON.stringify(asked[0].body.messages.at(-1)), /ask not what your country can do for you/i);
  assert.equal(await page.evaluate(() => __dolly.microphone.active + __dolly.microphone.liveTracks), 0, "the microphone is open only while voice listens");
});
