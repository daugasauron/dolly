import assert from "node:assert/strict";
import test from "node:test";
import { modelLabel, relayProvider } from "../src/rts/spectator/launcher.mjs";
import { createPicker } from "../src/rts/spectator/picker.mjs";
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
