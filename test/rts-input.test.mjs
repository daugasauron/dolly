import assert from "node:assert/strict";
import test from "node:test";
import { validateToolArguments } from "@earendil-works/pi-ai";
import playerTools, { encodeBatch, decodeScreenshot, parameters, modelContext, coordinateConvention, describeScreenshot, playerModel } from "../src/rts/player.js";

test("players select providers explicitly without changing OpenRouter defaults", () => {
  assert.deepEqual(playerModel("openai/example:low"), { provider: "openrouter", model: "openai/example:low" });
  assert.deepEqual(playerModel("codex-local::gpt-6-astra:medium"), { provider: "codex-local", model: "gpt-6-astra:medium" });
  for (const value of ["::model", "provider::", "provider::model::extra"]) assert.throws(() => playerModel(value));
});

test("screenshots and input schemas describe player-local, top-left-origin pixel coordinates", () => {
  const caption = describeScreenshot({ frame: 42, milliseconds: 1234, pointer: { x: 345, y: 456 } });
  assert.match(caption, /Mouse pointer: \(345,456\).*not a world object/);
  assert.ok(caption.includes(coordinateConvention));
  assert.match(caption, /800x600.*\(0,0\).*top-left.*799.*599/);
  assert.match(caption, /player 2 must not add 800/);
  assert.match(caption, /frame 42, 1234 ms/);
  const action = parameters.properties.actions.items;
  for (const axis of ["x", "y", "end_x", "end_y"])
    assert.match(action.properties[axis].description, /Absolute pixel.*your own 800x600 screenshot/);
  assert.equal(action.type, "object");
  assert.deepEqual(action.properties.type.enum, ["move", "click", "key", "drag", "wait"]);
});

test("model context preserves intent and two recent views without mutating full history", () => {
  const messages = [
    { role: "user", content: [{ type: "text", text: "Initial view" }, { type: "image", data: "oldest" }] },
    { role: "user", content: [{ type: "text", text: "Play" }, { type: "image", data: "first" }] },
    { role: "assistant", content: [{ type: "text", text: "The selection changed. I will test this control." },
      { type: "toolCall", name: "game_input" }] },
    { role: "toolResult", content: [{ type: "text", text: "frame 42" }, { type: "image", data: "current" }] },
  ];
  const original = structuredClone(messages);
  const context = modelContext(messages);
  assert.deepEqual(context[0].content, [{ type: "text", text: "Initial view" }]);
  assert.match(context[1].content[0].text, /^PREVIOUS screenshot/);
  assert.match(context[3].content[0].text, /^CURRENT screenshot/);
  assert.deepEqual(context[1].content.slice(1), messages[1].content);
  assert.deepEqual(context[2], messages[2]);
  assert.deepEqual(context[3].content.slice(1), messages[3].content);
  assert.deepEqual(messages, original);
  assert.deepEqual(modelContext([]), []);
  const large = structuredClone(messages);
  large[1].content[1].data = "x".repeat(640 * 1024);
  assert.deepEqual(modelContext(large)[1].content, [{ type: "text", text: "Play" }]);
  assert.deepEqual(modelContext(large)[2], large[2], "large pairs retain assistant intent and tools");
  assert.deepEqual(modelContext(large)[3].content.slice(1), large[3].content, "large pairs retain the newest image");
  assert.deepEqual(modelContext([large[1]])[0].content.slice(1), large[1].content, "never strip the only observation");
});

test("upstream Pi accepts the game-input schema and rejects unrelated tools' arguments", () => {
  const tool = { name: "game_input", parameters };
  const arguments_ = { actions: [{ type: "click", x: 20, y: 30, button: "left" }, { type: "key", key: "A" }] };
  assert.deepEqual(validateToolArguments(tool, { name: tool.name, arguments: arguments_ }), arguments_);
  const hover = { actions: [{ type: "move", x: 400, y: 300, milliseconds: 250 }] };
  assert.deepEqual(validateToolArguments(tool, { name: tool.name, arguments: hover }), hover);
  const move = new DataView(encodeBatch(hover.actions, 1).buffer);
  assert.equal(move.getUint32(16, true), 1, "move action");
  assert.equal(move.getUint32(36, true), 0, "no mouse button");
  assert.equal(move.getUint32(40, true), 250, "hover duration");
  assert.throws(() => encodeBatch([{ ...hover.actions[0], button: "left" }], 1), /allowed fields/);
  assert.throws(() => validateToolArguments(tool, { name: tool.name, arguments: { command: "ls" } }));
  assert.throws(() => validateToolArguments(tool, { name: tool.name, arguments: { actions: [{ type: "spawn", unit: "soldier" }] } }));
});

