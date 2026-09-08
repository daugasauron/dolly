// Pi extension. All game I/O stays in Dolly's in-Wasm filesystem.
// SPDX-License-Identifier: GPL-2.0-or-later
const magic = 0x31535452;
const kinds = { move: 1, click: 2, key: 3, drag: 4, wait: 5 };
const buttons = { left: 1, middle: 2, right: 3 };
const modifiers = { Shift: 1, Control: 2, Alt: 4 };
const keys = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", "Space", "Return", "Escape", "Tab",
  "Backspace", "Delete", "Left", "Right", "Up", "Down", "Home", "End", "PageUp", "PageDown",
  ...Array.from({ length: 12 }, (_, index) => `F${index + 1}`)];
const integer = (minimum, maximum) => ({ type: "integer", minimum, maximum });
const enumeration = values => ({ type: "string", enum: values });
const object = (properties, required) => ({ type: "object", properties, required, additionalProperties: false });
const point = { x: integer(0, 799), y: integer(0, 599) };
const time = { milliseconds: integer(16, 2000) };
const kind = type => ({ type: { const: type, type: "string" } });
export const parameters = object({ actions: { type: "array", maxItems: 16, items: { oneOf: [
  object({ ...kind("move"), ...point }, ["type", "x", "y"]),
  object({ ...kind("click"), ...point, button: enumeration(Object.keys(buttons)), ...time }, ["type", "x", "y", "button"]),
  object({ ...kind("key"), key: enumeration(keys), modifiers: { type: "array", maxItems: 3,
    uniqueItems: true, items: enumeration(Object.keys(modifiers)) }, ...time }, ["type", "key"]),
  object({ ...kind("drag"), ...point, end_x: point.x, end_y: point.y,
    button: enumeration(Object.keys(buttons)), ...time }, ["type", "x", "y", "end_x", "end_y", "button"]),
  object({ ...kind("wait"), ...time }, ["type", "milliseconds"]),
] } } }, ["actions"]);

function uint(value, minimum, maximum, label) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw Error(`Invalid ${label}`);
  return value;
}

export function encodeBatch(actions, id) {
  uint(id, 1, 0xffffffff, "request id");
  if (!Array.isArray(actions) || actions.length > 16) throw Error("At most 16 actions per batch");
  const bytes = new Uint8Array(16 + actions.length * 64);
  const view = new DataView(bytes.buffer);
  [magic, 1, id, actions.length].forEach((value, index) => view.setUint32(index * 4, value, true));
  let duration = 0;
  for (const [index, action] of actions.entries()) {
    const schema = parameters.properties.actions.items.oneOf.find(item => item.properties.type.const === action?.type);
    if (!schema || !action || Object.keys(action).some(key => !Object.hasOwn(schema.properties, key)) ||
        schema.required.some(key => !Object.hasOwn(action, key))) throw Error("Invalid action fields");
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
  if (word(0) !== magic || word(1) !== 1 || word(2) !== id || word(7) !== 0 || word(6) !== bytes.byteLength - 32)
    throw Error("Invalid game response");
  if (word(3)) throw Error(`Game input failed (errno ${word(3)})`);
  const png = bytes.subarray(32);
  if (png.length < 8 || ![137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => png[i] === value))
    throw Error("Game response is not a PNG screenshot");
  return { png, frame: word(4), milliseconds: word(5) };
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
  const latest = messages.findLastIndex(message => Array.isArray(message.content) &&
    message.content.some(part => part.type === "image"));
  return messages.map((message, index) => index === latest || !Array.isArray(message.content) ? message :
    { ...message, content: message.content.filter(part => part.type !== "image") });
}

export default function playerTools(pi) {
  const input = connectPlayer(globalThis.__janisBuiltin("fs"), process.env.DOLLY_RTS_PLAYER_DIR);
  pi.on("context", event => ({ messages: modelContext(event.messages) }));
  pi.registerTool({
    name: "game_input",
    label: "game input",
    description: "Send an ordered batch of ordinary mouse/keyboard inputs to your 800x600 player view. " +
      "Maximum 16 actions and 2000 ms total. The game keeps running while you think. " +
      "Returns a fresh screenshot after execution. Send an empty actions array to look without acting. " +
      "Key and click duration defaults to 100 ms, drag to 250 ms. Modifiers apply to key presses only.",
    parameters,
    async execute(_callId, arguments_, signal) {
      const screenshot = await input(arguments_.actions, signal);
      const text = `Your view at game frame ${screenshot.frame}, ${screenshot.milliseconds} ms since launch. ` +
        "The game is still running; this image ages while you think.";
      return { content: [{ type: "text", text }, { type: "image", mimeType: "image/png",
        data: Buffer.from(screenshot.png).toString("base64") }],
        details: { frame: screenshot.frame, milliseconds: screenshot.milliseconds, actions: arguments_.actions } };
    },
  });
}
