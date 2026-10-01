// MiniCPM5's chat template (tokenizer.chat_template in its GGUF) with thinking off:
// <function name="…"><param name="…">value</param></function> tool calls, CDATA for
// values with <, & or newlines. List and object values are JSON, which llama.cpp's
// rendering of the template leaves empty.
const tojson = value => Array.isArray(value) ? `[${value.map(tojson).join(", ")}]`
  : value !== null && typeof value === "object"
    ? `{${Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}: ${tojson(item)}`).join(", ")}}`
    : JSON.stringify(value);

function toolText(call) {
  return `<function name="${call.function.name}">` + Object.entries(JSON.parse(call.function.arguments)).map(([name, value]) =>
    `<param name="${name}">${typeof value !== "string" ? tojson(value) : /[<&\n]/.test(value) ? `<![CDATA[${value}]]>` : value}</param>`).join("") +
    "</function>";
}

export function minicpmPrompt(messages, tools) {
  const system = messages[0]?.role === "system" ? messages[0].content : null;
  let prompt = "<s>";
  if (tools.length) {
    const definitions = "# Tools\n\nYou are provided with function signatures within <tools></tools> XML tags:\n<tools>" +
      tools.map(tool => "\n" + tojson(tool)).join("") + "\n</tools>\n\nTool usage guidelines:\n" +
      "- You may call zero or more functions. If no function calls are needed, just answer normally and do not include any <function ... </function>.\n" +
      "- When calling a function, return an XML object within <function ... </function> using:\n" +
      '<function name="function-name"><param name="param-name">param-value</param></function>\n' +
      '- param-value may be multi-line. If it contains <, & or newline characters, wrap it in a CDATA block: <param name="param-name"><![CDATA[...multi-line value...]]></param>';
    prompt += `<|im_start|>system\n${system === null ? definitions : system + "\n\n" + definitions}<|im_end|>\n`;
  } else if (system !== null) prompt += `<|im_start|>system\n${system}<|im_end|>\n`;
  for (const [index, message] of messages.entries()) {
    if (message.role === "user") prompt += `<|im_start|>user\n${message.content}<|im_end|>\n`;
    else if (message.role === "assistant") {
      const content = message.content.replace(/^\n+/, "");
      prompt += "<|im_start|>assistant\n<think>\n\n</think>\n\n" + content +
        (message.tool_calls ?? []).map((call, at) => (at || content ? "\n" : "") + toolText(call)).join("") + "<|im_end|>\n";
    } else if (message.role === "tool") {
      if (messages[index - 1]?.role !== "tool") prompt += "<|im_start|>user";
      prompt += `\n<tool_response>\n${message.content}\n</tool_response>`;
      if (messages[index + 1]?.role !== "tool") prompt += "<|im_end|>\n";
    }
  }
  return prompt + "<|im_start|>assistant\n<think>\n\n</think>\n\n";
}

export function minicpmToolCalls(output, tools) {
  const calls = [];
  let remaining = output.trim();
  while (remaining) {
    const call = /^<function name="([A-Za-z0-9_-]+)">([\s\S]*?)<\/function>/.exec(remaining);
    if (!call || calls.length >= 32) throw new Error("Model returned an incomplete tool call");
    const tool = tools.find(tool => tool.function.name === call[1])?.function;
    if (!tool) throw new Error(`Model called an unknown tool: ${call[1]}`);
    const args = Object.create(null);
    let parameters = call[2].trim();
    while (parameters) {
      const parameter = /^<param name="([A-Za-z0-9_-]+)">(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/param>/.exec(parameters);
      if (!parameter || Object.hasOwn(args, parameter[1])) throw new Error("Model returned invalid or duplicate parameters");
      const [, name, data, text] = parameter;
      const schema = tool.parameters.properties?.[name];
      if (!schema && tool.parameters.additionalProperties === false) throw new Error(`Model returned an unknown parameter: ${name}`);
      let value = data ?? text;
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
