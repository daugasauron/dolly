// Qwen 3.5 uses function/parameter tags, not Qwen 3's JSON tool envelopes.
// Pi conversation and tool formatting runs inside Janis.
function toolText(call) {
  return `<tool_call>\n<function=${call.function.name}>\n` +
    Object.entries(JSON.parse(call.function.arguments)).map(([name, value]) =>
      `<parameter=${name}>\n${typeof value === "string" ? value : JSON.stringify(value)}\n</parameter>`).join("\n") +
    "\n</function>\n</tool_call>";
}

export function qwenRequest(request) {
  const tools = request.tool_choice === "none" ? [] : request.tools ?? [];
  const messages = [];
  const lastQuery = request.messages.findLastIndex(message => message.role === "user" &&
    !/^<tool_response>[\s\S]*<\/tool_response>$/.test(message.content.trim()));
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
  for (const [index, message] of request.messages.entries()) {
    if (message.role === "system") continue;
    let role = message.role, content = message.content ?? "";
    if (role === "tool") {
      role = "user";
      content = `<tool_response>\n${content}\n</tool_response>`;
    } else if (message.tool_calls?.length) {
      content += (content ? "\n\n" : "") + message.tool_calls.map(toolText).join("\n");
    }
    // Qwen retains an empty reasoning block in the current tool round.
    if (role === "assistant" && index > lastQuery) content = "<think>\n\n</think>\n\n" + content;
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
