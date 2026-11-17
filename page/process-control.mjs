// The control block a process thread's Worker and the supervisor share: a
// SharedArrayBuffer of Int32 words, written by trusted JavaScript on both
// sides (process-supervisor.mjs, process-worker.mjs).
export const controlBytes = 32;
export const controlWord = Object.freeze({
  // The sequence of the Worker's latest call, and the one the supervisor answered.
  call: 0, answered: 1,
  // The answer's low and high 32 bits.
  resultLow: 2, resultHigh: 3,
  // 1 while the Worker copies a request into its mailbox, 2 once the supervisor sealed it.
  copy: 4,
  // A thread's start: 1 once its Worker runs, 2 when the supervisor ended it before.
  start: 5,
});
