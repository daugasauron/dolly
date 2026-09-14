import assert from "node:assert/strict";
import test from "node:test";
import {qwenRequest,qwenToolCalls} from "../src/local-llm/qwen.mjs";
const request=()=>({messages:[{role:"user",content:"Hello"}]});

test("Qwen native parameters preserve shell/code strings and reject incomplete or ambiguous calls", () => {
  const parameters = { type: "object", properties: {
    command: { type: "string" }, limit: { type: "integer" }, options: { type: "object" },
  }, required: ["command"], additionalProperties: false };
  const tools = [{ type: "function", function: { name: "bash", parameters } }];
  const args = { command: '\uFEFF  printf \'%s\\n\' "$value"\n# 日本語\n  ', limit: 7, options: { quiet: true } };
  const history = qwenRequest({ ...request(), tools, messages: [
    ...request().messages, { role: "assistant", tool_calls: [{ function: { name: "bash", arguments: JSON.stringify(args) } }] },
  ] }).messages.at(-1).content;
  const source = history.slice(history.indexOf("<tool_call>"));
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

test("Qwen history retains the whole conversation and marks only the current tool round", () => {
  const translated = qwenRequest({ ...request(), messages: [
    { role: "user", content: "Old task" },
    { role: "assistant", content: "Old answer" },
    { role: "user", content: "Current task" },
    { role: "assistant", content: "Current call" },
    { role: "tool", content: "First result", tool_call_id: "a" },
    { role: "tool", content: "Second result", tool_call_id: "b" },
    { role: "assistant", content: "Next call" },
    { role: "user", content: "<tool_response>\nThird result\n</tool_response>" },
  ] });
  assert.deepEqual(translated.messages.slice(1), [
    { role: "user", content: "Old task" },
    { role: "assistant", content: "Old answer" },
    { role: "user", content: "Current task" },
    { role: "assistant", content: "<think>\n\n</think>\n\nCurrent call" },
    { role: "user", content: "<tool_response>\nFirst result\n</tool_response>\n<tool_response>\nSecond result\n</tool_response>" },
    { role: "assistant", content: "<think>\n\n</think>\n\nNext call" },
    { role: "user", content: "<tool_response>\nThird result\n</tool_response>" },
  ]);
});
