import assert from "node:assert/strict";
import test from "node:test";
import { modelLabel, relayProvider } from "../src/rts/spectator/launcher.mjs";
import { createPicker } from "../src/rts/spectator/picker.mjs";
import { createPrompt } from "../src/rts/spectator/prompt.mjs";
import { importRelay } from "../src/rts/spectator/relay.mjs";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as ui from "../node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-tui/dist/index.js";

test("picker filters live with Pi's fuzzy matcher, navigates, edits, pastes and cancels", () => {
  const items = [
    { value: "openrouter", label: "OpenRouter" }, { value: "codex-local", label: "Local Codex" },
    { value: "google/gemini-flash", label: "Gemini Flash", detail: "vision · $0.1/$0.3" },
    { value: "google/gemini-pro", label: "Gemini Pro" },
  ];
  let chosen, cancelled = false;
  const picker = createPicker(ui, "Models", items, value => { chosen = value; }, () => { cancelled = true; });
  picker.focused = true;
  const screen = () => picker.render(100).map(ui.stripTerminalSequences).join("\n");
  for (const key of "gmn") picker.handleInput(key);
  assert.match(screen(), /2 \/ 4 matches/);
  assert.doesNotMatch(screen(), /OpenRouter/);
  picker.handleInput("\x1b[B");
  picker.handleInput("\r");
  assert.equal(chosen.value, "google/gemini-pro");
  picker.handleInput("\x1b[A"); picker.handleInput("\n");
  assert.equal(chosen.value, "google/gemini-flash");
  assert.match(screen(), /vision.*\$0.1/);
  picker.handleInput("z"); chosen = undefined;
  assert.match(screen(), /No matches/);
  picker.handleInput("\r"); assert.equal(chosen, undefined);
  picker.handleInput("\x7f"); assert.match(screen(), /2 \/ 4 matches/);
  picker.handleInput("\x15");
  picker.handleInput("\x1b[200~cdxl\x1b[201~");
  assert.match(screen(), /1 \/ 4 matches/);
  picker.handleInput("\r"); assert.equal(chosen.value, "codex-local");
  picker.handleInput("\x1b"); assert.equal(cancelled, true);
});

test("model picker distinguishes vision, text-only, reasoning and reported prices", () => {
  const model = { id: "example", input: ["text"], reasoning: false, cost: { input: 0.2, output: 0.5 } };
  assert.match(modelLabel(model), /text only.*\$0.2\/\$0.5/);
  assert.match(modelLabel({ ...model, provider: "codex-local", input: ["image"], reasoning: true }), /vision.*reasoning.*subscription/);
});

test("secret prompt shows masked paste feedback, edits and cancels without printing the credential", () => {
  const key = "sk-or-v1-" + "0123456789abcdef".repeat(4);
  let chosen, cancelled = false;
  const prompt = createPrompt(ui, "API key", { secret: true }, value => { chosen = value; }, () => { cancelled = true; });
  prompt.focused = true;
  const screen = width => prompt.render(width).map(ui.stripTerminalSequences).join("\n");
  prompt.handleInput("\x1b[200~" + key.slice(0, 20));
  prompt.handleInput(key.slice(20) + "\n\x1b[201~");
  assert.equal(chosen, undefined, "a pasted newline must not submit the key");
  assert.match(screen(100), /\*{20}/);
  assert.doesNotMatch(screen(100) + screen(32), /sk-or-v1-|0123456789abcdef/);
  prompt.handleInput("\r"); assert.equal(chosen, key);
  prompt.handleInput("\x15"); assert.doesNotMatch(screen(100), /\*/);
  prompt.handleInput("replacement"); prompt.handleInput("\x7f");
  prompt.handleInput("\r"); assert.equal(chosen, "replacemen");
  prompt.handleInput("\x1b"); assert.equal(cancelled, true);
});

test("prompt retains invalid input for correction and lets Enter keep the current value", () => {
  let chosen;
  const prompt = createPrompt(ui, "Duration", { fallback: "600",
    validate: value => Number(value) >= 10 ? "" : "At least 10 seconds" }, value => { chosen = value; }, () => {});
  prompt.handleInput("1"); prompt.handleInput("\r");
  assert.equal(chosen, undefined);
  assert.match(prompt.render(80).map(ui.stripTerminalSequences).join("\n"), /At least 10 seconds/);
  prompt.handleInput("0"); prompt.handleInput("\r"); assert.equal(chosen, "10");
  prompt.handleInput("\x15"); prompt.handleInput("\r"); assert.equal(chosen, "600");
});

test("picker initially selects the current effort and preserves it when resized", () => {
  let chosen;
  const picker = createPicker(ui, "Effort", ["off", "low", "medium", "high"].map(value => ({ value, label: value })),
    item => { chosen = item.value; }, () => {}, "Only supported levels are shown", "medium");
  picker.render(40); picker.render(100); picker.handleInput("\r");
  assert.equal(chosen, "medium");
  picker.handleInput("\x1b[B"); picker.handleInput("\r"); assert.equal(chosen, "high");
});

test("local relay import accepts only its provider data, never native auth or command credentials", () => {
  const provider = { api: "openai-codex-responses", baseUrl: "http://127.0.0.1:9002", apiKey: "fixture-capability",
    models: [{ id: "example", input: ["image"], headers: { ignored: "not imported" } }], headers: { ignored: "not imported" } };
  const read = value => relayProvider({ providers: { "codex-local": value } });
  assert.equal(read(provider).apiKey, "fixture-capability");
  assert.equal(read(provider).headers, undefined);
  assert.equal(read(provider).models[0].headers, undefined);
  assert.throws(() => relayProvider({ auth_mode: "chatgpt", tokens: {} }), /models.json/);
  for (const baseUrl of ["https://example.com", "http://localhost@evil.test", "http://127.0.0.1:9002/path"])
    assert.throws(() => read({ ...provider, baseUrl }), /models.json/);
  assert.throws(() => read({ ...provider, apiKey: "!some-command" }), /models.json/);
  assert.throws(() => read({ ...provider, models: [{ id: "text-only", input: ["text"] }] }), /models.json/);
});

test("relay upload preserves other providers and leaves configuration intact on cancellation or invalid input", async t => {
  const directory = fs.mkdtempSync(join(tmpdir(), "dolly-relay-import-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, "models.json"), original = { providers: { openrouter: { models: [] } } };
  fs.writeFileSync(path, JSON.stringify(original));
  assert.equal(await importRelay(fs, async () => 1, directory), false);
  const upload = value => async (command, [path]) => { assert.equal(command, "upload"); fs.writeFileSync(path, JSON.stringify(value)); return 0; };
  await assert.rejects(importRelay(fs, upload({ auth_mode: "chatgpt", tokens: {} }), directory), /models.json/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path)), original);
  const config = { providers: { "codex-local": { api: "openai-codex-responses", baseUrl: "http://127.0.0.1:9092",
    apiKey: "fixture-capability", models: [{ id: "vision", input: ["image"] }] }, untrusted: { apiKey: "!command" } } };
  assert.equal(await importRelay(fs, upload(config), directory), true);
  const merged = JSON.parse(fs.readFileSync(path));
  assert.deepEqual(merged.providers.openrouter, original.providers.openrouter);
  assert.equal(merged.providers["codex-local"].apiKey, "fixture-capability");
  assert.equal(merged.providers.untrusted, undefined);
});
