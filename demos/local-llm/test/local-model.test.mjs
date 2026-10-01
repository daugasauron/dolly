import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {qwenPrompt,qwenToolCalls} from "../qwen.mjs";
import {minicpmPrompt,minicpmToolCalls} from "../minicpm.mjs";

test("Qwen native parameters preserve shell/code strings and reject incomplete or ambiguous calls", () => {
  const parameters = { type: "object", properties: {
    command: { type: "string" }, limit: { type: "integer" }, options: { type: "object" },
  }, required: ["command"], additionalProperties: false };
  const tools = [{ type: "function", function: { name: "bash", parameters } }];
  const args = { command: '\uFEFF  printf \'%s\\n\' "$value"\n# 日本語\n  ', limit: 7, options: { quiet: true } };
  const history = qwenPrompt([{ role: "user", content: "Hello" },
    { role: "assistant", content: "", tool_calls: [{ function: { name: "bash", arguments: JSON.stringify(args) } }] }], tools);
  const call = history.lastIndexOf("<tool_call>"), source = history.slice(call, history.indexOf("<|im_end|>", call));
  const calls = qwenToolCalls(source + "\n" + source, tools);
  assert.equal(calls.length, 2);
  assert.notEqual(calls[0].id, calls[1].id);
  assert.deepEqual(JSON.parse(calls[0].function.arguments), args);
  for (const malformed of [
    source.slice(0, -1), source + "extra", source.replace("<function=bash>", "<function=unknown>"),
    source.replace("<parameter=command>", "<parameter=surprise>"),
    source.replace("<parameter=limit>", "<parameter=command>"),
    "<tool_call><function=bash></function></tool_call>",
    '<tool_call>{"name":"bash","arguments":{"command":"echo wrong format"}}</tool_call>',
  ]) assert.throws(() => qwenToolCalls(malformed, tools));
});

// Each fixture is llama.cpp's rendering of the model's GGUF chat template; see its source.
const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}-template.json`, import.meta.url)));

test("Prompts match the models' own chat templates", () => {
  for (const [name, render] of [["qwen3.5", qwenPrompt], ["minicpm5", minicpmPrompt]]) {
    const {messages, tools, prompt} = fixture(name);
    assert.equal(render(messages, tools), prompt, name);
  }
});

test("MiniCPM parameters round-trip through CDATA and JSON values", () => {
  const {messages, tools} = fixture("minicpm5");
  const args = { path: "a]b.c", oldText: "if (a < b && c)\n  x();", newText: "  spaced  " };
  const history = minicpmPrompt([...messages.slice(0, 2),
    { role: "assistant", content: "", tool_calls: [{ function: { name: "edit", arguments: JSON.stringify(args) } }] }], tools);
  const call = history.lastIndexOf("<function name="), source = history.slice(call, history.indexOf("<|im_end|>", call));
  assert.deepEqual(JSON.parse(minicpmToolCalls(source, tools)[0].function.arguments), args);
  for (const malformed of [source.slice(0, -1), source + "extra", source.replace('name="edit"', 'name="unknown"'),
    source.replace(/<param name="path">[^<]*<\/param>/, "")]) assert.throws(() => minicpmToolCalls(malformed, tools));
});
