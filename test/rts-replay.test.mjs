import assert from "node:assert/strict";
import test from "node:test";
import { replayInputs, replayTimeline, frameAt } from "../src/rts/spectator/replay.mjs";
import { traceText } from "../src/rts/spectator/trace.mjs";

test("recorded inputs retain player-local coordinates, order, frame and duration", () => {
  const result = replayInputs("response id=1 frame=2 ms=100 status=0\n" +
    "action id=2 index=0 frame=10 ms=500 kind=2 x=321 y=432 end_x=0 end_y=0 button=3 duration=100 modifiers=0 key=\n" +
    "action id=2 index=1 frame=12 ms=620 kind=3 x=0 y=0 end_x=0 end_y=0 button=0 duration=100 modifiers=3 key=Left\n");
  assert.equal(result.actions.length, 144);
  assert.deepEqual([0, 4, 8, 12, 16, 28, 32].map(offset => result.actions.readUInt32LE(offset)),
    [10, 500, 2, 321, 432, 3, 100]);
  assert.equal(result.actions.readUInt32LE(72 + 36), 3);
  assert.equal(result.actions.subarray(112, 116).toString(), "Left");
  assert.equal(result.timing.length, 24);
  assert.throws(() => replayInputs("response frame=2 ms=100\nresponse frame=3 ms=99"), /Non-monotonic/);
  assert.throws(() => replayInputs("broken"), /Invalid/);
});

test("replay merges traces by recorded time and interpolates continuous native frames", () => {
  const players = [1, 2].map(player => [
    { time: 1000, type: "start", model: `model${player}` },
    { time: 1100, type: "observation", frame: 2, milliseconds: 100 },
    { time: 1300 + player, type: "usage", usage: { cost: { total: player } } },
    { time: 1600, type: "tool_result", details: { frame: 12 } },
  ]);
  const source = structuredClone(players);
  const timeline = replayTimeline({ models: ["a", "b"], started: 1000, budgetUSD: 4 }, players);
  assert.deepEqual(players, source);
  assert.deepEqual(timeline.events.filter(event => event.type === "usage").map(event => event.reportedUSD), [1, 3]);
  assert.equal(frameAt(timeline.clocks[0], 900), 1);
  assert.equal(frameAt(timeline.clocks[0], 1350), 7);
  assert.equal(frameAt(timeline.clocks[0], 1700), 14);
  assert.match(traceText(timeline.events[0]), /Player 1: model1/);
  assert.equal(traceText({ type: "thinking_delta", delta: "recorded thoughts" }), "recorded thoughts");
  assert.match(traceText({ type: "tool", name: "game_input", args: { actions: [] } }), /game_input.*actions/);
  assert.throws(() => replayTimeline({ models: ["a", "b"], started: 2000 }, players), /timestamp/);
});
