// Qwen's WebLLM template has no native tool role. Keep this translation at the
// model boundary; Dolly and Pi speak ordinary OpenAI chat completions.
export function qwenRequest(request) {
  const tools = request.tool_choice === "none" ? [] : request.tools ?? [];
  const messages = [];
  const system = request.messages.filter(m => m.role === "system").map(m => m.content);
  if (tools.length) {
    system.push('You can act only by calling the tools below. For a file or shell task, call a tool first; never claim an action was done before receiving its result.\n' +
      'To call a tool, output exactly <tool_call>{"name":"tool name","arguments":{...}}</tool_call> with real arguments and no other text. Otherwise answer normally in plain text.\n' +
      'A greeting needs an answer, not a tool. After a tool result, continue the original task without repeating successful work.\nAvailable tools:\n' + JSON.stringify(tools.map(t => t.function)));
  }
  for (const message of request.messages) {
    if (message.role === "system") continue;
    let role = message.role, content = message.content ?? "";
    if (role === "tool") {
      role = "user";
      content = JSON.stringify({ tool_result: { id: message.tool_call_id, content } }) + "\nContinue the user's request using this result.";
    } else if (message.tool_calls?.length) {
      content += (content ? "\n" : "") + message.tool_calls.map(call => `<tool_call>${JSON.stringify({
        name: call.function.name, arguments: JSON.parse(call.function.arguments),
      })}</tool_call>`).join("\n");
    }
    if (messages.at(-1)?.role === role) messages.at(-1).content += "\n" + content;
    else messages.push({ role, content });
  }
  const result = {
    model: request.model, messages: [{ role: "system", content: system.join("\n\n") }, ...messages],
    stream: true, stream_options: { include_usage: true },
    max_tokens: request.max_tokens ?? 1024, temperature: request.temperature ?? 0.2,
    top_p: request.top_p ?? 0.9, extra_body: { enable_thinking: false },
  };
  if (tools.length) {
    const alternatives = tools.map(({ function: fn }) => ({
      type: "object", properties: { name: { const: fn.name }, arguments: fn.parameters },
      required: ["name", "arguments"], additionalProperties: false,
    }));
    result.response_format = { type: "structural_tag", structural_tag: JSON.stringify({
      type: "structural_tag", format: { type: "triggered_tags", triggers: ["<tool_call>"],
        tags: [{ type: "tag", begin: "<tool_call>", end: "</tool_call>",
          content: { type: "json_schema", json_schema: { anyOf: alternatives } } }],
        at_least_one: request.tool_choice === "required", stop_after_first: true,
      },
    }) };
  }
  return result;
}

export async function* qwenCompletions(engine, request) {
  const nativeRequest = qwenRequest(request);
  // A new request carries the entire authoritative conversation from Dolly.
  await engine.resetChat();
  let output = "", terminal = null, usage, prefix = "", prefixDone = false;
  for await (const chunk of await engine.chat.completions.create(nativeRequest)) {
    const choice = chunk.choices?.[0];
    if (chunk.usage) usage = chunk.usage;
    if (choice?.finish_reason) terminal = choice.finish_reason;
    let content = choice?.delta?.content ?? "";
    if (!prefixDone) {
      prefix += content;
      // WebLLM emits Qwen's empty thinking block even with thinking disabled.
      const stripped = prefix.replace(/^\s*<think>\s*<\/think>\s*/, "");
      if (stripped !== prefix) { content = stripped; prefixDone = true; }
      else if (prefix.trim() && !"<think>".startsWith(prefix.trimStart()) && !prefix.trimStart().startsWith("<think>")) {
        content = prefix; prefixDone = true;
      } else {
        if (prefix.length > 128) throw new Error("Model emitted thinking despite thinking being disabled");
        content = "";
      }
    }
    if (nativeRequest.response_format) {
      output += content;
      if (output.length > 128 * 1024) throw new Error("Model output exceeds the tool adapter limit");
      // A bounded progress chunk yields to cancellation and downstream demand.
      yield { choices: [] };
    } else if (choice) yield { choices: [{ ...choice, delta: { ...choice.delta, content }, finish_reason: null }] };
  }
  if (!terminal) throw new Error("Model stream ended without a finish reason");
  if (!prefixDone && prefix.trim()) throw new Error("Model emitted an incomplete thinking prefix");
  let delta = {};
  if (nativeRequest.response_format) {
    const toolStart = output.indexOf("<tool_call>");
    if (toolStart !== -1 || output.trimStart().startsWith("<tool")) {
      if (terminal !== "stop") throw new Error(`Structured model response ended with ${terminal}; no tool was executed`);
      const envelope = /^<tool_call>([\s\S]*)<\/tool_call>\s*$/.exec(output.slice(Math.max(0, toolStart)));
      if (!envelope) throw new Error("Model returned an incomplete tool envelope");
      const call = JSON.parse(envelope[1]);
      if (!request.tools.some(t => t.function.name === call.name) || !call.arguments || typeof call.arguments !== "object" || Array.isArray(call.arguments)) {
        throw new Error("Model returned an invalid tool call");
      }
      if (toolStart > 0) delta.content = output.slice(0, toolStart).trimEnd();
      delta.tool_calls = [{ index: 0, id: `call_${crypto.randomUUID().replaceAll("-", "")}`, type: "function",
        function: { name: call.name, arguments: JSON.stringify(call.arguments) } }];
      terminal = "tool_calls";
    } else {
      if (!output.trim() || request.tool_choice === "required") throw new Error("Model returned no usable answer or tool call");
      delta.content = output;
    }
  }
  yield { choices: [{ index: 0, delta, finish_reason: terminal }] };
  if (request.stream_options?.include_usage && usage) yield { choices: [], usage };
}
