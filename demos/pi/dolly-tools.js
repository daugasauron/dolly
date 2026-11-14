// This is a Pi extension, not a Pi source patch. Pi's upstream bash and edit
// tools keep their truncation, full-output files and edit semantics; Dolly
// only supplies the Slop shell and keeps bytes that are not UTF-8 in edits.
import { spawn } from "node:child_process";
import { access, lstat, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
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

// Pi edits decoded text and writes it back as UTF-8, which would turn invalid
// bytes into U+FFFD. Each byte that is not UTF-8 crosses the edit as one code
// point of U+10FF80..U+10FFFF and is written back unchanged; files that
// already contain those code points are refused.
const escapeBase = 0x10ff00;
const escapedByte = /[\u{10FF80}-\u{10FFFF}]/gu;
const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const sequenceLength = (byte) =>
  byte < 0x80 ? 1 : byte >= 0xc2 && byte < 0xe0 ? 2 : byte >= 0xe0 && byte < 0xf0 ? 3 : byte >= 0xf0 && byte < 0xf5 ? 4 : 0;
function decodeKeepingBytes(path, bytes) {
  let text = "";
  for (let offset = 0; offset < bytes.length;) {
    const length = sequenceLength(bytes[offset]);
    let scalar = length === 1 ? String.fromCharCode(bytes[offset]) : "";
    if (length > 1) try { scalar = utf8.decode(bytes.subarray(offset, offset + length)); } catch {}
    if (scalar.match(escapedByte)) throw new Error(`${path} contains U+10FF80..U+10FFFF, which Dolly's edit reserves for non-UTF-8 bytes`);
    if (scalar) offset += length;
    else scalar = String.fromCodePoint(escapeBase + bytes[offset++]);
    text += scalar;
  }
  return text;
}
const byteEdits = {
  access,
  async readFile(path) {
    const bytes = await readFile(path);
    try { if (!utf8.decode(bytes).match(escapedByte)) return bytes; } catch {}
    return Buffer.from(decodeKeepingBytes(path, bytes));
  },
  writeFile(path, text) {
    const chunks = [];
    let start = 0;
    for (const match of text.matchAll(escapedByte)) {
      chunks.push(Buffer.from(text.slice(start, match.index)), Buffer.of(match[0].codePointAt(0) - escapeBase));
      start = match.index + match[0].length;
    }
    chunks.push(Buffer.from(text.slice(start)));
    return writeFile(path, Buffer.concat(chunks));
  },
};

// The upload command (upload@0) shows the page's file dialog and writes the
// file the user chooses to a path that does not exist yet; the browser passes
// on its bytes alone. Resolves to its status and what it wrote to stderr.
function upload(target, signal) {
  return new Promise((resolveStatus, reject) => {
    if (signal?.aborted) return reject(new Error("aborted"));
    const child = spawn("upload", [target], { stdio: ["ignore", "ignore", "pipe"] });
    let errors = "";
    child.stderr.on("data", (bytes) => { errors += bytes; });
    const kill = () => child.kill("SIGKILL");
    signal?.addEventListener("abort", kill);
    child.on("error", reject);
    child.on("close", (status) => {
      signal?.removeEventListener("abort", kill);
      if (signal?.aborted) reject(new Error("aborted"));
      else resolveStatus({ status, errors: errors.trim() });
    });
  });
}

async function unusedPath(directory) {
  for (let index = 1; ; index++) {
    const path = resolve(directory, `upload-${index}`);
    if (!(await lstat(path).catch(() => null))) return path;
  }
}

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
        // Pi ends on a line wider than the terminal; every character here is one column.
        render(width) {
          const line = (color, text) => theme.fg(color, text.slice(0, width));
          return [
            theme.bold(line("accent", "pi / DOLLY")),
            line("muted", "Ctrl+C interrupt · / commands · ! Slop"),
            line("muted", "Ctrl+Shift+C/V copy/paste · Ctrl+/- zoom · F11 fullscreen"),
          ];
        },
        invalidate() {},
      }));
    }
    context.ui.notify(
      "Dolly runs entirely in a browser Wasm sandbox. ! and Pi's shell tool execute Slop; " +
      "Bash is not installed. Ctrl+C cancels. /login shows an API key as it is typed: " +
      "to keep one off the screen, leave with Ctrl+D and run pi-key ANTHROPIC_API_KEY (or your provider's variable).",
      "info",
    );
  });

  // Pi runs one response's tool calls at once unless one of them is sequential.
  // Models write a batch in the order it must happen, such as a command that
  // writes a file and then an edit of it: the shell and edit tools keep it.
  // Pi's bash tool tells the model it runs Bash; here it runs Slop without a terminal.
  pi.registerTool(sessionTool((cwd) => {
    const tool = createBashToolDefinition(cwd, { operations: slop });
    return { ...tool, executionMode: "sequential", description: tool.description.replace("Execute a bash command",
      "Run a command in Slop, Dolly's POSIX shell (not Bash), with no terminal or keyboard,") };
  }));
  pi.registerTool(sessionTool((cwd) => ({
    ...createEditToolDefinition(cwd, { operations: byteEdits }), executionMode: "sequential" })));

  pi.registerTool({
    name: "download",
    label: "download",
    executionMode: "sequential",
    description:
      "Offer one file of Dolly's in-memory filesystem to the user's browser, which saves it " +
      "when the user clicks Save. Use only when the user asks to save or download a file to " +
      "their device; for several files, download one archive (git archive).",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "File path, relative to the current workspace or absolute" } },
      required: ["path"],
      additionalProperties: false,
    },
    async execute(_id, parameters, _signal, _update, context) {
      const target = resolve(context.cwd, String(parameters.path));
      Dolly.download(target);
      return { content: [{ type: "text", text: `Offered ${basename(target)} to the browser; the user saves it with the page's Save button.` }], details: {} };
    },
  });

  // The call, the reason with it, shows on the terminal under the page's dialog.
  pi.registerTool({
    name: "upload",
    label: "upload",
    executionMode: "sequential",
    exposure: "model-only",
    description:
      "Ask the user for a file of their device: the page shows a file dialog, and the file the user chooses " +
      "(at most 1 GiB) is written into Dolly's filesystem. Waits until the user chooses one or cancels. Use it " +
      "when the task needs a file only the user has, such as a document, data or an image they mention, not for " +
      "anything you can fetch or write yourself. Returns the new file's path and size (the browser does not " +
      "pass on its name), or that the user cancelled.",
    parameters: {
      type: "object",
      properties: {
        reason: { type: "string", description: "What the file is for, in a few words the user reads before choosing it" },
        path: { type: "string", description: "Where to write it, relative to the current workspace or absolute: " +
          "a path that does not exist yet. Without it, upload-N in the workspace" },
      },
      required: ["reason"],
      additionalProperties: false,
    },
    async execute(_id, { path }, signal, _update, context) {
      const target = path ? resolve(context.cwd, String(path)) : await unusedPath(context.cwd);
      await mkdir(dirname(target), { recursive: true });
      const { status, errors } = await upload(target, signal);
      // upload prints the C library's message for ECANCELED when the user cancels.
      if (status !== 0 && errors.endsWith("Operation canceled")) {
        return { content: [{ type: "text", text: "The user cancelled the upload." }], details: { cancelled: true } };
      }
      if (status !== 0) throw new Error(errors || `upload exited with status ${status}`);
      const details = { path: target, size: (await stat(target)).size };
      return { content: [{ type: "text", text: JSON.stringify(details) }], details };
    },
  });
}
