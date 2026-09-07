export const LOCAL_MODEL_ORIGIN = "https://webgpu.dolly.invalid";
export const LOCAL_MODELS = Object.freeze([
  { size: "2B", download_bytes: 1059315328 },
  { size: "0.8B", download_bytes: 423937664 },
  { size: "4B", download_bytes: 2367117312 },
].map(({ size, download_bytes }) => Object.freeze({
  id: `Qwen3.5-${size}-q4f16_1-MLC`, object: "model", owned_by: "webgpu",
  name: `Qwen3.5 ${size} · WebGPU`, context_window: 16384, max_tokens: 2048, download_bytes,
})));
export const DEFAULT_LOCAL_MODEL = LOCAL_MODELS[0];
export const LOCAL_LIMITS = Object.freeze({
  maxRequestBytes: 1024 * 1024, maxResponseBytes: 8 * 1024 * 1024,
  timeoutMilliseconds: 600_000, idleTimeoutMilliseconds: 120_000, credentialHeaders: new Set(),
});

export function reservedLocalURL(url) {
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  return host === "dolly.invalid" || host.endsWith(".dolly.invalid");
}

function check(condition, message) {
  if (!condition) throw new Error(message);
}
function keys(value, allowed) {
  check(value && typeof value === "object" && !Array.isArray(value), "Expected an object");
  for (const key of Object.keys(value)) check(allowed.includes(key), `Unsupported field: ${key}`);
}
function calls(value) {
  check(Array.isArray(value) && value.length <= 32, "Invalid tool calls");
  for (const call of value) {
    keys(call, ["id", "type", "function"]);
    check(typeof call.id === "string" && call.type === "function", "Invalid tool call identity");
    keys(call.function, ["name", "arguments"]);
    check(typeof call.function.name === "string" && typeof call.function.arguments === "string", "Invalid tool call");
    JSON.parse(call.function.arguments);
  }
}

// Validate before copying a request to the accelerator. Never forward engine options.
export function validateCompletion(request) {
  keys(request, ["model", "messages", "stream", "stream_options", "max_tokens", "temperature", "top_p", "tools", "tool_choice", "n"]);
  const model = LOCAL_MODELS.find(model => model.id === request.model);
  check(model, "Unknown model");
  check(request.stream === true && (request.n === undefined || request.n === 1), "Only one streamed choice is supported");
  check(Number.isInteger(request.max_tokens ?? 1024) && (request.max_tokens ?? 1024) > 0 &&
    (request.max_tokens ?? 1024) <= model.max_tokens, "max_tokens exceeds the model limit");
  for (const [field, max] of [["temperature", 2], ["top_p", 1]]) {
    check(request[field] === undefined || (Number.isFinite(request[field]) && request[field] >= 0 && request[field] <= max), `Invalid ${field}`);
  }
  if (request.stream_options !== undefined) {
    keys(request.stream_options, ["include_usage"]);
    check(typeof request.stream_options.include_usage === "boolean", "Invalid stream_options");
  }
  check(Array.isArray(request.messages) && request.messages.length > 0 && request.messages.length <= 256, "Invalid messages");
  request = { ...request, messages: request.messages.map(message => {
    if (!Array.isArray(message?.content)) return message;
    for (const part of message.content) {
      keys(part, ["type", "text"]);
      check(part.type === "text" && typeof part.text === "string", "Only text messages are supported");
    }
    return { ...message, content: message.content.map(part => part.text).join("") };
  }) };
  for (const message of request.messages) {
    keys(message, ["role", "content", "tool_calls", "tool_call_id"]);
    check(["system", "user", "assistant", "tool"].includes(message.role), "Unsupported message role");
    check(typeof message.content === "string" || (message.role === "assistant" && message.content == null && message.tool_calls), "Only text messages are supported");
    if (message.tool_calls !== undefined) {
      check(message.role === "assistant", "Only assistants may call tools");
      calls(message.tool_calls);
    }
    if (message.role === "tool") check(typeof message.tool_call_id === "string", "Tool result needs an ID");
  }
  if (request.tools !== undefined) {
    check(Array.isArray(request.tools) && request.tools.length <= 32 &&
      new TextEncoder().encode(JSON.stringify(request.tools)).length <= 65536, "Tool schemas exceed the limit");
    const names = new Set();
    for (const tool of request.tools) {
      keys(tool, ["type", "function"]);
      check(tool.type === "function", "Only function tools are supported");
      keys(tool.function, ["name", "description", "parameters", "strict"]);
      const fn = tool.function;
      check(typeof fn.name === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(fn.name) && !names.has(fn.name), "Invalid or duplicate tool name");
      names.add(fn.name);
      check(fn.parameters?.type === "object", "Tool parameters must be an object schema");
      check(fn.description === undefined || typeof fn.description === "string", "Invalid tool description");
    }
  }
  check([undefined, "auto", "none", "required"].includes(request.tool_choice), "Unsupported tool_choice");
  check(request.tool_choice !== "required" || request.tools?.length, "Required tool choice needs tools");
  return request;
}