test("ordered RTS inputs have a bounded, little-endian game-local wire format", () => {
  const bytes = encodeBatch([
    { type: "move", x: 17, y: 29 },
    { type: "click", x: 31, y: 41, button: "right" },
    { type: "key", key: "A", modifiers: ["Shift", "Control"] },
    { type: "drag", x: 10, y: 20, end_x: 300, end_y: 400, button: "left", milliseconds: 350 },
    { type: "wait", milliseconds: 500 },
  ], 123);
  assert.equal(bytes.length, 16 + 64 * 5);
  const view = new DataView(bytes.buffer);
  const words = (offset, count) => Array.from({ length: count }, (_, i) => view.getUint32(offset + i * 4, true));
  assert.deepEqual(words(0, 4), [0x31535452, 2, 123, 5]);
  assert.deepEqual(words(16, 8), [1, 17, 29, 0, 0, 0, 16, 0]);
  assert.deepEqual(words(80, 8), [2, 31, 41, 0, 0, 3, 100, 0]);
  assert.deepEqual(words(144, 8), [3, 0, 0, 0, 0, 0, 100, 3]);
  assert.equal(bytes[176], 65);
  assert.equal(bytes[177], 0);
  assert.deepEqual(words(208, 8), [4, 10, 20, 300, 400, 1, 350, 0]);
  assert.deepEqual(words(272, 8), [5, 0, 0, 0, 0, 0, 500, 0]);
  assert.equal(encodeBatch([], 1).length, 16, "empty batches request a fresh view");
  assert.equal(encodeBatch(Array(16).fill({ type: "wait", milliseconds: 125 }), 1).length, 1040);
});

test("invalid or excessive batches fail as a whole before publication", () => {
  const invalid = [
    null, {}, Array(17).fill({ type: "move", x: 0, y: 0 }),
    [{ type: "wait", milliseconds: 2000 }, { type: "move", x: 0, y: 0 }],
    [{ type: "wait", milliseconds: 2001 }], [{ type: "wait", milliseconds: NaN }],
    [{ type: "move", x: 800, y: 0 }], [{ type: "move", x: 0, y: 600 }],
    [{ type: "move", x: -1, y: 0 }], [{ type: "move", x: 1.5, y: 0 }],
    [{ type: "move", x: "1", y: 0 }], [{ type: "move", x: 0 }],
    [{ type: "click", x: 0, y: 0, button: "constructor" }],
    [{ type: "key", key: "A", modifiers: ["Shift", "Shift"] }],
    [{ type: "key", key: "A", modifiers: ["Meta"] }],
    [{ type: "key", key: "A", modifiers: "Shift" }],
    [{ type: "key", key: "rm -rf /" }],
    [{ type: "drag", x: 0, y: 0, end_x: 800, end_y: 0, button: "left" }],
    [{ type: "spawn", unit: "soldier" }],
    [{ type: "click", x: 1, y: 2, button: "left", player: 2 }],
    [{ type: "wait", milliseconds: 16, path: "/other-player" }],
  ];
  for (const actions of invalid) assert.throws(() => encodeBatch(actions, 1), undefined, JSON.stringify(actions));
  for (const id of [0, -1, 1.5, 0x100000000]) assert.throws(() => encodeBatch([], id));
});

