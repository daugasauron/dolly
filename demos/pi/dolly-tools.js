// This is a Pi extension, not a Pi source patch. Pi's upstream bash and edit
// tools keep their truncation, full-output files and edit semantics; Dolly
// only supplies the Slop shell and keeps bytes that are not UTF-8 in edits.
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
  pi.registerTool(sessionTool((cwd) => createEditToolDefinition(cwd, { operations: byteEdits })));

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
