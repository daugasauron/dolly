// The control block a process thread's Worker and the supervisor share: a
// SharedArrayBuffer of Int32 words, then a call's fields as doubles, written by
// trusted JavaScript on both sides (process-supervisor.mjs, process-worker.mjs).
export const controlWord = Object.freeze({
  // The sequence of the Worker's latest call, and the one the supervisor answered.
  call: 0, answered: 1,
  // The answer's low and high 32 bits.
  resultLow: 2, resultHigh: 3,
  // 1 while the Worker copies a request into its mailbox, 2 once the supervisor sealed it.
  copy: 4,
  // A thread's start: 1 once its Worker runs, 2 when the supervisor ended it before.
  start: 5,
  // The doorbell, which the supervisor waits on: a call rings it with its sequence once its
  // fields are written, and the Worker's start rings it too.
  doorbell: 6,
  // 1 once the Worker has started, set before it rings for that.
  started: 7,
});
// A call's fields after the words, as doubles, in this order.
export const callFields = Object.freeze(["operation", "requestAddress", "requestSize", "responseAddress",
  "responseCapacity", "memoryBytes"]);
export const callFieldsOffset = 4 * Object.keys(controlWord).length;
export const controlBytes = callFieldsOffset + 8 * callFields.length;
