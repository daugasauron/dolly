// This is a Pi extension, not a Pi source patch. Pi's upstream bash and edit
// tools keep their truncation, full-output files and edit semantics; Dolly
// only supplies the Slop shell and refuses edits that would corrupt bytes.
import { spawn } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { createBashToolDefinition, createEditToolDefinition } from "@earendil-works/pi-coding-agent";

// Each pipe has its own decoder, so interleaved stdout/stderr cannot split a
// UTF-8 scalar inside Pi's single output decoder.
function forwardText(stream, onData) {
  const decoder = new TextDecoder("utf-8", { ignoreBOM: true });
  const emit = (value) => { if (value) onData(Buffer.from(value)); };
  stream?.on("data", (bytes) => emit(decoder.decode(bytes, { stream: true })))
    .on("end", () => emit(decoder.decode()));
}

// Pi's BashOperations contract: resolve the exit code, or reject with
// "aborted" / "timeout:SECONDS" so Pi reports the partial output.
export const slop = {
  exec: (command, cwd, { onData, signal, timeout, env }) => new Promise((resolveExit, reject) => {
    if (signal?.aborted) return reject(new Error("aborted"));
    const child = spawn("slop", ["-c", command], { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    forwardText(child.stdout, onData);
    forwardText(child.stderr, onData);
    let timedOut = false;
    const kill = () => child.kill("SIGKILL");
    const timer = timeout && setTimeout(() => { timedOut = true; kill(); }, timeout * 1000);
    signal?.addEventListener("abort", kill);
    child.on("error", reject);
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", kill);
      if (signal?.aborted) reject(new Error("aborted"));
      else if (timedOut) reject(new Error(`timeout:${timeout}`));
      else resolveExit({ exitCode });
    });
  }),
};

// Pi edits decoded text and writes it back as UTF-8; invalid bytes would
// silently become U+FFFD, so such files are refused before any change.
const utf8Only = new TextDecoder("utf-8", { fatal: true });
const utf8Edits = {
  access,
  writeFile,
  async readFile(path) {
    const bytes = await readFile(path);
    utf8Only.decode(bytes);
    return bytes;
  },
};

// Pi binds a tool's cwd at creation; follow the calling session's cwd instead.
function sessionTool(create) {
  return {
    ...create(process.cwd()),
    execute: (id, input, signal, update, context) =>
      create(context.cwd).execute(id, input, signal, update, context),
  };
}

export default function dollyTools(pi) {
  pi.on("user_bash", () => ({ operations: slop }));
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

  pi.registerTool(sessionTool((cwd) => createBashToolDefinition(cwd, { operations: slop })));
  pi.registerTool(sessionTool((cwd) => createEditToolDefinition(cwd, { operations: utf8Edits })));

  pi.registerTool({
    name: "download",
    label: "download",
    description:
      "Download one file from Dolly's in-memory filesystem through the browser. " +
      "Use only when the user asks to save or download a file to their device.",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "File path, relative to the current workspace or absolute" } },
      required: ["path"],
      additionalProperties: false,
    },
    async execute(_id, parameters, _signal, _update, context) {
      const target = resolve(context.cwd, String(parameters.path));
      Dolly.download(target);
      return { content: [{ type: "text", text: `Started browser download: ${basename(target)}` }], details: {} };
    },
  });
}
