// This is a Pi extension, not a Pi source patch. It replaces the four default
// coding tools with implementations that use Janis's in-Wasm Dolly substrate.

const path = globalThis.__janisBuiltin("path");
const fs = globalThis.__janisBuiltin("fs");

const text = (value) => ({ content: [{ type: "text", text: String(value) }], details: {} });
const absolute = (value, cwd) => path.resolve(cwd, String(value));

function object(properties, required) {
  return { type: "object", properties, required, additionalProperties: false };
}
const string = (description) => ({ type: "string", description });

export default function dollyTools(pi) {
  pi.on("session_start", async (_event, context) => {
    context.ui.notify(
      "Dolly runs entirely in a browser Wasm sandbox. /demo opens the framebuffer; " +
      "/voice explains speech input; Ctrl+Shift+C/V copy/paste; Ctrl+/- zoom; F11 fullscreen; Ctrl+C cancels.",
      "info",
    );
  });

  pi.registerCommand("demo", {
    description: "Run Dolly's source-built framebuffer demo",
    handler: async (_args, context) => {
      const result = Dolly.shell("graphics-demo");
      if (result.status !== 0 && result.status !== 130) {
        context.ui.notify(`graphics-demo exited with status ${result.status}`, "warning");
      }
    },
  });

  pi.registerCommand("voice", {
    description: "Explain Dolly's explicit browser microphone bridge",
    handler: async (_args, context) => {
      context.ui.notify(
        "Use the phone / menu and tap Voice, or press Ctrl+Shift+M. The browser asks for microphone permission, then sends only the recognized transcript to Pi.",
        "info",
      );
    },
  });

  // The trusted browser voice control injects this command after a direct user
  // gesture. Speech recognition never becomes a capability callable by Wasm;
  // the extension only turns the bounded transcript back into an ordinary Pi
  // user message.
  pi.registerCommand("voice-prompt", {
    description: "Submit a transcript from Dolly's browser voice control",
    handler: async (args, context) => {
      const prompt = args.trim();
      if (!prompt) {
        context.ui.notify("No speech was recognized.", "warning");
        return;
      }
      if (!context.isIdle()) {
        pi.sendUserMessage(prompt, { deliverAs: "followUp" });
        context.ui.notify("Voice prompt queued.", "info");
        return;
      }
      pi.sendUserMessage(prompt);
    },
  });

  pi.registerTool({
    name: "bash",
    label: "slop",
    description: "Execute a command with the Slop shell inside the Dolly WebAssembly sandbox.",
    parameters: object({ command: string("Slop command to execute") }, ["command"]),
    async execute(_id, parameters, _signal, _update, context) {
      const previous = Dolly.cwd();
      try {
        Dolly.chdir(context.cwd);
        const result = Dolly.shell(parameters.command);
        const output = `${result.stdout}${result.stderr}` || `(status ${result.status})`;
        return { ...text(output), details: { status: result.status } };
      } finally {
        Dolly.chdir(previous);
      }
    },
  });

  pi.registerTool({
    name: "read",
    label: "read",
    description: "Read a UTF-8 file from Dolly's in-memory filesystem.",
    parameters: object({
      path: string("File path, relative to the current workspace or absolute"),
      offset: { type: "number", description: "First line to return, one-based" },
      limit: { type: "number", description: "Maximum number of lines" },
    }, ["path"]),
    async execute(_id, parameters, _signal, _update, context) {
      const contents = Dolly.readFile(absolute(parameters.path, context.cwd));
      const lines = contents.split("\n");
      const start = Math.max(0, (parameters.offset ?? 1) - 1);
      const end = parameters.limit === undefined ? lines.length : start + parameters.limit;
      return text(lines.slice(start, end).join("\n"));
    },
  });

  pi.registerTool({
    name: "write",
    label: "write",
    description: "Create or replace a UTF-8 file in Dolly's in-memory filesystem.",
    parameters: object({
      path: string("File path, relative to the current workspace or absolute"),
      content: string("Complete file contents"),
    }, ["path", "content"]),
    async execute(_id, parameters, _signal, _update, context) {
      const target = absolute(parameters.path, context.cwd);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      Dolly.writeFile(target, parameters.content);
      return text(`Wrote ${parameters.content.length} bytes to ${target}`);
    },
  });

  pi.registerTool({
    name: "edit",
    label: "edit",
    description: "Replace one exact text occurrence in a UTF-8 file in Dolly's filesystem.",
    parameters: object({
      path: string("File path, relative to the current workspace or absolute"),
      old_text: string("Exact text to replace; it must occur once"),
      new_text: string("Replacement text"),
    }, ["path", "old_text", "new_text"]),
    async execute(_id, parameters, _signal, _update, context) {
      const target = absolute(parameters.path, context.cwd);
      const contents = Dolly.readFile(target);
      const first = contents.indexOf(parameters.old_text);
      if (first < 0) throw new Error("old_text was not found");
      if (contents.indexOf(parameters.old_text, first + parameters.old_text.length) >= 0) {
        throw new Error("old_text occurs more than once");
      }
      Dolly.writeFile(target,
        `${contents.slice(0, first)}${parameters.new_text}${contents.slice(first + parameters.old_text.length)}`);
      return text(`Edited ${target}`);
    },
  });
}
