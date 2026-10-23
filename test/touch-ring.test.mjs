import assert from "node:assert/strict";
import test from "node:test";
import * as T from "../host/touch/abi.mjs";
import { TouchTransport } from "../host/touch/touch.mjs";

const fields = ["id", "phase", "x", "y", "pressure", "dropped", "time", "lease"];
// A transport whose ring has 32 records, and the records it holds, oldest first.
function ring() {
  const transport = new TouchTransport(new SharedArrayBuffer(4096), 64, { capacity: 32 }), words = transport.words;
  const word = name => 16 + T[`DOLLY_TOUCH_WORD_${name.toUpperCase()}`];
  return {
    transport,
    hold: lease => Atomics.store(words, word("lease"), lease),
    take: () => {
      const read = words[word("read")], count = words[word("write")] - read;
      words[word("read")] += count;
      return Array.from({ length: count }, (_, index) => Object.fromEntries(fields.map((field, at) =>
        [field, transport.view.getInt32(64 + 16 + ((read + index) & 31) * 32 + at * 4, true)])));
    },
  };
}
const at = (x, time = 0) => ({ x, y: 2 * x, pressure: 500, time });

test("a finger is the touch module's only while a program holds the lease, and keeps its id to its end", () => {
  const { transport, hold, take } = ring();
  assert.equal(transport.finger(T.DOLLY_TOUCH_DOWN, 7, [at(1)]), false, "without a holder a finger is input@0's");
  assert.equal(transport.finger(T.DOLLY_TOUCH_MOVE, 7, [at(2)]), false);
  hold(5);
  assert.equal(transport.finger(T.DOLLY_TOUCH_MOVE, 7, [at(3)]), false, "a finger down before the hold stays input@0's");
  assert.equal(transport.finger(T.DOLLY_TOUCH_DOWN, 8, [at(4, 10)]), true);
  assert.equal(transport.finger(T.DOLLY_TOUCH_DOWN, 9, [at(5, 11)]), true);
  assert.equal(transport.finger(T.DOLLY_TOUCH_MOVE, 8, [at(6, 12), at(7, 13)]), true, "coalesced moves are each a record");
  assert.equal(transport.finger(T.DOLLY_TOUCH_UP, 8, [at(7, 14)]), true);
  assert.equal(transport.finger(T.DOLLY_TOUCH_CANCEL, 9, [at(5, 15)]), true);
  assert.deepEqual(take().map(({ id, phase, x, y, time, lease }) => [id, phase, x, y, time, lease]), [
    [1, T.DOLLY_TOUCH_DOWN, 4, 8, 10, 5], [2, T.DOLLY_TOUCH_DOWN, 5, 10, 11, 5], [1, T.DOLLY_TOUCH_MOVE, 6, 12, 12, 5],
    [1, T.DOLLY_TOUCH_MOVE, 7, 14, 13, 5], [1, T.DOLLY_TOUCH_UP, 7, 14, 14, 5], [2, T.DOLLY_TOUCH_CANCEL, 5, 10, 15, 5]]);
  // A finger of an earlier lease is nobody's: neither the new holder's nor the pointer.
  assert.equal(transport.finger(T.DOLLY_TOUCH_DOWN, 10, [at(1)]), true);
  hold(6);
  assert.equal(transport.finger(T.DOLLY_TOUCH_MOVE, 10, [at(2)]), true);
  assert.equal(transport.finger(T.DOLLY_TOUCH_UP, 10, [at(2)]), true);
  assert.equal(transport.finger(T.DOLLY_TOUCH_DOWN, 10, [at(3)]), true);
  assert.deepEqual(take().map(({ id, phase, lease }) => [id, phase, lease]), [[3, T.DOLLY_TOUCH_DOWN, 5], [4, T.DOLLY_TOUCH_DOWN, 6]]);
});

test("moves leave room for every finger's down and end; what finds none is counted in the next record", () => {
  const { transport, hold, take } = ring();
  hold(1);
  for (let pointer = 0; pointer < T.DOLLY_TOUCH_FINGERS + 1; ++pointer) transport.finger(T.DOLLY_TOUCH_DOWN, pointer, [at(pointer)]);
  assert.equal(take().length, T.DOLLY_TOUCH_FINGERS, "an eleventh finger is not delivered");
  // 32 records, 20 kept for downs and ends: 12 moves fit, 8 do not.
  transport.finger(T.DOLLY_TOUCH_MOVE, 0, Array.from({ length: 20 }, (_, index) => at(index)));
  assert.equal(transport.free(), 2 * T.DOLLY_TOUCH_FINGERS);
  for (let pointer = 0; pointer < T.DOLLY_TOUCH_FINGERS; ++pointer) transport.finger(T.DOLLY_TOUCH_UP, pointer, [at(pointer)]);
  const records = take();
  assert.equal(records.length, 12 + T.DOLLY_TOUCH_FINGERS);
  assert.deepEqual([records[0].dropped, records[1].dropped, records[12].phase, records[12].dropped, records[13].dropped],
    [1, 0, T.DOLLY_TOUCH_UP, 8, 0], "the eleventh finger's down, then eight moves, were dropped");
  // Twenty taps unread: each down keeps room for its end, and a down that finds none takes its finger with it.
  for (let pointer = 0; pointer < 20; ++pointer) {
    transport.finger(T.DOLLY_TOUCH_DOWN, 100 + pointer, [at(pointer)]);
    transport.finger(T.DOLLY_TOUCH_UP, 100 + pointer, [at(pointer)]);
  }
  transport.finger(T.DOLLY_TOUCH_DOWN, 200, [at(0)]);
  transport.finger(T.DOLLY_TOUCH_UP, 200, [at(0)]);
  assert.deepEqual(take().map(({ phase }) => phase), Array.from({ length: 32 }, (_, index) => index % 2 ? T.DOLLY_TOUCH_UP : T.DOLLY_TOUCH_DOWN));
});
