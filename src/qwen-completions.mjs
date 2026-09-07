// Qwen 3.5 uses function/parameter tags, not Qwen 3's JSON tool envelopes.
// Keep its template at the model boundary; Dolly/Pi speak OpenAI completions.
const encoder = new TextEncoder();
function toolText(call) {
  return `<tool_call>\n<function=${call.function.name}>\n` +
    Object.entries(JSON.parse(call.function.arguments)).map(([name, value]) =>
      `<parameter=${name}>\n${typeof value === "string" ? value : JSON.stringify(value)}\n</parameter>`).join("\n") +
    "\n</function>\n</tool_call>";
}

export function qwenRequest(request) {
  const tools = request.tool_choice === "none" ? [] : request.tools ?? [];
  const messages = [];
  const system = request.messages.filter(m => m.role === "system").map(m => m.content);
  if (tools.length) {
    system.unshift('# Tools\n\n<tools>\n' + tools.map(tool => JSON.stringify(tool)).join("\n") +
      '\n</tools>\n\nCall a function using this format:\n' +
      '<tool_call>\n<function=FUNCTION_NAME>\n<parameter=PARAMETER_NAME>\nVALUE\n</parameter>\n</function>\n</tool_call>\n' +
      'Include every required parameter. String values are raw text, not quoted JSON; other values are JSON. ' +
      'An explanation may precede a call, but nothing follows it. Answer normally when no tool is needed. ' +
      'A tool result reports what happened; use it to continue the original task, without repeating successful work.' +
      (request.tool_choice === "required" ? '\nThis response must call a tool.' : ''));
  }
  for (const message of request.messages) {
    if (message.role === "system") continue;
    let role = message.role, content = message.content ?? "";
    if (role === "tool") {
      role = "user";
      content = `<tool_response>\n${content}\n</tool_response>`;
    } else if (message.tool_calls?.length) {
      content += (content ? "\n" : "") + message.tool_calls.map(toolText).join("\n");
    }
    if (messages.at(-1)?.role === role) messages.at(-1).content += "\n" + content;
    else messages.push({ role, content });
  }
  return {
    model: request.model, messages: [{ role: "system", content: system.join("\n\n") }, ...messages],
    stream: true, stream_options: { include_usage: true },
    max_tokens: request.max_tokens ?? 1024, temperature: request.temperature ?? 0.2,
    top_p: request.top_p ?? 0.9, extra_body: { enable_thinking: false },
  };
}

export function qwenToolCalls(output, tools) {
  const calls = [];
  let remaining = output.trim();
  while (remaining) {
    const call = /^<tool_call>\s*<function=([A-Za-z0-9_-]+)>\s*([\s\S]*?)<\/function>\s*<\/tool_call>/.exec(remaining);
    if (!call || calls.length >= 32) throw new Error("Model returned an incomplete tool envelope");
    const tool = tools.find(tool => tool.function.name === call[1])?.function;
    if (!tool) throw new Error(`Model called an unknown tool: ${call[1]}`);
    const args = Object.create(null);
    let parameters = call[2].trim();
    while (parameters) {
      const parameter = /^<parameter=([A-Za-z0-9_-]+)>([\s\S]*?)<\/parameter>/.exec(parameters);
      if (!parameter || Object.hasOwn(args, parameter[1])) throw new Error("Model returned invalid or duplicate parameters");
      const [, name, text] = parameter;
      const schema = tool.parameters.properties?.[name];
      if (!schema && tool.parameters.additionalProperties === false) throw new Error(`Model returned an unknown parameter: ${name}`);
      // Remove only the template's enclosing newlines, never string data spaces.
      let value = text.replace(/^\r?\n/, "").replace(/\r?\n$/, "");
      if (schema?.type !== "string") {
        try { value = JSON.parse(value); } catch { /* Pi validates parameter types. */ }
      }
      args[name] = value;
      parameters = parameters.slice(parameter[0].length).trimStart();
    }
    for (const name of tool.parameters.required ?? []) {
      if (!Object.hasOwn(args, name)) throw new Error(`Model omitted required parameter: ${name}`);
    }
    calls.push({ index: calls.length, id: `call_${crypto.randomUUID().replaceAll("-", "")}`, type: "function",
      function: { name: tool.name, arguments: JSON.stringify(args) } });
    remaining = remaining.slice(call[0].length).trimStart();
  }
  return calls;
}

export async function* qwenCompletions(engine, request) {
  const nativeRequest = qwenRequest(request);
  const tools = request.tool_choice === "none" ? [] : request.tools ?? [];
  // A new request carries the entire authoritative conversation from Dolly.
  await engine.resetChat();
  let output = "", outputBytes = 0, terminal = null, usage, prefix = "", prefixDone = false;
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
    if (tools.length) {
      output += content;
      outputBytes += encoder.encode(content).byteLength;
      if (outputBytes > 128 * 1024) throw new Error("Model output exceeds the tool adapter limit");
      // A bounded progress chunk yields to cancellation and downstream demand.
      yield { choices: [] };
    } else if (choice) yield { choices: [{ ...choice, delta: { ...choice.delta, content }, finish_reason: null }] };
  }
  if (!terminal) throw new Error("Model stream ended without a finish reason");
  if (!prefixDone && prefix.trim()) throw new Error("Model emitted an incomplete thinking prefix");
  let delta = {};
  if (tools.length) {
    const toolStart = output.indexOf("<tool_call>");
    if (toolStart !== -1 || output.trimStart().startsWith("<tool")) {
      if (terminal !== "stop") throw new Error(`Structured model response ended with ${terminal}; no tool was executed`);
      if (toolStart > 0) delta.content = output.slice(0, toolStart).trimEnd();
      delta.tool_calls = qwenToolCalls(output.slice(Math.max(0, toolStart)), tools);
      terminal = "tool_calls";
    } else {
      if (!output.trim() || request.tool_choice === "required") throw new Error("Model returned no usable answer or tool call");
      delta.content = output;
    }
  }
  yield { choices: [{ index: 0, delta, finish_reason: terminal }] };
  if (request.stream_options?.include_usage && usage) yield { choices: [], usage };
}
