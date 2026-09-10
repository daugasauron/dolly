// Bounded, versioned application input packets. SPDX-License-Identifier: GPL-2.0-or-later
export function createInputCodec({ magic, version, width, height, look = false, text = false }) {
  const kinds = { move: 1, click: 2, key: 3, drag: 4, wait: 5, ...(look ? { look: 6 } : {}), ...(text ? { text: 7 } : {}) };
  const stride = text ? 288 : 64;
  const buttons = { left: 1, middle: 2, right: 3 };
  const modifiers = { Shift: 1, Control: 2, Alt: 4 };
  const keys = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", "Space", "Return", "Escape", "Tab",
    "Backspace", "Delete", "Left", "Right", "Up", "Down", "Home", "End", "PageUp", "PageDown",
    ...Array.from({ length: 12 }, (_, index) => `F${index + 1}`)];
  const integer = (minimum, maximum) => ({ type: "integer", minimum, maximum });
  const enumeration = values => ({ type: "string", enum: values });
  const object = (properties, required) => ({ type: "object", properties, required, additionalProperties: false });
  const point = {
    x: { ...integer(0, width - 1), description: `Absolute pixel x in your own ${width}x${height} screenshot, measured rightward from its left edge.` },
    y: { ...integer(0, height - 1), description: `Absolute pixel y in your own ${width}x${height} screenshot, measured downward from its top edge.` },
  };
  const fields = {
    move: ["x", "y"], click: ["x", "y", "button"], key: ["key"],
    drag: ["x", "y", "end_x", "end_y", "button"], wait: ["milliseconds"],
    ...(look ? { look: ["dx", "dy"] } : {}),
    ...(text ? { text: ["text"] } : {}),
  };
  const parameters = object({ actions: { type: "array", maxItems: 16, items: object({
    type: { ...enumeration(Object.keys(kinds)), description:
      "move: x,y, no button press (aim/hover); click: x,y,button; key: key and optional modifiers; drag: x,y,end_x,end_y,button; wait: milliseconds." + (look ? " look: relative mouse dx,dy in pixels; positive dx turns right, positive dy looks down." : "") },
    ...point, end_x: point.x, end_y: point.y,
    ...(look ? { dx: integer(-1600, 1600), dy: integer(-1600, 1600) } : {}),
    ...(text ? { text: { type: "string", minLength: 1, maxLength: 255, description: "Type UTF-8 text into the focused game field (at most 255 bytes). No control characters; send Return separately to submit." } } : {}),
    button: enumeration(Object.keys(buttons)), key: enumeration(keys),
    modifiers: { type: "array", maxItems: 3, uniqueItems: true, items: enumeration(Object.keys(modifiers)) },
    milliseconds: { ...integer(16, 2000), description: "Input duration, or time to remain at a moved pointer position." },
  }, ["type"]) } }, ["actions"]);

  function boundedInteger(value, minimum, maximum, label) {
    if (!Number.isInteger(value) || value < minimum || value > maximum) throw Error(`Invalid ${label}`);
    return value;
  }

  function encodeBatch(actions, id) {
    boundedInteger(id, 1, 0xffffffff, "request id");
    if (!Array.isArray(actions) || actions.length > 16) throw Error("At most 16 actions per batch");
    const bytes = new Uint8Array(16 + actions.length * stride);
    const view = new DataView(bytes.buffer);
    [magic, version, id, actions.length].forEach((value, index) => view.setUint32(index * 4, value, true));
    let duration = 0;
    for (const [index, action] of actions.entries()) {
      if (!action || !Object.hasOwn(fields, action.type)) throw Error("Unknown game input type");
      const required = fields[action.type];
      const allowed = ["type", "milliseconds", ...required, ...(action.type === "key" ? ["modifiers"] : [])];
      if (Object.keys(action).some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(action, key)))
        throw Error(`${action.type} requires ${required.join(", ")}; allowed fields: ${allowed.join(", ")}. No actions were executed.`);
      const type = kinds[action.type];
      const milliseconds = boundedInteger(action.milliseconds ?? (type === 1 ? 16 : type === 4 ? 250 : 100), 16, 2000, "duration");
      duration += milliseconds;
      if (duration > 2000) throw Error("A batch may occupy at most 2000 milliseconds");
      let x = 0, y = 0, endX = 0, endY = 0, button = 0, modifier = 0;
      if (type === 1 || type === 2 || type === 4) {
        x = boundedInteger(action.x, 0, width - 1, "x coordinate");
        y = boundedInteger(action.y, 0, height - 1, "y coordinate");
      }
      if (type === 6) {
        x = boundedInteger(action.dx, -1600, 1600, "relative x");
        y = boundedInteger(action.dy, -1600, 1600, "relative y");
      }
      if (type === 4) {
        endX = boundedInteger(action.end_x, 0, width - 1, "drag x coordinate");
        endY = boundedInteger(action.end_y, 0, height - 1, "drag y coordinate");
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
        bytes.set(new TextEncoder().encode(action.key), 16 + index * stride + 32);
      }
      if (type === 7) {
        if (typeof action.text !== "string" || !action.text || /[\u0000-\u001f\u007f]/.test(action.text)) throw Error("Text must be nonempty and contain no control characters");
        const encoded = new TextEncoder().encode(action.text);
        if (encoded.length > 255 || new TextDecoder().decode(encoded) !== action.text) throw Error("Text must be valid UTF-8, at most 255 bytes");
        bytes.set(encoded, 16 + index * stride + 32);
      }
      [type, x, y, endX, endY, button, milliseconds, modifier].forEach((value, word) =>
        view.setUint32(16 + index * stride + word * 4, value, true));
    }
    return bytes;
  }

  function decodeScreenshot(bytes, id) {
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
    if (pointer.x >= width || pointer.y >= height) throw Error("Invalid screenshot pointer coordinates");
    return { png, frame: word(4), milliseconds: word(5), pointer };
  }

  return { parameters, encodeBatch, decodeScreenshot };
}
