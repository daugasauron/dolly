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
    if (context.mode === "tui") {
      context.ui.setHeader((_tui, theme) => ({
        render() {
          return [
            theme.bold(theme.fg("accent", "pi / DOLLY")),
            theme.fg("muted", "Ctrl+C interrupt · / commands · ! Slop"),
            theme.fg("muted", "Ctrl+Shift+C/V copy/paste · Ctrl+/- zoom · F11 fullscreen"),
          ];
        },
        invalidate() {},
      }));
    }
    context.ui.notify(
      "Dolly runs entirely in a browser Wasm sandbox. ! and Pi's shell tool execute Slop; " +
      "Bash is not installed. Ctrl+C cancels.",
      "info",
    );
  });

  if (fs.existsSync("/usr/bin/graphics-demo")) {
    pi.registerCommand("demo", {
      description: "Run Dolly's source-built framebuffer demo",
      handler: async (_args, context) => {
        const result = Dolly.shell("graphics-demo");
        if (result.status !== 0 && result.status !== 130) {
          context.ui.notify(`graphics-demo exited with status ${result.status}`, "warning");
        }
      },
    });
  }

  pi.registerTool({
    name: "bash",
    label: "slop",
    description: "Execute a command with the Slop shell inside the Dolly WebAssembly sandbox.",
    parameters: object({ command: string("Slop command to execute") }, ["command"]),
    async execute(_id, parameters, signal, update, context) {
      const previous = Dolly.cwd();
      try {
        Dolly.chdir(context.cwd);
        if (signal?.aborted) throw new Error("command cancelled");
        const decoder = new TextDecoder();
        let output = "";
        const onChunk = (bytes) => {
          output += decoder.decode(bytes, { stream: true });
          update?.({ ...text(output), details: { status: null } });
        };
        const result = globalThis.__janisShellStream(
          parameters.command, onChunk, onChunk,
        );
        output += decoder.decode();
        if (!output) output = `(status ${result.status})`;
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

  pi.registerTool({
    name: "download",
    label: "download",
    description:
      "Download one file from Dolly's in-memory filesystem through the browser. " +
      "Use only when the user asks to save or download a file to their device.",
    parameters: object({
      path: string("File path, relative to the current workspace or absolute"),
    }, ["path"]),
    async execute(_id, parameters, _signal, _update, context) {
      const target = absolute(parameters.path, context.cwd);
      Dolly.download(target);
      return text(`Started browser download: ${path.basename(target)}`);
    },
  });
}
