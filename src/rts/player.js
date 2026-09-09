// Pi extension. All game I/O stays in Dolly's in-Wasm filesystem.
// SPDX-License-Identifier: GPL-2.0-or-later
const magic = 0x31535452;
const version = 2;
const kinds = { move: 1, click: 2, key: 3, drag: 4, wait: 5 };
const buttons = { left: 1, middle: 2, right: 3 };
const modifiers = { Shift: 1, Control: 2, Alt: 4 };
const keys = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", "Space", "Return", "Escape", "Tab",
  "Backspace", "Delete", "Left", "Right", "Up", "Down", "Home", "End", "PageUp", "PageDown",
  ...Array.from({ length: 12 }, (_, index) => `F${index + 1}`)];
const integer = (minimum, maximum) => ({ type: "integer", minimum, maximum });
const enumeration = values => ({ type: "string", enum: values });
const object = (properties, required) => ({ type: "object", properties, required, additionalProperties: false });
const point = {
  x: { ...integer(0, 799), description: "Absolute pixel x in your own 800x600 screenshot, measured rightward from its left edge." },
  y: { ...integer(0, 599), description: "Absolute pixel y in your own 800x600 screenshot, measured downward from its top edge." },
};
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
const fields = {
  move: ["x", "y"], click: ["x", "y", "button"], key: ["key"],
  drag: ["x", "y", "end_x", "end_y", "button"], wait: ["milliseconds"],
};
export const parameters = object({ actions: { type: "array", maxItems: 16, items: object({
  type: { ...enumeration(Object.keys(kinds)), description:
    "move: x,y, no button press (aim/hover); click: x,y,button; key: key and optional modifiers; drag: x,y,end_x,end_y,button; wait: milliseconds." },
  ...point, end_x: point.x, end_y: point.y,
  button: enumeration(Object.keys(buttons)), key: enumeration(keys),
  modifiers: { type: "array", maxItems: 3, uniqueItems: true, items: enumeration(Object.keys(modifiers)) },
  milliseconds: { ...integer(16, 2000), description: "Input duration, or time to remain at a moved pointer position." },
}, ["type"]) } }, ["actions"]);

function uint(value, minimum, maximum, label) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw Error(`Invalid ${label}`);
  return value;
}

export function encodeBatch(actions, id) {
  uint(id, 1, 0xffffffff, "request id");
  if (!Array.isArray(actions) || actions.length > 16) throw Error("At most 16 actions per batch");
  const bytes = new Uint8Array(16 + actions.length * 64);
  const view = new DataView(bytes.buffer);
  [magic, version, id, actions.length].forEach((value, index) => view.setUint32(index * 4, value, true));
  let duration = 0;
  for (const [index, action] of actions.entries()) {
    if (!action || !Object.hasOwn(fields, action.type)) throw Error("Each action needs type: move, click, key, drag or wait");
    const required = fields[action.type];
    const allowed = ["type", "milliseconds", ...required, ...(action.type === "key" ? ["modifiers"] : [])];
    if (Object.keys(action).some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(action, key)))
      throw Error(`${action.type} requires ${required.join(", ")}; allowed fields: ${allowed.join(", ")}. No actions were executed.`);
    const type = kinds[action.type];
    const milliseconds = uint(action.milliseconds ?? (type === 1 ? 16 : type === 4 ? 250 : 100), 16, 2000, "duration");
    duration += milliseconds;
    if (duration > 2000) throw Error("A batch may occupy at most 2000 milliseconds");
    let x = 0, y = 0, endX = 0, endY = 0, button = 0, modifier = 0;
    if (type === 1 || type === 2 || type === 4) {
      x = uint(action.x, 0, 799, "x coordinate");
      y = uint(action.y, 0, 599, "y coordinate");
    }
    if (type === 4) {
      endX = uint(action.end_x, 0, 799, "drag x coordinate");
      endY = uint(action.end_y, 0, 599, "drag y coordinate");
    }
    if (type === 2 || type === 4) {
      if (!Object.hasOwn(buttons, action.button)) throw Error("Invalid mouse button");
      button = buttons[action.button];
    }
    if (type === 3) {
      if (!keys.includes(action.key)) throw Error("Invalid key");
      const selected = action.modifiers ?? [];
      if (!Array.isArray(selected) || selected.length > 3 || new Set(selected).size !== selected.length ||
          selected.some(value => !Object.hasOwn(modifiers, value))) throw Error("Invalid key modifiers");
      for (const value of selected) modifier |= modifiers[value];
      bytes.set(new TextEncoder().encode(action.key), 16 + index * 64 + 32);
    }
    [type, x, y, endX, endY, button, milliseconds, modifier].forEach((value, word) =>
      view.setUint32(16 + index * 64 + word * 4, value, true));
  }
  return bytes;
}

export function decodeScreenshot(bytes, id) {
  if (bytes.byteLength < 32) throw Error("Truncated game response");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const word = index => view.getUint32(index * 4, true);
  if (word(0) !== magic || word(1) !== version || word(2) !== id || word(6) !== bytes.byteLength - 32)
    throw Error("Invalid game response");
  if (word(3)) throw Error(`Game input failed (errno ${word(3)})`);
  const png = bytes.subarray(32);
  if (png.length < 8 || ![137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => png[i] === value))
    throw Error("Game response is not a PNG screenshot");
  const pointer = { x: view.getUint16(28, true), y: view.getUint16(30, true) };
  if (pointer.x >= 800 || pointer.y >= 600) throw Error("Invalid screenshot pointer coordinates");
  return { png, frame: word(4), milliseconds: word(5), pointer };
}

export function connectPlayer(fs, directory, firstId = 1) {
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
    const request = encodeBatch(actions, id);
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
      const screenshot = decodeScreenshot(response, id);
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
