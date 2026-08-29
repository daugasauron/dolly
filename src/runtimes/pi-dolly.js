import { Agent } from "@earendil-works/pi-agent-core";
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import { streamSimple as streamOpenAI } from "@earendil-works/pi-ai/api/openai-completions";

const VERSION = "0.84.4";

function textResult(text, details = {}) {
  return { content: [{ type: "text", text }], details };
}

const tools = [
  {
    name: "read",
    label: "read",
    description: "Read a UTF-8 file from Dolly's in-memory filesystem",
    parameters: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
      additionalProperties: false,
    },
    executionMode: "sequential",
    async execute(_id, { path }) {
      return textResult(Dolly.readFile(path), { path });
    },
  },
  {
    name: "write",
    label: "write",
    description: "Write a UTF-8 file into Dolly's in-memory filesystem",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" },
      },
      required: ["path", "content"],
      additionalProperties: false,
    },
    executionMode: "sequential",
    async execute(_id, { path, content }) {
      Dolly.writeFile(path, content);
      return textResult(`Wrote ${content.length} bytes to ${path}`, { path });
    },
  },
  {
    name: "bash",
    label: "bash",
    description: "Run one command with /bin/slop -c inside Dolly",
    parameters: {
      type: "object",
      properties: { command: { type: "string" } },
      required: ["command"],
      additionalProperties: false,
    },
    executionMode: "sequential",
    async execute(_id, { command }) {
      const result = Dolly.shell(command);
      const output = `${result.stdout}${result.stderr}`;
      return textResult(output || `(status ${result.status})`, result);
    },
  },
];

function printUsage() {
  console.log(`pi ${VERSION} (Dolly compatibility backend)`);
  console.log("usage: pi --self-test");
  console.log("       pi --http-self-test");
  console.log("       pi -p PROMPT");
  console.log("       pi --version");
  console.log("       pi --help");
  console.log("");
  console.log("headless OpenAI-compatible mode uses DOLLY_PI_BASE_URL,");
  console.log("DOLLY_PI_MODEL, DOLLY_PI_PROVIDER, and DOLLY_PI_API_KEY");
}

function openAIModel() {
  const baseUrl = process.env.DOLLY_PI_BASE_URL;
  if (!baseUrl) throw new Error("DOLLY_PI_BASE_URL is required for HTTP-backed Pi");
  return {
    id: process.env.DOLLY_PI_MODEL || "dolly-test-model",
    name: process.env.DOLLY_PI_MODEL || "Dolly OpenAI-compatible model",
    api: "openai-completions",
    provider: process.env.DOLLY_PI_PROVIDER || "openai",
    baseUrl,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 32768,
    maxTokens: 4096,
    compat: {
      supportsStore: false,
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      supportsUsageInStreaming: false,
      supportsFinishReason: true,
      supportsStrictMode: false,
      maxTokensField: "max_tokens",
    },
  };
}

async function runHeadless(prompt, { expectToolWrite = false } = {}) {
  const toolResults = [];
  const agent = new Agent({
    initialState: {
      systemPrompt: "You are Pi running inside Dolly. Use the provided tools when useful.",
      model: openAIModel(),
      tools,
    },
    streamFn: streamOpenAI,
    getApiKey: async () => process.env.DOLLY_PI_API_KEY || "dolly-no-secret",
    toolExecution: "sequential",
  });
  agent.subscribe((event) => {
    if (event.type === "message_update" &&
        event.assistantMessageEvent.type === "text_delta") {
      process.stdout.write(event.assistantMessageEvent.delta);
    }
    if (event.type === "tool_execution_end") toolResults.push(event);
  });
  await agent.prompt(prompt);
  process.stdout.write("\n");
  if (agent.state.errorMessage) throw new Error(agent.state.errorMessage);
  if (toolResults.some((event) => event.isError)) {
    const failures = toolResults
      .filter((event) => event.isError)
      .map((event) => `${event.toolName}: ${event.result.content?.[0]?.text ?? "unknown error"}`)
      .join("; ");
    throw new Error(`Pi HTTP tool dispatch failed: ${failures}`);
  }
  if (expectToolWrite && !toolResults.some((event) => event.toolName === "write")) {
    throw new Error("Pi HTTP self-test did not dispatch the write tool");
  }
}

async function runHttpSelfTest() {
  await runHeadless("Write the HTTP adapter proof file exactly as requested.", {
    expectToolWrite: true,
  });
  if (Dolly.readFile("/workspace/pi-http-test.txt") !==
      "pi crossed Dolly's HTTP broker\n") {
    throw new Error("Pi HTTP self-test did not preserve its WasmFS write");
  }
}

async function runSelfTest() {
  const faux = fauxProvider({ tokensPerSecond: 0 });
  faux.setResponses([
    fauxAssistantMessage(
      fauxToolCall("write", {
        path: "/workspace/pi-self-test.txt",
        content: "pi agent wrote this inside WasmFS\n",
      }),
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(
      fauxToolCall("bash", { command: "cat /workspace/pi-self-test.txt" }),
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage("DOLLY-PI-OK"),
  ]);

  const agent = new Agent({
    initialState: {
      systemPrompt: "You are Pi running inside Dolly.",
      model: faux.getModel(),
      tools,
    },
    streamFn: faux.provider.streamSimple,
    toolExecution: "sequential",
  });
  const toolResults = [];
  agent.subscribe((event) => {
    if (event.type === "message_update" &&
        event.assistantMessageEvent.type === "text_delta") {
      process.stdout.write(event.assistantMessageEvent.delta);
    }
    if (event.type === "tool_execution_end") {
      toolResults.push(event);
    }
  });
  await agent.prompt("Prove that the write and bash tools share Dolly's filesystem.");
  process.stdout.write("\n");
  if (toolResults.length !== 2 || toolResults.some((event) => event.isError)) {
    const failures = toolResults
      .filter((event) => event.isError)
      .map((event) => `${event.toolName}: ${event.result.content?.[0]?.text ?? "unknown error"}`)
      .join("; ");
    throw new Error(`Pi self-test tool dispatch failed: ${failures || `${toolResults.length} tool results`}`);
  }
  if (Dolly.readFile("/workspace/pi-self-test.txt") !==
      "pi agent wrote this inside WasmFS\n") {
    throw new Error("Pi self-test did not preserve its WasmFS write");
  }
}

const args = globalThis.scriptArgs ?? [];
process.argv = ["/usr/bin/pi", ...args];
process.title = "pi";

if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  printUsage();
} else if (args.includes("--version") || args.includes("-v")) {
  console.log(VERSION);
} else if (args[0] === "--self-test") {
  await runSelfTest();
} else if (args[0] === "--http-self-test") {
  await runHttpSelfTest();
} else if ((args[0] === "-p" || args[0] === "--prompt") && args[1]) {
  await runHeadless(args.slice(1).join(" "));
} else {
  throw new Error("Dolly Pi currently supports headless -p/--prompt mode; see --help");
}
