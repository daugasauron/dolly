// Pi extension. All game I/O stays in Dolly's in-Wasm filesystem.
// SPDX-License-Identifier: GPL-2.0-or-later
import { createInputCodec } from "./codec.mjs";
export const { parameters, encodeBatch, decodeScreenshot } = createInputCodec({
  magic: 0x31535452, version: 2, width: 800, height: 600,
});
export function playerModel(selector) {
  const separator = selector.indexOf("::");
  const provider = separator < 0 ? "openrouter" : selector.slice(0, separator);
  const model = separator < 0 ? selector : selector.slice(separator + 2);
  if (!/^[a-zA-Z0-9_-]+$/.test(provider) || !model || model.includes("::"))
    throw Error("Expected MODEL or PROVIDER::MODEL");
  return { provider, model };
}
export const coordinateConvention = "Use absolute integer pixels in this 800x600 screenshot: " +
  "(0,0) is top-left; x increases rightward to 799, y increases downward to 599. " +
  "Center is approximately (400,300). No percentages, normalized coordinates, relative deltas, " +
  "or browser/spectator offsets; player 2 must not add 800 to x.";

export function describeScreenshot({ frame, milliseconds, pointer }) {
  return `Your own view at game frame ${frame}, ${milliseconds} ms since launch. ` +
    `Mouse pointer: (${pointer.x},${pointer.y}); this is the cursor, not a world object. ` +
    coordinateConvention + " The game is still running; this image ages while you think.";
}
export function connectPlayer(fs, directory, firstId = 1, codec = { encodeBatch, decodeScreenshot }) {
  if (!directory?.startsWith("/")) throw Error("The RTS supervisor must set DOLLY_RTS_PLAYER_DIR");
  let nextId = firstId, busy = false;
  const path = name => `${directory}/${name}`;
  const remove = name => { try { fs.unlinkSync(path(name)); } catch (error) { if (error.code !== "ENOENT") throw error; } };
  const publish = (name, bytes) => {
    const temporary = `${name}.tmp`;
    try { fs.writeFileSync(path(temporary), bytes); fs.renameSync(path(temporary), path(name)); }
    finally { remove(temporary); }
  };
  return async (actions, signal) => {
    if (busy) throw Error("A game input batch is already running");
    if (signal?.aborted) throw Error("Game input cancelled");
    const id = nextId++;
    const request = codec.encodeBatch(actions, id);
    busy = true;
    let submitted = false, completed = false;
    try {
      remove("response");
      publish("request", request);
      submitted = true;
      const deadline = Date.now() + 10000;
      let response;
      while (!response) {
        if (signal?.aborted) throw Error("Game input cancelled");
        if (Date.now() >= deadline) throw Error("Game input timed out; the game may have stopped");
        if (fs.existsSync(path("response"))) {
          const bytes = fs.readFileSync(path("response"));
          // A cancelled request may finish just after the next request was
          // published. Never return its old observation as the new result.
          if (bytes.byteLength >= 16 && new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(8, true) < id) {
            remove("response");
          } else response = bytes;
        }
        if (!response) await new Promise(resolve => setTimeout(resolve, 25));
      }
      const screenshot = codec.decodeScreenshot(response, id);
      completed = true;
      return screenshot;
    } finally {
      try {
        if (submitted && !completed) {
          const cancellation = new Uint8Array(4);
          new DataView(cancellation.buffer).setUint32(0, id, true);
          publish("cancel", cancellation);
        }
        remove("response");
      } finally {
        busy = false;
      }
    }
  };
}

export function modelContext(messages) {
  const images = messages.flatMap((message, index) => Array.isArray(message.content) &&
    message.content.some(part => part.type === "image") ? [index] : []).slice(-2);
  const size = images.reduce((total, index) => total + messages[index].content.reduce((sum, part) =>
    sum + (part.type === "image" ? part.data.length : 0), 0), 0);
  // Leave room for text/tool history below the process packet's 1 MiB limit.
  if (images.length > 1 && size > 640 * 1024) images.shift();
  return messages.map((message, index) => {
    if (!Array.isArray(message.content)) return message;
    if (!images.includes(index)) return { ...message, content: message.content.filter(part => part.type !== "image") };
    const label = index === images.at(-1) ? "CURRENT screenshot: use this view for your next inputs." :
      "PREVIOUS screenshot: comparison only, not the current state.";
    return { ...message, content: [{ type: "text", text: label }, ...message.content] };
  });
}

export default function playerTools(pi) {
  const input = connectPlayer(globalThis.__janisBuiltin("fs"), process.env.DOLLY_RTS_PLAYER_DIR);
  pi.on("context", event => ({ messages: modelContext(event.messages) }));
  pi.registerTool({
    name: "game_input",
    label: "game input",
    description: "Send an ordered batch of ordinary mouse/keyboard inputs to your 800x600 player view. " +
      coordinateConvention + " " +
      "Maximum 16 actions and 2000 ms in requested durations. The game keeps running while you think. " +
      "Before calling, briefly state your observation and intent in ordinary assistant text; it stays in your history. " +
      "Use a move-only call to aim without clicking: inspect the returned cursor/hover feedback, then adjust or click in a later call. " +
      "There are no intermediate screenshots within a batch. " +
      "Returns a fresh screenshot after execution. Send an empty actions array to look without acting. " +
      "Key and click duration defaults to 100 ms, drag to 250 ms. Modifiers apply to key presses only.",
    parameters,
    async execute(_callId, arguments_, signal) {
      const screenshot = await input(arguments_.actions, signal);
      return { content: [{ type: "text", text: describeScreenshot(screenshot) }, { type: "image", mimeType: "image/png",
        data: Buffer.from(screenshot.png).toString("base64") }],
        details: { frame: screenshot.frame, milliseconds: screenshot.milliseconds, pointer: screenshot.pointer, actions: arguments_.actions } };
    },
  });
}
