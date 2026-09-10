// SPDX-License-Identifier: GPL-2.0-or-later
import { createInputCodec } from "../../rts/codec.mjs";
import { connectPlayer, modelContext } from "../../rts/player.js";
const wire = createInputCodec({ magic: 0x31424343, version: 2, width: 640, height: 480, look: true, text: true });
export const codec = { ...wire, encodeBatch: (actions, id) => wire.encodeBatch(Array.isArray(actions)
  ? actions.map(action => {
    if (action?.type === "click" && !Object.hasOwn(action, "x") && !Object.hasOwn(action, "y")) return { ...action, x: 320, y: 240 };
    if (action?.type === "look" && (Object.hasOwn(action, "dx") || Object.hasOwn(action, "dy"))) return { dx: 0, dy: 0, ...action };
    return action;
  }) : actions, id) };
codec.parameters.properties.actions.items.properties.type.description =
  "look: relative dx and/or dy pixels (omitted axis is 0); click: button, with optional x,y (default center 320,240); " +
  "move: absolute x,y in menus; drag: x,y,end_x,end_y,button; key: key and optional modifiers; text: text to type into chat or a focused field; wait: milliseconds.";
export const connect = (fs, directory, firstId = 1) => connectPlayer(fs, directory, firstId, codec);
export const describe = image => `ClassiCube screenshot at frame ${image.frame}, ${image.milliseconds} ms. ` +
  "The world keeps running while you think. Image coordinates are 640x480, top-left (0,0). " +
  "In gameplay, look uses relative mouse pixels and clicks act at the center crosshair (320,240). " +
  "In menus, move/click/drag use absolute screenshot pixels. Positive look dx turns right; positive dy looks down.";

export default function playerTools(pi) {
  const input = connect(globalThis.__janisBuiltin("fs"), process.env.DOLLY_CLASSICUBE_DIR);
  pi.on("context", event => ({ messages: modelContext(event.messages) }));
  pi.registerTool({ name: "game_input", label: "game input", parameters: codec.parameters,
    description: "Operate ClassiCube using ordinary mouse/keyboard input and screenshots. " +
      "Maximum 16 sequential actions and 2000 ms total requested duration. Each call returns a fresh 640x480 PNG. " +
      "An empty actions array observes. look uses relative dx/dy pixels; positive dx turns right and positive dy down. " +
      "Gameplay clicks break/place at the crosshair: {type:'click',button:'right'} places a block. " +
      "Optional x,y defaults to (320,240); supply absolute x,y to select menus and inventory. " +
      "WASD moves, Space jumps, B opens inventory, number keys select hotbar slots, Escape opens/closes menus. " +
      "To chat, send [{type:'key',key:'T'},{type:'text',text:'Hello everyone!'},{type:'key',key:'Return'}]. " +
      "Use text for complete messages, spaces, punctuation and Unicode (at most 255 UTF-8 bytes per action). Printable key actions also emit their US keyboard character. " +
      "All keys and buttons are released after their duration. Before acting, briefly describe your observation and intent in assistant text.",
    async execute(_id, arguments_, signal) {
      const image = await input(arguments_.actions, signal);
      return { content: [{ type: "text", text: describe(image) },
        { type: "image", mimeType: "image/png", data: Buffer.from(image.png).toString("base64") }],
        details: { frame: image.frame, milliseconds: image.milliseconds, actions: arguments_.actions } };
    },
  });
}
