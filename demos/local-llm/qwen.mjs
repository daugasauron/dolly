// Qwen 3.5's chat template (tokenizer.chat_template in its GGUF) with thinking off:
// function/parameter tool calls, tool results as user turns, an empty think block
// on the assistant turns after the latest user query.
const tojson = value => Array.isArray(value) ? `[${value.map(tojson).join(", ")}]`
  : value !== null && typeof value === "object"
    ? `{${Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}: ${tojson(item)}`).join(", ")}}`
    : JSON.stringify(value);

function toolText(call) {
  return `<tool_call>\n<function=${call.function.name}>\n` +
    Object.entries(JSON.parse(call.function.arguments)).map(([name, value]) =>
      `<parameter=${name}>\n${typeof value === "string" ? value : tojson(value)}\n</parameter>\n`).join("") +
    "</function>\n</tool_call>";
}

export function qwenPrompt(messages, tools) {
  const system = messages[0]?.role === "system" ? messages[0].content.trim() : "";
  let prompt = "";
  if (tools.length) {
    prompt = "<|im_start|>system\n# Tools\n\nYou have access to the following functions:\n\n<tools>" +
      tools.map(tool => "\n" + tojson(tool)).join("") + "\n</tools>" +
      "\n\nIf you choose to call a function ONLY reply in the following format with NO suffix:\n\n" +
      "<tool_call>\n<function=example_function_name>\n<parameter=example_parameter_1>\nvalue_1\n</parameter>\n" +
      "<parameter=example_parameter_2>\nThis is the value for the second parameter\nthat can span\nmultiple lines\n" +
      "</parameter>\n</function>\n</tool_call>\n\n<IMPORTANT>\nReminder:\n" +
      "- Function calls MUST follow the specified format: an inner <function=...></function> block must be nested within <tool_call></tool_call> XML tags\n" +
      "- Required parameters MUST be specified\n" +
      "- You may provide optional reasoning for your function call in natural language BEFORE the function call, but NOT after\n" +
      "- If there is no function call available, answer the question like normal with your current knowledge and do not tell the user about function calls\n" +
      "</IMPORTANT>" + (system ? "\n\n" + system : "") + "<|im_end|>\n";
  } else if (system) prompt = `<|im_start|>system\n${system}<|im_end|>\n`;
  const lastQuery = messages.findLastIndex(message => message.role === "user" &&
    !/^<tool_response>[\s\S]*<\/tool_response>$/.test(message.content.trim()));
  for (const [index, message] of messages.entries()) {
    const content = message.content.trim();
    if (message.role === "user") prompt += `<|im_start|>user\n${content}<|im_end|>\n`;
    else if (message.role === "assistant") {
      prompt += "<|im_start|>assistant\n" + (index > lastQuery ? "<think>\n\n</think>\n\n" : "") + content;
      for (const [at, call] of (message.tool_calls ?? []).entries())
        prompt += (at ? "\n" : content ? "\n\n" : "") + toolText(call);
      prompt += "<|im_end|>\n";
    } else if (message.role === "tool") {
      if (messages[index - 1]?.role !== "tool") prompt += "<|im_start|>user";
      prompt += `\n<tool_response>\n${content}\n</tool_response>`;
      if (messages[index + 1]?.role !== "tool") prompt += "<|im_end|>\n";
    }
  }
  return prompt + "<|im_start|>assistant\n<think>\n\n</think>\n\n";
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
