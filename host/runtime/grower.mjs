// Grows a shared memory while the thread that asked waits (runtime.mjs): each
// request brings its own control, whose first value, the pages asked, becomes
// the old size in pages or -1, and whose third word then becomes 1.
onmessage = ({ data: { memory, control } }) => {
  const values = new BigInt64Array(control), word = new Int32Array(control);
  try { values[0] = BigInt(memory.grow(values[0])); } catch { values[0] = -1n; }
  Atomics.store(word, 2, 1);
  Atomics.notify(word, 2);
};
postMessage("ready");
