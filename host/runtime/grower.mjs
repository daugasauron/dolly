// Grows the kernel's memory for the runtime Worker, which waits meanwhile
// (runtime.mjs): word 0 is 1 while a growth by values[1] pages is asked, and
// the old size in pages, or -1, replaces that count.
onmessage = ({ data: { memory, control } }) => {
  const values = new BigInt64Array(control), word = new Int32Array(control);
  postMessage("waiting");
  for (;;) {
    // A notify can be the runtime Worker's for a growth done already.
    while (Atomics.load(word, 0) === 0) Atomics.wait(word, 0, 0);
    try { values[1] = BigInt(memory.grow(values[1])); } catch { values[1] = -1n; }
    Atomics.store(word, 0, 0);
    Atomics.notify(word, 0);
  }
};