test("screenshots are tied to a request and carry the actual capture frame and time", () => {
  const bytes = new Uint8Array(40);
  const view = new DataView(bytes.buffer);
  [0x31535452, 2, 19, 0, 832, 45600, 8, (599 << 16) | 799].forEach((n, i) => view.setUint32(i * 4, n, true));
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 32);
  const screenshot = decodeScreenshot(bytes, 19);
  assert.equal(screenshot.frame, 832);
  assert.equal(screenshot.milliseconds, 45600);
  assert.deepEqual(screenshot.pointer, { x: 799, y: 599 });
  view.setUint32(4, 1, true);
  assert.throws(() => decodeScreenshot(bytes, 19), /Invalid game response/, "old protocol versions must not silently lose pointer feedback");
  view.setUint32(4, 2, true);
  view.setUint16(28, 800, true);
  assert.throws(() => decodeScreenshot(bytes, 19), /pointer coordinates/);
  view.setUint16(28, 799, true);
  assert.deepEqual(screenshot.png, bytes.subarray(32));
  assert.throws(() => decodeScreenshot(bytes, 18), /Invalid game response/);
  assert.throws(() => decodeScreenshot(bytes.subarray(0, 31), 19), /Truncated/);
  assert.throws(() => decodeScreenshot(bytes.subarray(0, 39), 19), /Invalid game response/);
  const outer = new Uint8Array(43);
  outer.set(bytes, 3);
  assert.equal(decodeScreenshot(outer.subarray(3), 19).frame, 832, "respect typed-array offsets");
  view.setUint32(12, 125, true);
  assert.throws(() => decodeScreenshot(bytes, 19), /errno 125/);
  view.setUint32(12, 0, true);
  bytes[32] = 0;
  assert.throws(() => decodeScreenshot(bytes, 19), /not a PNG/);
});

test("Pi allows one batch, cancels its own request, ignores late screenshots and cleans staging", async t => {
  const previousBuiltin = globalThis.__janisBuiltin;
  const previousDirectory = process.env.DOLLY_RTS_PLAYER_DIR;
  t.after(() => {
    if (previousBuiltin === undefined) delete globalThis.__janisBuiltin;
    else globalThis.__janisBuiltin = previousBuiltin;
    if (previousDirectory === undefined) delete process.env.DOLLY_RTS_PLAYER_DIR;
    else process.env.DOLLY_RTS_PLAYER_DIR = previousDirectory;
  });
  const files = new Map();
  let published = () => {}, tool;
  const fs = {
    existsSync: path => files.has(path),
    readFileSync: path => files.get(path),
    writeFileSync: (path, bytes) => files.set(path, new Uint8Array(bytes)),
    unlinkSync(path) { if (!files.delete(path)) throw Object.assign(Error("absent"), { code: "ENOENT" }); },
    renameSync(from, to) { files.set(to, files.get(from)); files.delete(from); published(to); },
  };
  globalThis.__janisBuiltin = name => { assert.equal(name, "fs"); return fs; };
  process.env.DOLLY_RTS_PLAYER_DIR = "/match/player1";
  playerTools({ registerTool: value => { tool = value; }, on(name) { assert.equal(name, "context"); } });
  const response = id => {
    const bytes = new Uint8Array(40), view = new DataView(bytes.buffer);
    [0x31535452, 2, id, 0, id * 100, id * 200, 8, 0].forEach((n, i) => view.setUint32(i * 4, n, true));
    bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 32);
    files.set("/match/player1/response", bytes);
  };
  const cancellation = new AbortController();
  const pending = tool.execute("call1", { actions: [] }, cancellation.signal);
  await assert.rejects(tool.execute("call2", { actions: [] }), /already running/);
  cancellation.abort();
  await assert.rejects(pending, /cancelled/);
  assert.equal(new DataView(files.get("/match/player1/cancel").buffer).getUint32(0, true), 1);
  published = path => {
    if (path.endsWith("/request")) {
      response(1);
      setTimeout(() => response(2), 35);
    }
  };
  const result = await tool.execute("call3", { actions: [] });
  assert.ok(tool.description.includes(coordinateConvention));
  assert.equal(result.content[0].text, describeScreenshot({ frame: 200, milliseconds: 400, pointer: { x: 0, y: 0 } }));
  assert.equal(result.details.frame, 200);
  assert.equal(result.content[1].mimeType, "image/png");
  assert.ok([...files.keys()].every(path => path.startsWith("/match/player1/") && !path.endsWith(".tmp")));
  assert.equal(files.has("/match/player1/response"), false);
  const before = [...files];
  await assert.rejects(tool.execute("invalid", { actions: [{ type: "spawn", unit: "soldier" }] }));
  assert.deepEqual([...files], before, "validation failure must not publish any input");
});
